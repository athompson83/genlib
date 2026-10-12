// SPDX-License-Identifier: Apache-2.0
// In-memory SlugStore for tests and prototypes. Per-process and lost on restart: production needs a table with a
// unique (scope, slug) key and a unique current slug per (scope, entity) (see schema.sql and sql-store.ts). Every
// method checks and writes without an await in between, so each one is atomic within one process.
import type { InsertOutcome, RenameOutcome, SlugRecord, SlugStore } from "./core.js";

export class MemorySlugStore implements SlugStore {
  /** scope -> slug -> record */
  readonly #scopes = new Map<string, Map<string, SlugRecord>>();

  #scope(scope: string): Map<string, SlugRecord> {
    let map = this.#scopes.get(scope);
    if (!map) { map = new Map(); this.#scopes.set(scope, map); }
    return map;
  }

  #current(map: Map<string, SlugRecord>, entityId: string): SlugRecord | undefined {
    for (const record of map.values()) if (record.entityId === entityId && record.retiredAt === undefined) return record;
    return undefined;
  }

  /** Copies of every stored row (for tests). */
  dump(): SlugRecord[] {
    return [...this.#scopes.values()].flatMap((map) => [...map.values()].map((record) => ({ ...record })));
  }

  async takenAmong(scope: string, slugs: readonly string[]): Promise<readonly string[]> {
    const map = this.#scopes.get(scope);
    return map ? slugs.filter((slug) => map.has(slug)) : [];
  }

  async insert(record: SlugRecord): Promise<InsertOutcome> {
    const map = this.#scope(record.scope);
    if (map.has(record.slug)) return "slug-taken";
    if (this.#current(map, record.entityId)) return "entity-exists";
    const { retiredAt: _ignored, ...current } = record;
    map.set(record.slug, current);
    return "inserted";
  }

  async rename(scope: string, entityId: string, slug: string, now: number): Promise<RenameOutcome> {
    const map = this.#scope(scope);
    const current = this.#current(map, entityId);
    if (!current) return "not-found";
    if (current.slug === slug) return "unchanged";
    const target = map.get(slug);
    if (target && target.entityId !== entityId) return "slug-taken";
    map.set(current.slug, { ...current, retiredAt: now });
    if (target) {
      const { retiredAt: _ignored, ...reclaimed } = target;
      map.set(slug, reclaimed);
    } else {
      map.set(slug, { scope, slug, entityId, createdAt: now });
    }
    return "renamed";
  }

  async lookup(scope: string, slug: string): Promise<{ entityId: string; current: string } | null> {
    const map = this.#scopes.get(scope);
    const record = map?.get(slug);
    if (!map || !record) return null;
    const current = this.#current(map, record.entityId);
    return current ? { entityId: record.entityId, current: current.slug } : null;
  }

  async history(scope: string, entityId: string): Promise<SlugRecord[]> {
    const map = this.#scopes.get(scope);
    if (!map) return [];
    return [...map.values()]
      .filter((record) => record.entityId === entityId)
      .sort((a, b) => a.createdAt - b.createdAt || (a.slug < b.slug ? -1 : 1))
      .map((record) => ({ ...record }));
  }

  async remove(scope: string, entityId: string): Promise<number> {
    const map = this.#scopes.get(scope);
    if (!map) return 0;
    let removed = 0;
    for (const [slug, record] of map) if (record.entityId === entityId) { map.delete(slug); removed++; }
    return removed;
  }
}
