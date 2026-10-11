// SPDX-License-Identifier: Apache-2.0
// In-memory SoftDeleteStore for tests and prototypes. Per-process and lost on restart. transaction() snapshots the
// state and puts it back when `work` throws; it does not isolate concurrent transactions from each other, so use the
// PostgreSQL store (sql-store.ts) or an equivalent with real transactions in production. Unique column sets passed to
// the constructor are enforced among live rows of one tenant, like partial unique indexes WHERE deleted_at IS NULL.
import { SoftDeleteError } from "./core.js";
import type { Conflict, DeleteMark, DueCursor, DueEntry, SoftDeleteStore, StoredRecord, TrashCursor, TrashEntry } from "./core.js";

interface Row {
  id: string;
  tenantId: string;
  deletedAt: number | null;
  deletedBy: string | null;
  batchId: string | null;
  data: Record<string, unknown>;
}

interface State {
  tables: Map<string, Map<string, Row>>;
  batches: Map<string, TrashEntry>;
}

const copyRow = (row: Row): Row => ({ ...row, data: { ...row.data } });
const toRecord = (row: Row): StoredRecord => ({ ...row, data: { ...row.data } });

export class MemorySoftDeleteStore implements SoftDeleteStore {
  #state: State = { tables: new Map(), batches: new Map() };
  readonly #unique: Readonly<Record<string, readonly (readonly string[])[]>>;

  /** `unique`: table -> column sets unique among live rows of one tenant. */
  constructor(options: { unique?: Readonly<Record<string, readonly (readonly string[])[]>> } = {}) {
    this.#unique = options.unique ?? {};
  }

