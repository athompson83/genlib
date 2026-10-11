// SPDX-License-Identifier: Apache-2.0
// Soft delete, trash and restore for an application's own tables, framework-neutral. Deleting marks the row
// (deleted_at, deleted_by, delete_batch) instead of removing it, and follows declared parent -> child relations so
// dependents are marked with the same batch id. Each delete opens one trash entry; restoring it brings back exactly
// the rows of that batch (not children that were deleted earlier on their own), refuses with `conflict` when a live
// row now holds one of their unique values, and refuses with `parent-deleted` while the parent is still in the trash.
// A purge job permanently removes entries past retention, children first, and is idempotent. Every store call is
// scoped by tenant, and delete, restore, trash and read are authorized by the receiving application.

/** A row as the store sees it: the soft-delete columns plus the application's own columns in `data`. */
export interface StoredRecord {
  readonly id: string;
  readonly tenantId: string;
  readonly deletedAt: number | null;
  readonly deletedBy: string | null;
  readonly batchId: string | null;
  readonly data: Readonly<Record<string, unknown>>;
}

/** One trash entry: the record a user deleted, with the batch every cascaded row shares. */
export interface TrashEntry {
  /** The batch id, also written to each marked row's delete_batch column. */
  readonly id: string;
  readonly tenantId: string;
  readonly entity: string;
  readonly recordId: string;
  readonly deletedAt: number;
  readonly deletedBy: string;
  /** Rows marked by this delete, the record itself included. */
  readonly count: number;
  /** From this time the entry can no longer be restored and the purge job removes it. */
  readonly purgeAfter: number;
}

export interface RecordRef { readonly entity: string; readonly id: string }
export interface Conflict { readonly entity: string; readonly id: string; readonly columns: readonly string[] }
export interface DeleteMark { readonly deletedAt: number; readonly deletedBy: string; readonly batchId: string }
export interface DueCursor { readonly purgeAfter: number; readonly id: string }
export interface DueEntry { readonly tenantId: string; readonly id: string; readonly purgeAfter: number }
/** A trash entry the purge job could not remove this run; it stays in the trash and is retried on the next run. */
export interface PurgeFailure { readonly id: string; readonly tenantId: string; readonly entity: string; readonly code: string }
export interface TrashCursor { readonly deletedAt: number; readonly id: string }

/**
 * Persistence for soft-deleted rows and trash entries. Every method is scoped by tenant except `expiredBatches`,
 * which the purge job uses across tenants. Table and column names reach the store only after validation.
 */
export interface SoftDeleteStore {
  /** Runs `work` atomically; a thrown error rolls every change back. */
  transaction<T>(work: (tx: SoftDeleteStore) => Promise<T>): Promise<T>;
  findRecord(tenantId: string, table: string, id: string): Promise<StoredRecord | null>;
  /** Marks the row when it is live; false when it is missing, deleted or in another tenant. */
  markRecord(tenantId: string, table: string, id: string, mark: DeleteMark): Promise<boolean>;
  /** Marks live rows whose `foreignKey` is one of `parentIds`; returns their ids. */
  markChildren(tenantId: string, table: string, foreignKey: string, parentIds: readonly string[], mark: DeleteMark): Promise<string[]>;
  /** Rows of the batch whose values for one unique column set are now held by a live row. */
  findConflicts(tenantId: string, table: string, unique: readonly (readonly string[])[], batchId: string): Promise<Conflict[]>;
  /** Clears the marks of the batch's rows in `table`; returns their ids. May throw a `conflict` SoftDeleteError on a unique violation. */
  unmarkBatch(tenantId: string, table: string, batchId: string): Promise<string[]>;
  /** Ids of soft-deleted rows (any batch) whose `foreignKey` is one of `parentIds`. */
  deletedChildIds(tenantId: string, table: string, foreignKey: string, parentIds: readonly string[]): Promise<string[]>;
  /** Permanently deletes the listed rows of `table` that are soft-deleted; returns how many. */
  purgeIds(tenantId: string, table: string, ids: readonly string[]): Promise<number>;
  /** Permanently deletes the batch's soft-deleted rows in `table`; returns how many. */
  purgeRows(tenantId: string, table: string, batchId: string): Promise<number>;
  insertBatch(entry: TrashEntry): Promise<void>;
  findBatch(tenantId: string, id: string): Promise<TrashEntry | null>;
  /** Removes and returns the entry; with `purgeBefore`, only when purgeAfter <= purgeBefore. Null when already gone. */
  takeBatch(tenantId: string, id: string, purgeBefore: number | null): Promise<TrashEntry | null>;
  /** One tenant's entries, newest first: (deletedAt, id) strictly before `before`, at most `limit`. */
  listBatches(tenantId: string, page: { entity: string | null; before: TrashCursor | null; limit: number }): Promise<TrashEntry[]>;
  /** Entries with purgeAfter <= `at` after the (purgeAfter, id) keyset `after`, oldest first, across tenants. */
  expiredBatches(at: number, limit: number, after: DueCursor | null): Promise<DueEntry[]>;
}

