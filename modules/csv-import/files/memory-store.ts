// SPDX-License-Identifier: Apache-2.0
// In-memory ImportStore for tests and prototypes. Per-process and lost on restart: production needs
// a table (id primary key, tenant_id, user_id, status, expires_at, headers/rows/mapping/errors/result
// as JSON) and a conditional update for every status change, e.g.
//   UPDATE imports SET status = $3, result = $4 WHERE id = $1 AND status = $2 RETURNING id;
// plus a scheduled DELETE FROM imports WHERE expires_at < now() to drop expired staging data.
import type { ImportPatch, ImportRecord, ImportStatus, ImportStore } from "./core.js";

export class MemoryImportStore implements ImportStore {
  readonly #byId = new Map<string, ImportRecord>();

  async insert(record: ImportRecord): Promise<void> {
    if (this.#byId.has(record.id)) throw new Error("Duplicate import id");
    this.#byId.set(record.id, structuredClone(record));
  }

  async get(id: string): Promise<ImportRecord | null> {
    const record = this.#byId.get(id);
    return record ? structuredClone(record) : null;
  }

  async update(id: string, from: ImportStatus, patch: ImportPatch): Promise<boolean> {
    const record = this.#byId.get(id);
    if (!record || record.status !== from) return false;
    this.#byId.set(id, { ...record, ...structuredClone(patch) });
    return true;
  }

  async delete(id: string): Promise<void> {
    this.#byId.delete(id);
  }

  /** Removes imports whose expiresAt is at or before `now`; returns how many were removed. */
  async deleteExpired(now: number): Promise<number> {
    let removed = 0;
    for (const [id, record] of this.#byId) if (record.expiresAt <= now) { this.#byId.delete(id); removed++; }
    return removed;
  }
}