  #table(name: string): Map<string, Row> {
    let table = this.#state.tables.get(name);
    if (!table) this.#state.tables.set(name, (table = new Map()));
    return table;
  }

  #key(tenantId: string, id: string): string {
    return `${tenantId}\u0000${id}`;
  }

  /** A live row of `table` other than `row` that holds the same non-null values for `columns`. */
  #holder(table: string, row: Row, columns: readonly string[]): Row | undefined {
    return [...this.#table(table).values()].find((other) =>
      other !== row && other.id !== row.id && other.tenantId === row.tenantId && other.deletedAt === null &&
      columns.every((column) => row.data[column] != null && other.data[column] === row.data[column]));
  }

  // Application-side helpers (tests and prototypes): insert, update and read live rows.

  /** Inserts a live row; throws `conflict` when a live row of the tenant holds one of its unique values. */
  insert(table: string, tenantId: string, id: string, data: Record<string, unknown> = {}): StoredRecord {
    const rows = this.#table(table);
    if (rows.has(this.#key(tenantId, id))) throw new Error("Duplicate id");
    const row: Row = { id, tenantId, deletedAt: null, deletedBy: null, batchId: null, data: { ...data } };
    this.#checkUnique(table, row);
    rows.set(this.#key(tenantId, id), row);
    return toRecord(row);
  }

  /** Live rows of one tenant: what default queries, search, counts and exports see. */
  live(table: string, tenantId: string): StoredRecord[] {
    return [...this.#table(table).values()].filter((row) => row.tenantId === tenantId && row.deletedAt === null).map(toRecord);
  }

  /** Every row, deleted ones included, for assertions. */
  all(table: string): StoredRecord[] {
    return [...this.#table(table).values()].map(toRecord);
  }

  #checkUnique(table: string, row: Row): void {
    for (const columns of this.#unique[table] ?? []) {
      if (this.#holder(table, row, columns)) {
        throw new SoftDeleteError("conflict", "Unique value is held by a live record", [{ entity: table, id: row.id, columns }]);
      }
    }
  }

  async transaction<T>(work: (tx: SoftDeleteStore) => Promise<T>): Promise<T> {
    const snapshot: State = {
      tables: new Map([...this.#state.tables].map(([name, rows]) => [name, new Map([...rows].map(([key, row]) => [key, copyRow(row)]))])),
      batches: new Map(this.#state.batches),
    };
    try {
      return await work(this);
    } catch (error) {
      this.#state = snapshot;
      throw error;
    }
  }

  async findRecord(tenantId: string, table: string, id: string): Promise<StoredRecord | null> {
    const row = this.#table(table).get(this.#key(tenantId, id));
    return row ? toRecord(row) : null;
  }

  async markRecord(tenantId: string, table: string, id: string, mark: DeleteMark): Promise<boolean> {
    const row = this.#table(table).get(this.#key(tenantId, id));
    if (!row || row.deletedAt !== null) return false;
    Object.assign(row, { deletedAt: mark.deletedAt, deletedBy: mark.deletedBy, batchId: mark.batchId });
    return true;
  }

  async markChildren(tenantId: string, table: string, foreignKey: string, parentIds: readonly string[], mark: DeleteMark): Promise<string[]> {
    const parents = new Set(parentIds);
    const ids: string[] = [];
    for (const row of this.#table(table).values()) {
      if (row.tenantId !== tenantId || row.deletedAt !== null || !parents.has(String(row.data[foreignKey]))) continue;
      Object.assign(row, { deletedAt: mark.deletedAt, deletedBy: mark.deletedBy, batchId: mark.batchId });
      ids.push(row.id);
    }
    return ids;
  }

  async findConflicts(tenantId: string, table: string, unique: readonly (readonly string[])[], batchId: string): Promise<Conflict[]> {
    const conflicts: Conflict[] = [];
    for (const row of this.#table(table).values()) {
      if (row.tenantId !== tenantId || row.batchId !== batchId || row.deletedAt === null) continue;
      for (const columns of unique) if (this.#holder(table, row, columns)) conflicts.push({ entity: table, id: row.id, columns: [...columns] });
    }
    return conflicts;
  }

  async unmarkBatch(tenantId: string, table: string, batchId: string): Promise<string[]> {
    const ids: string[] = [];
    for (const row of this.#table(table).values()) {
      if (row.tenantId !== tenantId || row.batchId !== batchId || row.deletedAt === null) continue;
      this.#checkUnique(table, { ...row, deletedAt: null });
      Object.assign(row, { deletedAt: null, deletedBy: null, batchId: null });
      ids.push(row.id);
    }
    return ids;
  }

  async deletedChildIds(tenantId: string, table: string, foreignKey: string, parentIds: readonly string[]): Promise<string[]> {
    const parents = new Set(parentIds);
    return [...this.#table(table).values()]
      .filter((row) => row.tenantId === tenantId && row.deletedAt !== null && parents.has(String(row.data[foreignKey])))
      .map((row) => row.id);
  }

  async purgeIds(tenantId: string, table: string, ids: readonly string[]): Promise<number> {
    const rows = this.#table(table);
    let count = 0;
    for (const id of ids) {
      const row = rows.get(this.#key(tenantId, id));
      if (!row || row.deletedAt === null) continue;
      rows.delete(this.#key(tenantId, id));
      count++;
    }
    return count;
  }

  async purgeRows(tenantId: string, table: string, batchId: string): Promise<number> {
    const rows = this.#table(table);
    let count = 0;
    for (const [key, row] of rows) {
      if (row.tenantId !== tenantId || row.batchId !== batchId || row.deletedAt === null) continue;
      rows.delete(key);
      count++;
    }
    return count;
  }

  async insertBatch(entry: TrashEntry): Promise<void> {
    if (this.#state.batches.has(entry.id)) throw new Error("Duplicate batch id");
    this.#state.batches.set(entry.id, { ...entry });
  }

  async findBatch(tenantId: string, id: string): Promise<TrashEntry | null> {
    const entry = this.#state.batches.get(id);
    return entry && entry.tenantId === tenantId ? { ...entry } : null;
  }

  async takeBatch(tenantId: string, id: string, purgeBefore: number | null): Promise<TrashEntry | null> {
    const entry = this.#state.batches.get(id);
    if (!entry || entry.tenantId !== tenantId) return null;
    if (purgeBefore !== null && entry.purgeAfter > purgeBefore) return null;
    this.#state.batches.delete(id);
    return { ...entry };
  }

  async listBatches(tenantId: string, page: { entity: string | null; before: TrashCursor | null; limit: number }): Promise<TrashEntry[]> {
    const { before } = page;
    return [...this.#state.batches.values()]
      .filter((entry) => entry.tenantId === tenantId && (page.entity === null || entry.entity === page.entity))
      .filter((entry) => !before || entry.deletedAt < before.deletedAt || (entry.deletedAt === before.deletedAt && entry.id < before.id))
      .sort((a, b) => b.deletedAt - a.deletedAt || (a.id < b.id ? 1 : a.id > b.id ? -1 : 0))
      .slice(0, page.limit)
      .map((entry) => ({ ...entry }));
  }

  async expiredBatches(at: number, limit: number, after: DueCursor | null): Promise<DueEntry[]> {
    return [...this.#state.batches.values()]
      .filter((entry) => entry.purgeAfter <= at)
      .filter((entry) => !after || entry.purgeAfter > after.purgeAfter || (entry.purgeAfter === after.purgeAfter && entry.id > after.id))
      .sort((a, b) => a.purgeAfter - b.purgeAfter || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
      .slice(0, limit)
      .map((entry) => ({ tenantId: entry.tenantId, id: entry.id, purgeAfter: entry.purgeAfter }));
  }
}
