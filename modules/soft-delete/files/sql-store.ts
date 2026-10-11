// SPDX-License-Identifier: Apache-2.0
// SoftDeleteStore on PostgreSQL through any `query(text, params)` executor that uses $1 placeholders, returns { rows }
// and offers `transaction(work)` on one connection (PGlite, node-postgres via pool.connect(), postgres.js begin()).
// Apply schema.sql for the trash table, and give each soft-deletable table id, tenant_id, deleted_at (bigint),
// deleted_by and delete_batch columns with partial unique indexes WHERE deleted_at IS NULL. Every statement filters
// by tenant_id. Table and column names are validated identifiers from the entity configuration, never request input.
import { SoftDeleteError } from "./core.js";
import type { Conflict, DeleteMark, SoftDeleteStore, StoredRecord, TrashCursor, TrashEntry } from "./core.js";

export interface SqlExecutor {
  query(text: string, params?: readonly unknown[]): Promise<{ rows: Record<string, unknown>[] }>;
  /** Runs `work` in one transaction on one connection; rolls back when it throws. Required: cascades must be atomic. */
  transaction<T>(work: (tx: SqlExecutor) => Promise<T>): Promise<T>;
}

export interface SqlStoreOptions {
  /** Trash table name (default soft_delete_batches). */
  readonly batchTable?: string;
}

const IDENT = /^[a-z_][a-z0-9_]{0,62}$/;
const SOFT_COLUMNS = new Set(["id", "tenant_id", "deleted_at", "deleted_by", "delete_batch"]);
const BATCH_COLUMNS = "id, tenant_id, entity, record_id, deleted_at, deleted_by, count, purge_after";

function ident(name: string): string {
  if (!IDENT.test(name)) throw new RangeError(`Invalid SQL identifier ${JSON.stringify(name)}`);
  return name;
}

/** SQL condition that keeps live rows: add it to every default query, or read from a `<table>_live` view. */
export function liveCondition(alias?: string): string {
  return `${alias === undefined ? "" : ident(alias) + "."}deleted_at IS NULL`;
}

/** DDL for a view that hides soft-deleted rows, for lists, search, counts and exports. */
export function liveViewSql(table: string, view = `${table}_live`): string {
  return `CREATE OR REPLACE VIEW ${ident(view)} AS SELECT * FROM ${ident(table)} WHERE deleted_at IS NULL`;
}

function toRecord(row: Record<string, unknown>): StoredRecord {
  const data: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) if (!SOFT_COLUMNS.has(key)) data[key] = value;
  return {
    id: String(row.id), tenantId: String(row.tenant_id), deletedAt: row.deleted_at == null ? null : Number(row.deleted_at),
    deletedBy: row.deleted_by == null ? null : String(row.deleted_by), batchId: row.delete_batch == null ? null : String(row.delete_batch), data,
  };
}

function toEntry(row: Record<string, unknown>): TrashEntry {
  return {
    id: String(row.id), tenantId: String(row.tenant_id), entity: String(row.entity), recordId: String(row.record_id),
    deletedAt: Number(row.deleted_at), deletedBy: String(row.deleted_by), count: Number(row.count), purgeAfter: Number(row.purge_after),
  };
}

const isUniqueViolation = (error: unknown): boolean =>
  typeof error === "object" && error !== null && (error as { code?: unknown }).code === "23505";

