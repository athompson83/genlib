// SPDX-License-Identifier: Apache-2.0
// RbacStore on PostgreSQL through any `query(text, params)` executor that uses $1 placeholders and returns
// { rows } (node-postgres Pool or Client, postgres.js via a thin wrapper, Neon serverless, PGlite). Apply
// schema.sql first. Grants are one INSERT ... ON CONFLICT statement. A revoke of a protected role is one DELETE
// whose guard first locks every tenant-wide holder of that role (FOR UPDATE, in a stable order), so two
// concurrent revokes of the last two owners serialize and the second sees only one holder left and is refused.
import type { Assignment, AssignmentKey, ListCursor, RbacStore, RemoveResult } from "./core.js";

export interface SqlExecutor {
  query(text: string, params?: readonly unknown[]): Promise<{ rows: Record<string, unknown>[] }>;
  /** Runs `work` in one transaction. Optional; this store needs none because each change is one statement. */
  transaction?<T>(work: (tx: SqlExecutor) => Promise<T>): Promise<T>;
}

export interface SqlRbacStoreOptions {
  /** Table name (default rbac_assignments). Letters, digits and underscores only. */
  readonly table?: string;
}

const COLUMNS = "tenant_id, subject_id, role, resource_id, expires_at, created_at, granted_by";
const SCOPE = "COALESCE(resource_id, '')";

function toAssignment(row: Record<string, unknown>): Assignment {
  return {
    tenantId: String(row.tenant_id), subjectId: String(row.subject_id), role: String(row.role),
    resourceId: row.resource_id == null ? null : String(row.resource_id),
    expiresAt: row.expires_at == null ? null : Number(row.expires_at),
    createdAt: Number(row.created_at), grantedBy: String(row.granted_by),
  };
}

export function createSqlRbacStore(db: SqlExecutor, options: SqlRbacStoreOptions = {}): RbacStore {
  const table = options.table ?? "rbac_assignments";
  if (!/^[a-z_][a-z0-9_]{0,62}$/.test(table)) throw new RangeError("Invalid table name");

  return {
    async forSubject(tenantId, subjectId) {
      const { rows } = await db.query(`SELECT ${COLUMNS} FROM ${table} WHERE tenant_id = $1 AND subject_id = $2`, [tenantId, subjectId]);
      return rows.map(toAssignment);
    },

    async upsert(assignment) {
      const { rows } = await db.query(
        `INSERT INTO ${table} (${COLUMNS}) VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (tenant_id, subject_id, role, (${SCOPE})) DO UPDATE SET expires_at = EXCLUDED.expires_at
         RETURNING ${COLUMNS}, (xmax = 0) AS inserted`,
        [assignment.tenantId, assignment.subjectId, assignment.role, assignment.resourceId, assignment.expiresAt, assignment.createdAt, assignment.grantedBy],
      );
      const row = rows[0];
      if (!row) throw new Error("Upsert returned no row");
      return { assignment: toAssignment(row), created: row.inserted === true };
    },

    async remove(key: AssignmentKey, guard): Promise<RemoveResult> {
      const params = [key.tenantId, key.subjectId, key.role, key.resourceId ?? "", guard.protectedRole, guard.now];
      // The scalar subquery reads the whole CTE, so every holder row is locked before the count is taken. A
      // holder deleted by a transaction that committed while we waited is skipped by FOR UPDATE.
      const { rows } = await db.query(
        `WITH holders AS (
           SELECT subject_id, expires_at FROM ${table}
           WHERE tenant_id = $1 AND role = $3 AND resource_id IS NULL
           ORDER BY subject_id
           FOR UPDATE
         )
         DELETE FROM ${table}
         WHERE tenant_id = $1 AND subject_id = $2 AND role = $3 AND ${SCOPE} = $4
           AND (NOT $5::boolean OR resource_id IS NOT NULL
             OR (expires_at IS NOT NULL AND expires_at <= $6::bigint)
             OR (SELECT count(*) FROM holders h WHERE h.subject_id <> $2 AND (h.expires_at IS NULL OR h.expires_at > $6::bigint)) > 0)
         RETURNING subject_id`,
        params,
      );
      if (rows.length === 1) return "removed";
      const exists = await db.query(
        `SELECT 1 FROM ${table} WHERE tenant_id = $1 AND subject_id = $2 AND role = $3 AND ${SCOPE} = $4`,
        params.slice(0, 4),
      );
      return exists.rows.length > 0 && guard.protectedRole ? "last-holder" : "not-found";
    },

    async list(tenantId, query: { readonly subjectId: string | null; readonly after: ListCursor | null; readonly limit: number }) {
      const after = query.after;
      const { rows } = await db.query(
        `SELECT ${COLUMNS} FROM ${table}
         WHERE tenant_id = $1 AND ($2::text IS NULL OR subject_id = $2)
           AND ($3::text IS NULL OR (subject_id, role, ${SCOPE}) > ($3::text, $4::text, $5::text))
         ORDER BY subject_id, role, ${SCOPE}
         LIMIT $6`,
        [tenantId, query.subjectId, after?.subjectId ?? null, after?.role ?? null, after?.resourceId ?? null, query.limit],
      );
      return rows.map(toAssignment);
    },
  };
}