export interface Actor { readonly userId: string }
export type SoftDeleteAction = "delete" | "restore" | "trash" | "read";

/** A dependent table: its rows whose `foreignKey` holds the parent's id follow the parent's delete and restore. */
export interface ChildRelation { readonly entity: string; readonly foreignKey: string }

export interface EntityDefinition {
  /** Column sets that are unique among live rows of one tenant (partial unique indexes WHERE deleted_at IS NULL). */
  readonly unique?: readonly (readonly string[])[];
  readonly children?: readonly ChildRelation[];
}

export interface SoftDeleteOptions {
  readonly store: SoftDeleteStore;
  /** Table name -> definition. Every table needs id, tenant_id, deleted_at, deleted_by and delete_batch columns. */
  readonly entities: Readonly<Record<string, EntityDefinition>>;
  /** Decide whether `actor` may perform `action` in `tenantId`. Return false to deny. */
  readonly authorize: (actor: Actor, action: SoftDeleteAction, target: Readonly<{ tenantId: string; entity: string | null }>) => Promise<boolean>;
  /** How long a trash entry stays restorable before the purge job removes it. Default 30 days. */
  readonly retentionMs?: number;
  readonly now?: () => number;
  readonly newId?: () => string;
}

export type SoftDeleteErrorCode =
  | "forbidden" | "invalid-tenant" | "invalid-entity" | "invalid-id" | "not-found" | "already-deleted"
  | "retention-expired" | "parent-deleted" | "conflict" | "invalid-cursor" | "invalid-limit" | "bad-request" | "too-large";

export class SoftDeleteError extends Error {
  /** For `conflict`: the batch rows whose unique values a live row now holds. */
  readonly conflicts: readonly Conflict[];
  readonly code: SoftDeleteErrorCode;
  constructor(code: SoftDeleteErrorCode, message: string, conflicts: readonly Conflict[] = []) {
    super(message);
    this.code = code;
    this.name = "SoftDeleteError";
    this.conflicts = conflicts;
  }
}

export const DEFAULT_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
/** Table and column names: lower-case SQL identifiers, never quoted or taken from requests. */
export const IDENTIFIER = /^[a-z_][a-z0-9_]{0,62}$/;
const TENANT = /^[\w.:-]{1,128}$/;
const ID = /^[\w.:-]{1,128}$/;
const MAX_RETENTION = 10 * 366 * 24 * 60 * 60 * 1000;

function encodeCursor(cursor: TrashCursor): string {
  return btoa(JSON.stringify([cursor.deletedAt, cursor.id])).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function decodeCursor(cursor: string | null | undefined): TrashCursor | null {
  if (cursor === undefined || cursor === null || cursor === "") return null;
  try {
    if (cursor.length > 512 || !/^[A-Za-z0-9_-]+$/.test(cursor)) throw new Error("shape");
    const padded = cursor.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (cursor.length % 4)) % 4);
    const value: unknown = JSON.parse(atob(padded));
    if (!Array.isArray(value) || value.length !== 2 || !Number.isSafeInteger(value[0]) || typeof value[1] !== "string") throw new Error("shape");
    return { deletedAt: value[0] as number, id: value[1] as string };
  } catch {
    throw new SoftDeleteError("invalid-cursor", "Invalid cursor");
  }
}