export function createSqlSoftDeleteStore(db: SqlExecutor, options: SqlStoreOptions = {}): SoftDeleteStore {
  const batches = ident(options.batchTable ?? "soft_delete_batches");
  if (typeof db.transaction !== "function") throw new TypeError("The executor needs transaction(work)");

  function bound(exec: SqlExecutor): SoftDeleteStore {
    const ids = (rows: Record<string, unknown>[]) => rows.map((row) => String(row.id));
    return {
      transaction: (work) => exec.transaction((tx) => work(bound(tx))),
      async findRecord(tenantId, table, id) {
        const { rows } = await exec.query(`SELECT * FROM ${ident(table)} WHERE tenant_id = $1 AND id = $2`, [tenantId, id]);
        return rows[0] ? toRecord(rows[0]) : null;
      },
      async markRecord(tenantId, table, id, mark: DeleteMark) {
        const { rows } = await exec.query(
          `UPDATE ${ident(table)} SET deleted_at = $3, deleted_by = $4, delete_batch = $5 WHERE tenant_id = $1 AND id = $2 AND deleted_at IS NULL RETURNING id`,
          [tenantId, id, mark.deletedAt, mark.deletedBy, mark.batchId],
        );
        return rows.length === 1;
      },
      async markChildren(tenantId, table, foreignKey, parentIds, mark: DeleteMark) {
        if (parentIds.length === 0) return [];
        const { rows } = await exec.query(
          `UPDATE ${ident(table)} SET deleted_at = $3, deleted_by = $4, delete_batch = $5
           WHERE tenant_id = $1 AND ${ident(foreignKey)} = ANY($2) AND deleted_at IS NULL RETURNING id`,
          [tenantId, [...parentIds], mark.deletedAt, mark.deletedBy, mark.batchId],
        );
        return ids(rows);
      },
      async findConflicts(tenantId, table, unique, batchId) {
        const conflicts: Conflict[] = [];
        for (const columns of unique) {
          const match = columns.map((column) => `l.${ident(column)} = d.${ident(column)}`).join(" AND ");
          const { rows } = await exec.query(
            `SELECT d.id FROM ${ident(table)} d WHERE d.tenant_id = $1 AND d.delete_batch = $2 AND d.deleted_at IS NOT NULL
             AND EXISTS (SELECT 1 FROM ${ident(table)} l WHERE l.tenant_id = d.tenant_id AND l.deleted_at IS NULL AND l.id <> d.id AND ${match})`,
            [tenantId, batchId],
          );
          for (const id of ids(rows)) conflicts.push({ entity: table, id, columns: [...columns] });
        }
        return conflicts;
      },
      async unmarkBatch(tenantId, table, batchId) {
        try {
          const { rows } = await exec.query(
            `UPDATE ${ident(table)} SET deleted_at = NULL, deleted_by = NULL, delete_batch = NULL
             WHERE tenant_id = $1 AND delete_batch = $2 AND deleted_at IS NOT NULL RETURNING id`,
            [tenantId, batchId],
          );
          return ids(rows);
        } catch (error) {
          // A unique index the entity configuration does not declare, or a live row inserted concurrently.
          if (isUniqueViolation(error)) throw new SoftDeleteError("conflict", "A live record now holds a unique value of a record being restored");
          throw error;
        }
      },
      async deletedChildIds(tenantId, table, foreignKey, parentIds) {
        if (parentIds.length === 0) return [];
        const { rows } = await exec.query(
          `SELECT id FROM ${ident(table)} WHERE tenant_id = $1 AND ${ident(foreignKey)} = ANY($2) AND deleted_at IS NOT NULL`,
          [tenantId, [...parentIds]],
        );
        return ids(rows);
      },
      async purgeIds(tenantId, table, list) {
        if (list.length === 0) return 0;
        const { rows } = await exec.query(
          `DELETE FROM ${ident(table)} WHERE tenant_id = $1 AND id = ANY($2) AND deleted_at IS NOT NULL RETURNING id`,
          [tenantId, [...list]],
        );
        return rows.length;
      },
      async purgeRows(tenantId, table, batchId) {
        const { rows } = await exec.query(
          `DELETE FROM ${ident(table)} WHERE tenant_id = $1 AND delete_batch = $2 AND deleted_at IS NOT NULL RETURNING id`,
          [tenantId, batchId],
        );
        return rows.length;
      },
      async insertBatch(entry) {
        await exec.query(
          `INSERT INTO ${batches} (${BATCH_COLUMNS}) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [entry.id, entry.tenantId, entry.entity, entry.recordId, entry.deletedAt, entry.deletedBy, entry.count, entry.purgeAfter],
        );
      },
      async findBatch(tenantId, id) {
        const { rows } = await exec.query(`SELECT ${BATCH_COLUMNS} FROM ${batches} WHERE tenant_id = $1 AND id = $2`, [tenantId, id]);
        return rows[0] ? toEntry(rows[0]) : null;
      },
      async takeBatch(tenantId, id, purgeBefore) {
        const { rows } = purgeBefore === null
          ? await exec.query(`DELETE FROM ${batches} WHERE tenant_id = $1 AND id = $2 RETURNING ${BATCH_COLUMNS}`, [tenantId, id])
          : await exec.query(`DELETE FROM ${batches} WHERE tenant_id = $1 AND id = $2 AND purge_after <= $3 RETURNING ${BATCH_COLUMNS}`, [tenantId, id, purgeBefore]);
        return rows[0] ? toEntry(rows[0]) : null;
      },
      async listBatches(tenantId, page: { entity: string | null; before: TrashCursor | null; limit: number }) {
        const params: unknown[] = [tenantId];
        const where = ["tenant_id = $1"];
        if (page.entity !== null) { params.push(page.entity); where.push(`entity = $${params.length}`); }
        if (page.before !== null) {
          params.push(page.before.deletedAt, page.before.id);
          where.push(`(deleted_at, id) < ($${params.length - 1}::bigint, $${params.length}::text)`);
        }
        params.push(page.limit);
        const { rows } = await exec.query(
          `SELECT ${BATCH_COLUMNS} FROM ${batches} WHERE ${where.join(" AND ")} ORDER BY deleted_at DESC, id DESC LIMIT $${params.length}`, params,
        );
        return rows.map(toEntry);
      },
      async expiredBatches(at, limit, after) {
        const { rows } = after === null
          ? await exec.query(`SELECT id, tenant_id, purge_after FROM ${batches} WHERE purge_after <= $1 ORDER BY purge_after, id LIMIT $2`, [at, limit])
          : await exec.query(
            `SELECT id, tenant_id, purge_after FROM ${batches} WHERE purge_after <= $1 AND (purge_after, id) > ($3::bigint, $4::text) ORDER BY purge_after, id LIMIT $2`,
            [at, limit, after.purgeAfter, after.id],
          );
        return rows.map((row) => ({ tenantId: String(row.tenant_id), id: String(row.id), purgeAfter: Number(row.purge_after) }));
      },
    };
  }
  return bound(db);
}
