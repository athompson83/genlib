// SPDX-License-Identifier: Apache-2.0
// In-memory KeysetSource over any array or iterable, for tests, prototypes and small server-side lists. It applies
// the same rules as the SQL source: scope and filters as equality (arrays as "any of"), then rows strictly after the
// cursor tuple in the requested order, then the limit. Read the collection fresh on every fetch so concurrent
// inserts and deletes between pages are visible, exactly as they would be in a database.
import { compareKeys } from "./core.js";
import type { CursorValue, Filters, KeyedRow, KeysetFetch, KeysetSource, Scope } from "./core.js";

export interface MemoryKeysetSourceOptions<T> {
  /** Returns the current rows. Called once per fetch. */
  readonly items: () => Iterable<T>;
  /**
   * Whether a row belongs to the scope and matches the filters. Default: every scope and filter key equals the row's
   * property of the same name; an array filter matches any listed value.
   */
  readonly matches?: (item: T, scope: Scope, filters: Filters) => boolean;
  /** Reads a sort value. Default: item[key]. The pager uses these keys too (fetchWithKeys). */
  readonly getValue?: (item: T, key: string) => unknown;
}

function defaultMatches<T>(item: T, scope: Scope, filters: Filters): boolean {
  const row = item as Record<string, unknown>;
  for (const [key, value] of Object.entries(scope)) if (row[key] !== value) return false;
  for (const [key, value] of Object.entries(filters)) {
    if (Array.isArray(value) ? !value.includes(row[key] as never) : row[key] !== value) return false;
  }
  return true;
}

export function createMemoryKeysetSource<T>(options: MemoryKeysetSourceOptions<T>): KeysetSource<T> {
  const matches = options.matches ?? defaultMatches;
  const getValue = options.getValue ?? ((item: T, key: string) => (item as Record<string, unknown>)[key]);
  async function fetchWithKeys(query: KeysetFetch): Promise<readonly KeyedRow<T>[]> {
    const keysOf = (item: T) => query.order.map((field) => getValue(item, field.key) as CursorValue);
    const rows: { item: T; keys: CursorValue[] }[] = [];
    for (const item of options.items()) {
      if (!matches(item, query.scope, query.filters)) continue;
      const keys = keysOf(item);
      if (query.after && compareKeys(query.after, keys, query.order) >= 0) continue;
      rows.push({ item, keys });
    }
    rows.sort((a, b) => compareKeys(a.keys, b.keys, query.order));
    return rows.slice(0, query.limit);
  }
  return {
    fetchWithKeys,
    async fetch(query: KeysetFetch): Promise<readonly T[]> {
      return (await fetchWithKeys(query)).map((row) => row.item);
    },
  };
}
