// SPDX-License-Identifier: Apache-2.0
// In-memory FeatureFlagStore for tests and prototypes. Per-process and lost on restart, so it cannot share runtime
// config between servers: production needs a shared database (see schema.sql and sql-store.ts). Every method copies
// data in and out, and each check-and-write runs without an await, so it is atomic within one process.
import type {
  FeatureFlagStore, FlagAssignment, FlagAuditEntry, FlagChange, FlagConfig, FlagConversion, FlagExposure, VariantCount,
} from "./core.js";

const copy = <T>(value: T): T => structuredClone(value);

export class MemoryFeatureFlagStore implements FeatureFlagStore {
  readonly #flags = new Map<string, FlagConfig>();
  readonly #audit: FlagAuditEntry[] = [];
  readonly #assignments = new Map<string, FlagAssignment>();
  readonly #exposures = new Map<string, FlagExposure>();
  readonly #conversions = new Map<string, FlagConversion>();

  /** Optionally seed flags (for tests); seeding writes no audit entries. */
  constructor(seed: readonly FlagConfig[] = []) {
    for (const flag of seed) this.#flags.set(flag.key, copy(flag));
  }

  /** Copies of recorded exposures (for tests). */
  dumpExposures(): FlagExposure[] {
    return [...this.#exposures.values()].map(copy);
  }

  async listFlags(): Promise<FlagConfig[]> {
    return [...this.#flags.values()].sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0)).map(copy);
  }

  async getFlag(key: string): Promise<FlagConfig | null> {
    const flag = this.#flags.get(key);
    return flag ? copy(flag) : null;
  }

  async commitFlagChange(change: FlagChange): Promise<boolean> {
    const current = this.#flags.get(change.key);
    if (change.expectedVersion === null ? current !== undefined : current?.version !== change.expectedVersion) return false;
    if (change.next) this.#flags.set(change.key, copy(change.next));
    else this.#flags.delete(change.key);
    this.#audit.push(copy(change.audit));
    return true;
  }

  async listAudit(query: { readonly flagKey?: string; readonly limit: number }): Promise<FlagAuditEntry[]> {
    const out: FlagAuditEntry[] = [];
    for (let i = this.#audit.length - 1; i >= 0 && out.length < query.limit; i--) {
      const entry = this.#audit[i] as FlagAuditEntry;
      if (query.flagKey === undefined || entry.flagKey === query.flagKey) out.push(copy(entry));
    }
    return out;
  }

  async getAssignment(flagKey: string, runId: string, subjectKey: string): Promise<FlagAssignment | null> {
    const row = this.#assignments.get(JSON.stringify([flagKey, runId, subjectKey]));
    return row ? copy(row) : null;
  }

  async putAssignmentIfAbsent(assignment: FlagAssignment): Promise<FlagAssignment> {
    const id = JSON.stringify([assignment.flagKey, assignment.runId, assignment.subjectKey]);
    const existing = this.#assignments.get(id);
    if (existing) return copy(existing);
    this.#assignments.set(id, copy(assignment));
    return copy(assignment);
  }

  async replaceAssignmentVariant(flagKey: string, runId: string, unitId: string, from: string | null, to: string | null): Promise<number> {
    let changed = 0;
    for (const [id, row] of this.#assignments) {
      if (row.flagKey !== flagKey || row.runId !== runId || row.unitId !== unitId || row.variant !== from) continue;
      this.#assignments.set(id, { ...row, variant: to });
      changed++;
    }
    return changed;
  }

  async copyAssignments(fromSubjectKey: string, toSubjectKey: string, at: number): Promise<number> {
    let copied = 0;
    for (const row of [...this.#assignments.values()]) {
      if (row.subjectKey !== fromSubjectKey) continue;
      const id = JSON.stringify([row.flagKey, row.runId, toSubjectKey]);
      if (this.#assignments.has(id)) continue;
      this.#assignments.set(id, { ...row, subjectKey: toSubjectKey, assignedAt: at });
      copied++;
    }
    return copied;
  }

  async recordExposure(exposure: FlagExposure): Promise<boolean> {
    const id = JSON.stringify([exposure.flagKey, exposure.runId, exposure.unitId]);
    if (this.#exposures.has(id)) return false;
    this.#exposures.set(id, copy(exposure));
    return true;
  }

  async recordConversion(conversion: FlagConversion): Promise<boolean> {
    const id = JSON.stringify([conversion.flagKey, conversion.runId, conversion.metric, conversion.unitId]);
    if (this.#conversions.has(id)) return false;
    this.#conversions.set(id, copy(conversion));
    return true;
  }

  async exposureCounts(flagKey: string, runId: string): Promise<VariantCount[]> {
    const counts = new Map<string | null, number>();
    for (const e of this.#exposures.values()) if (e.flagKey === flagKey && e.runId === runId) counts.set(e.variant, (counts.get(e.variant) ?? 0) + 1);
    return [...counts].map(([variant, count]) => ({ variant, count }));
  }

  async conversionCounts(flagKey: string, runId: string, metric: string): Promise<VariantCount[]> {
    const counts = new Map<string | null, number>();
    for (const c of this.#conversions.values()) {
      if (c.flagKey !== flagKey || c.runId !== runId || c.metric !== metric) continue;
      const exposure = this.#exposures.get(JSON.stringify([flagKey, runId, c.unitId]));
      if (!exposure) continue;
      counts.set(exposure.variant, (counts.get(exposure.variant) ?? 0) + 1);
    }
    return [...counts].map(([variant, count]) => ({ variant, count }));
  }
}