export function createSoftDelete(options: SoftDeleteOptions) {
  const retentionMs = options.retentionMs ?? DEFAULT_RETENTION_MS;
  if (!Number.isSafeInteger(retentionMs) || retentionMs < 1 || retentionMs > MAX_RETENTION) throw new RangeError("retentionMs must be 1 ms to 10 years");
  const now = options.now ?? Date.now;
  const newId = options.newId ?? (() => crypto.randomUUID());
  const { store } = options;

  // Validate the relation graph once; names reach SQL only from here.
  const entities = new Map<string, { unique: readonly (readonly string[])[]; children: readonly ChildRelation[] }>();
  for (const [name, definition] of Object.entries(options.entities)) {
    if (!IDENTIFIER.test(name)) throw new RangeError(`Invalid table name ${JSON.stringify(name)}`);
    const unique = definition.unique ?? [];
    for (const columns of unique) {
      if (columns.length === 0 || columns.some((column) => !IDENTIFIER.test(column))) throw new RangeError(`Invalid unique columns on ${name}`);
    }
    const children = definition.children ?? [];
    for (const child of children) {
      if (!IDENTIFIER.test(child.foreignKey)) throw new RangeError(`Invalid foreign key on ${name}`);
    }
    entities.set(name, { unique, children });
  }
  // Parents of each table, to refuse restoring a child while its parent is in the trash.
  const parents = new Map<string, { entity: string; foreignKey: string }[]>();
  for (const [name, definition] of entities) {
    for (const child of definition.children) {
      if (!entities.has(child.entity)) throw new RangeError(`${name} names undeclared child table ${child.entity}`);
      const list = parents.get(child.entity) ?? [];
      list.push({ entity: name, foreignKey: child.foreignKey });
      parents.set(child.entity, list);
    }
  }
  /** The table and every table reachable through children, children before parents (post-order); cycles visit once. */
  function subtree(entity: string): string[] {
    const seen = new Set<string>();
    const order: string[] = [];
    const visit = (name: string) => {
      if (seen.has(name)) return;
      seen.add(name);
      for (const child of entities.get(name)?.children ?? []) visit(child.entity);
      order.push(name);
    };
    visit(entity);
    return order;
  }

  async function allowed(actor: Actor, action: SoftDeleteAction, tenantId: string, entity: string | null): Promise<void> {
    if (!(await options.authorize(actor, action, { tenantId, entity }))) throw new SoftDeleteError("forbidden", "Not allowed");
  }
  function tenant(value: unknown): string {
    if (typeof value !== "string" || !TENANT.test(value)) throw new SoftDeleteError("invalid-tenant", "Invalid tenant id");
    return value;
  }
  function entityName(value: unknown): string {
    if (typeof value !== "string" || !entities.has(value)) throw new SoftDeleteError("invalid-entity", "Unknown entity");
    return value;
  }
  function recordId(value: unknown): string {
    if (typeof value !== "string" || !ID.test(value)) throw new SoftDeleteError("invalid-id", "Invalid id");
    return value;
  }

  return {
    /**
     * Soft-deletes one record and, through declared children, every live dependent, all with one batch id and
     * one trash entry, in one transaction. Rows already deleted on their own keep their own batch.
     */
    async remove(actor: Actor, input: { tenantId: string; entity: string; id: string }): Promise<{ entry: TrashEntry; records: RecordRef[] }> {
      const tenantId = tenant(input.tenantId);
      const entity = entityName(input.entity);
      const id = recordId(input.id);
      await allowed(actor, "delete", tenantId, entity);
      const at = now();
      const mark: DeleteMark = { deletedAt: at, deletedBy: actor.userId, batchId: newId() };
      return store.transaction(async (tx) => {
        if (!(await tx.markRecord(tenantId, entity, id, mark))) {
          const existing = await tx.findRecord(tenantId, entity, id);
          throw existing ? new SoftDeleteError("already-deleted", "Record is already deleted") : new SoftDeleteError("not-found", "Record not found");
        }
        const records: RecordRef[] = [{ entity, id }];
        // Breadth-first over the relation graph; only live rows are marked, so self-references terminate.
        let frontier: { entity: string; ids: string[] }[] = [{ entity, ids: [id] }];
        while (frontier.length > 0) {
          const next: { entity: string; ids: string[] }[] = [];
          for (const level of frontier) {
            for (const child of entities.get(level.entity)?.children ?? []) {
              const ids = await tx.markChildren(tenantId, child.entity, child.foreignKey, level.ids, mark);
              if (ids.length === 0) continue;
              for (const childId of ids) records.push({ entity: child.entity, id: childId });
              next.push({ entity: child.entity, ids });
            }
          }
          frontier = next;
        }
        const entry: TrashEntry = {
          id: mark.batchId, tenantId, entity, recordId: id, deletedAt: at, deletedBy: actor.userId, count: records.length, purgeAfter: at + retentionMs,
        };
        await tx.insertBatch(entry);
        return { entry, records };
      });
    },

    /**
     * Restores one trash entry: exactly the rows deleted with it. Refused with `retention-expired` after
     * purgeAfter, `parent-deleted` while the record's parent is in the trash, and `conflict` (with the
     * conflicting rows) when a live row now holds one of their unique values. Nothing changes on refusal.
     */
    async restore(actor: Actor, input: { tenantId: string; trashId: string }): Promise<{ entry: TrashEntry; records: RecordRef[] }> {
      const tenantId = tenant(input.tenantId);
      const trashId = recordId(input.trashId);
      await allowed(actor, "restore", tenantId, null);
      return store.transaction(async (tx) => {
        const entry = await tx.findBatch(tenantId, trashId);
        if (!entry) throw new SoftDeleteError("not-found", "Trash entry not found");
        await allowed(actor, "restore", tenantId, entry.entity);
        if (now() >= entry.purgeAfter) throw new SoftDeleteError("retention-expired", "The retention window has passed");
        const record = await tx.findRecord(tenantId, entry.entity, entry.recordId);
        // Purged with an ancestor's entry; the purge job removes this entry on its next run.
        if (!record || record.deletedAt === null) throw new SoftDeleteError("not-found", "Record no longer exists");
        for (const parent of parents.get(entry.entity) ?? []) {
          const parentId = record.data[parent.foreignKey];
          if (parentId === null || parentId === undefined) continue;
          const row = await tx.findRecord(tenantId, parent.entity, String(parentId));
          if (row && row.deletedAt !== null) throw new SoftDeleteError("parent-deleted", `Restore the ${parent.entity} record first`);
        }
        const tables = subtree(entry.entity).reverse();
        const conflicts: Conflict[] = [];
        for (const table of tables) {
          const unique = entities.get(table)?.unique ?? [];
          if (unique.length > 0) conflicts.push(...(await tx.findConflicts(tenantId, table, unique, entry.id)));
        }
        if (conflicts.length > 0) throw new SoftDeleteError("conflict", "A live record now holds a unique value of a record being restored", conflicts);
        // Claiming the entry serializes concurrent restores and the purge job: only one of them gets it.
        if (!(await tx.takeBatch(tenantId, entry.id, null))) throw new SoftDeleteError("not-found", "Trash entry not found");
        const records: RecordRef[] = [];
        for (const table of tables) {
          for (const id of await tx.unmarkBatch(tenantId, table, entry.id)) records.push({ entity: table, id });
        }
        return { entry, records };
      });
    },

    /** One tenant's trash, newest first, keyset-paginated; limit 1 to 100 (default 20). */
    async listTrash(actor: Actor, query: { tenantId: string; entity?: string | null; cursor?: string | null; limit?: number }): Promise<{ entries: TrashEntry[]; nextCursor: string | null }> {
      const tenantId = tenant(query.tenantId);
      const entity = query.entity === undefined || query.entity === null || query.entity === "" ? null : entityName(query.entity);
      const limit = query.limit ?? 20;
      if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new SoftDeleteError("invalid-limit", "limit must be 1 to 100");
      const before = decodeCursor(query.cursor);
      await allowed(actor, "trash", tenantId, entity);
      const rows = await store.listBatches(tenantId, { entity, before, limit: limit + 1 });
      const entries = rows.slice(0, limit);
      const last = entries[entries.length - 1];
      return { entries, nextCursor: rows.length > limit && last ? encodeCursor({ deletedAt: last.deletedAt, id: last.id }) : null };
    },

    /** A live record; soft-deleted and other-tenant records are `not-found`. */
    async get(actor: Actor, input: { tenantId: string; entity: string; id: string }): Promise<StoredRecord> {
      const tenantId = tenant(input.tenantId);
      const entity = entityName(input.entity);
      const id = recordId(input.id);
      await allowed(actor, "read", tenantId, entity);
      const record = await store.findRecord(tenantId, entity, id);
      if (!record || record.deletedAt !== null) throw new SoftDeleteError("not-found", "Record not found");
      return record;
    },

    /**
     * The purge job, for a trusted scheduler (no actor): permanently deletes entries whose purgeAfter has passed,
     * each in its own transaction, children before parents. Idempotent: an entry restored or purged by another
     * run is skipped, and a second run finds nothing.
     */
    async purgeExpired(job: { batchSize?: number; maxBatches?: number } = {}): Promise<{ entries: number; records: number; failed: PurgeFailure[] }> {
      const batchSize = job.batchSize ?? 100;
      const maxBatches = job.maxBatches ?? 100;
      if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 1000) throw new RangeError("batchSize must be 1 to 1000");
      if (!Number.isInteger(maxBatches) || maxBatches < 1) throw new RangeError("maxBatches must be a positive whole number");
      const cutoff = now();
      let entries = 0, records = 0;
      const failed: PurgeFailure[] = [];
      // Keyset paging over due entries, so an entry that keeps failing never blocks the ones behind it.
      let after: DueCursor | null = null;
      for (let round = 0; round < maxBatches; round++) {
        const due: DueEntry[] = await store.expiredBatches(cutoff, batchSize, after);
        const last = due[due.length - 1];
        if (last) after = { purgeAfter: last.purgeAfter, id: last.id };
        for (const item of due) {
          let entity = "";
          let purged: number | null;
          try {
            purged = await store.transaction(async (tx) => {
              const entry = await tx.takeBatch(item.tenantId, item.id, cutoff);
              if (!entry) return null;
              entity = entry.entity;
              // The record and every soft-deleted descendant, deepest first, so plain foreign keys hold. Descendants
              // deleted earlier on their own go too: with their parent gone they could never be restored.
              const seen = new Map<string, Set<string>>();
              const tree = async (entity: string, ids: string[]): Promise<number> => {
                const visited = seen.get(entity) ?? new Set<string>();
                seen.set(entity, visited);
                const fresh = ids.filter((id) => !visited.has(id));
                for (const id of fresh) visited.add(id);
                if (fresh.length === 0) return 0;
                let count = 0;
                for (const child of entities.get(entity)?.children ?? []) {
                  const childIds = await tx.deletedChildIds(entry.tenantId, child.entity, child.foreignKey, fresh);
                  if (childIds.length > 0) count += await tree(child.entity, childIds);
                }
                return count + (await tx.purgeIds(entry.tenantId, entity, fresh));
              };
              let count = await tree(entry.entity, [entry.recordId]);
              // Rows of the batch the relations no longer reach (a changed foreign key or configuration).
              for (const table of subtree(entry.entity)) count += await tx.purgeRows(entry.tenantId, table, entry.id);
              return count;
            });
          } catch (error) {
            // Rolled back: the entry and its rows stay. Report only a code (SQLSTATE or error name), never row data.
            const raw = (error as { code?: unknown }).code;
            const code = typeof raw === "string" && /^[\w-]{1,64}$/.test(raw) ? raw : error instanceof Error ? error.name : "error";
            failed.push({ id: item.id, tenantId: item.tenantId, entity, code });
            continue;
          }
          if (purged === null) continue;
          entries++;
          records += purged;
        }
        if (due.length < batchSize) break;
      }
      return { entries, records, failed };
    },
  };
}

export type SoftDelete = ReturnType<typeof createSoftDelete>;
