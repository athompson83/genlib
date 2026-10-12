// SPDX-License-Identifier: Apache-2.0
// In-memory RowSource and ExportLog for tests and prototypes. The source scopes every page to the requester's
// tenant (and an optional visibility rule) and pages by keyset over a stable id, the same contract the SQL source
// follows. Not for production data volumes.
import type { ExportLog, ExportRequester, ExportSummary, RowPage, RowQuery, RowSource } from "./core.js";

export interface MemoryRowSourceOptions<Row> {
  readonly tenantOf: (row: Row) => string;
  /** Stable unique id used for ordering and the cursor. */
  readonly idOf: (row: Row) => string;
  /** Extra visibility rule applied inside the source (for example, owner-only rows). */
  readonly visible?: (requester: ExportRequester, row: Row) => boolean;
  /** Applies the request filter; rows it rejects are not returned. */
  readonly matches?: (row: Row, filter: unknown) => boolean;
}

export interface MemoryRowSource<Row> extends RowSource<Row> {
  /** Number of fetchPage calls, for tests. */
  readonly fetchCount: number;
}

export function createMemoryRowSource<Row>(rows: readonly Row[], options: MemoryRowSourceOptions<Row>): MemoryRowSource<Row> {
  const sorted = [...rows].sort((a, b) => {
    const x = options.idOf(a);
    const y = options.idOf(b);
    return x < y ? -1 : x > y ? 1 : 0;
  });
  let fetchCount = 0;
  return {
    get fetchCount() { return fetchCount; },
    async fetchPage(requester: ExportRequester, query: RowQuery): Promise<RowPage<Row>> {
      fetchCount++;
      const out: Row[] = [];
      let more = false;
      for (const row of sorted) {
        if (query.cursor !== null && !(options.idOf(row) > query.cursor)) continue;
        if (options.tenantOf(row) !== requester.tenantId) continue;
        if (options.visible && !options.visible(requester, row)) continue;
        if (query.filter !== undefined && options.matches && !options.matches(row, query.filter)) continue;
        if (out.length === query.limit) { more = true; break; }
        out.push(row);
      }
      const last = out.at(-1);
      return { rows: out, nextCursor: more && last !== undefined ? options.idOf(last) : null };
    },
  };
}

export class MemoryExportLog implements ExportLog {
  readonly entries: ExportSummary[] = [];
  async record(summary: ExportSummary): Promise<void> {
    this.entries.push({ ...summary, columns: [...summary.columns] });
  }
}
