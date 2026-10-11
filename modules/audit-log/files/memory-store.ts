// SPDX-License-Identifier: Apache-2.0
// In-memory AuditStore for tests and prototypes. Per-process and lost on restart. It ignores `tx`, so it cannot
// commit an entry atomically with a database change; use sql-store.ts (or an equivalent that writes through the
// caller's transaction) in production. Appends for one tenant are serialized with a promise chain.
import { GENESIS_HASH } from "./core.js";
import type { AuditEntry, AuditFilter, AuditStore, ChainHead } from "./core.js";

function matches(entry: AuditEntry, filter: AuditFilter): boolean {
  if (filter.actorId !== undefined && entry.actorId !== filter.actorId) return false;
  if (filter.action !== undefined && entry.action !== filter.action) return false;
  if (filter.actionPrefix !== undefined && !entry.action.startsWith(filter.actionPrefix)) return false;
  if (filter.from !== undefined && entry.at < filter.from) return false;
  if (filter.to !== undefined && entry.at >= filter.to) return false;
  return true;
}

const copy = (entry: AuditEntry): AuditEntry => structuredClone(entry);

export class MemoryAuditStore implements AuditStore<unknown> {
  readonly #entries = new Map<string, AuditEntry[]>();
  readonly #heads = new Map<string, ChainHead>();
  readonly #locks = new Map<string, Promise<unknown>>();

  async append(_tx: unknown, tenantId: string, build: (head: ChainHead) => Promise<AuditEntry>): Promise<AuditEntry> {
    const previous = this.#locks.get(tenantId) ?? Promise.resolve();
    const run = previous.catch(() => undefined).then(async () => {
      const head = this.#heads.get(tenantId) ?? { seq: 0, hash: GENESIS_HASH, anchorSeq: 0, anchorHash: GENESIS_HASH };
      const entry = await build(head);
      if (entry.tenantId !== tenantId || entry.seq !== head.seq + 1 || entry.prevHash !== head.hash) throw new Error("Entry does not extend the chain");
      const list = this.#entries.get(tenantId) ?? [];
      list.push(copy(entry));
      this.#entries.set(tenantId, list);
      this.#heads.set(tenantId, { ...head, seq: entry.seq, hash: entry.hash });
      return copy(entry);
    });
    this.#locks.set(tenantId, run);
    return run;
  }

  async head(tenantId: string): Promise<ChainHead | null> {
    const head = this.#heads.get(tenantId);
    return head ? { ...head } : null;
  }

  async page(tenantId: string, query: AuditFilter & { readonly beforeSeq: number | null; readonly limit: number }): Promise<AuditEntry[]> {
    const out: AuditEntry[] = [];
    const list = this.#entries.get(tenantId) ?? [];
    for (let i = list.length - 1; i >= 0 && out.length < query.limit; i--) {
      const entry = list[i]!;
      if (query.beforeSeq !== null && entry.seq >= query.beforeSeq) continue;
      if (matches(entry, query)) out.push(copy(entry));
    }
    return out;
  }

  async scan(tenantId: string, afterSeq: number, uptoSeq: number, limit: number): Promise<AuditEntry[]> {
    return (this.#entries.get(tenantId) ?? []).filter((entry) => entry.seq > afterSeq && entry.seq <= uptoSeq).slice(0, limit).map(copy);
  }

  async purge(tenantId: string, before: number): Promise<number> {
    const list = this.#entries.get(tenantId);
    const head = this.#heads.get(tenantId);
    if (!list || !head) return 0;
    let count = 0;
    while (count < list.length && list[count]!.at < before) count++;
    if (count === 0) return 0;
    const last = list[count - 1]!;
    this.#entries.set(tenantId, list.slice(count));
    this.#heads.set(tenantId, { ...head, anchorSeq: last.seq, anchorHash: last.hash });
    return count;
  }

  async tenants(): Promise<string[]> {
    return [...this.#heads.keys()].sort();
  }
}
