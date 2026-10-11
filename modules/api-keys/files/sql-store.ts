// SPDX-License-Identifier: Apache-2.0
// ApiKeyStore on PostgreSQL through any `query(text, params)` executor that uses $1 placeholders and returns
// { rows } (node-postgres Pool or Client, postgres.js via a thin wrapper, Neon serverless, PGlite). Apply
// schema.sql first. Revocation and the throttled last-used write are single conditional UPDATEs.
import type { ApiKeyEnvironment, ApiKeyRecord, ApiKeyStore } from "./core.js";

export interface SqlExecutor {
  query(text: string, params?: readonly unknown[]): Promise<{ rows: Record<string, unknown>[] }>;
}

export interface SqlStoreOptions {
  /** Table name (default api_keys). Letters, digits and underscores only. */
  readonly table?: string;
}

const COLUMNS = "id, tenant_id, name, lookup_id, prefix, environment, key_hash, scopes, created_by, created_at, expires_at, revoked_at, revoked_by, last_used_at";

function toRecord(row: Record<string, unknown>): ApiKeyRecord {
  const text = (key: string) => String(row[key]);
  const time = (key: string) => (row[key] == null ? null : Number(row[key]));
  const scopes = Array.isArray(row.scopes) ? row.scopes.map(String) : [];
  return {
    id: text("id"), tenantId: text("tenant_id"), name: text("name"), lookupId: text("lookup_id"), prefix: text("prefix"),
    environment: text("environment") as ApiKeyEnvironment, keyHash: text("key_hash"), scopes, createdBy: text("created_by"),
    createdAt: Number(row.created_at), expiresAt: time("expires_at"), revokedAt: time("revoked_at"),
    revokedBy: row.revoked_by == null ? null : text("revoked_by"), lastUsedAt: time("last_used_at"),
  };
}

export function createSqlApiKeyStore(db: SqlExecutor, options: SqlStoreOptions = {}): ApiKeyStore {
  const table = options.table ?? "api_keys";
  if (!/^[a-z_][a-z0-9_]{0,62}$/.test(table)) throw new RangeError("Invalid table name");
  const one = async (sql: string, params: unknown[]) => (await db.query(sql, params)).rows.map(toRecord)[0] ?? null;

  return {
    async insert(record) {
      const { rows } = await db.query(
        `INSERT INTO ${table} (${COLUMNS}) VALUES ($1, $2, $3, $4, $5, $6, $7, $8::text[], $9, $10, $11, $12, $13, $14)
         ON CONFLICT (lookup_id) DO NOTHING RETURNING id`,
        [record.id, record.tenantId, record.name, record.lookupId, record.prefix, record.environment, record.keyHash, [...record.scopes],
          record.createdBy, record.createdAt, record.expiresAt, record.revokedAt, record.revokedBy, record.lastUsedAt],
      );
      return rows.length === 1;
    },
    findById: (id) => one(`SELECT ${COLUMNS} FROM ${table} WHERE id = $1`, [id]),
    findByLookupId: (lookupId) => one(`SELECT ${COLUMNS} FROM ${table} WHERE lookup_id = $1`, [lookupId]),
    async listByTenant(tenantId) {
      const { rows } = await db.query(`SELECT ${COLUMNS} FROM ${table} WHERE tenant_id = $1 ORDER BY created_at DESC, id DESC`, [tenantId]);
      return rows.map(toRecord);
    },
    revoke: (id, at, by) => one(
      `UPDATE ${table} SET revoked_at = $2, revoked_by = $3 WHERE id = $1 AND revoked_at IS NULL RETURNING ${COLUMNS}`,
      [id, at, by],
    ),
    async touchLastUsed(id, at, notAfter) {
      const { rows } = await db.query(
        `UPDATE ${table} SET last_used_at = $2 WHERE id = $1 AND revoked_at IS NULL AND (last_used_at IS NULL OR last_used_at <= $3) RETURNING id`,
        [id, at, notAfter],
      );
      return rows.length === 1;
    },
  };
}
