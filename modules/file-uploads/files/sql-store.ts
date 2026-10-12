// SPDX-License-Identifier: Apache-2.0
// UploadMetadataStore on PostgreSQL through any `query(text, params)` executor that uses $1 placeholders and returns
// { rows } (node-postgres Pool or Client, postgres.js via a thin wrapper, Neon serverless, PGlite). Apply schema.sql
// first. Quota reservation is one conditional upsert and status changes and deletes are single conditional
// statements with RETURNING, so concurrent requests cannot overspend a quota or double-release a file's bytes. A scan
// claim is one conditional UPDATE, so overlapping scan workers never scan one file at the same time.
import type { UploadMetadataStore, UploadRecord, UploadStatus } from "./core.js";

export interface SqlExecutor {
  query(text: string, params?: readonly unknown[]): Promise<{ rows: Record<string, unknown>[] }>;
}

export interface SqlUploadMetadataStoreOptions {
  /** Upload table name (default file_uploads). Lowercase letters, digits and underscores only. */
  readonly table?: string;
  /** Quota table name (default file_upload_quotas). */
  readonly quotaTable?: string;
}

const COLUMNS = "id, tenant_id, owner_id, storage_key, filename, content_type, size, status, created_at, scanned_at, scan_claimed_until";
const STATUSES: readonly UploadStatus[] = ["quarantined", "clean", "infected"];
const TABLE = /^[a-z_][a-z0-9_]{0,62}$/;

function toRecord(row: Record<string, unknown>): UploadRecord {
  const text = (key: string) => String(row[key]);
  const status = text("status") as UploadStatus;
  if (!STATUSES.includes(status)) throw new Error("Unknown upload status in database");
  return {
    id: text("id"), tenantId: text("tenant_id"), ownerId: text("owner_id"), storageKey: text("storage_key"),
    filename: text("filename"), contentType: text("content_type"), size: Number(row.size), status,
    createdAt: Number(row.created_at), ...(row.scanned_at == null ? {} : { scannedAt: Number(row.scanned_at) }),
    ...(row.scan_claimed_until == null ? {} : { scanClaimedUntil: Number(row.scan_claimed_until) }),
  };
}

export function createSqlUploadMetadataStore(db: SqlExecutor, options: SqlUploadMetadataStoreOptions = {}): UploadMetadataStore {
  const table = options.table ?? "file_uploads";
  const quotas = options.quotaTable ?? "file_upload_quotas";
  if (!TABLE.test(table) || !TABLE.test(quotas)) throw new RangeError("Invalid table name");
  const bytesParam = (value: number) => {
    if (!Number.isSafeInteger(value) || value < 0) throw new RangeError("Byte counts must be non-negative integers");
    return value;
  };

  return {
    async insert(record) {
      await db.query(
        `INSERT INTO ${table} (${COLUMNS}) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [record.id, record.tenantId, record.ownerId, record.storageKey, record.filename, record.contentType, record.size,
          record.status, record.createdAt, record.scannedAt ?? null, record.scanClaimedUntil ?? null],
      );
    },
    async get(id) {
      const { rows } = await db.query(`SELECT ${COLUMNS} FROM ${table} WHERE id = $1`, [id]);
      return rows[0] ? toRecord(rows[0]) : null;
    },
    async setStatus(id, from, to, at) {
      const { rows } = await db.query(
        `UPDATE ${table} SET status = $3, scanned_at = $4, scan_claimed_until = NULL WHERE id = $1 AND status = $2 RETURNING ${COLUMNS}`,
        [id, from, to, at],
      );
      return rows[0] ? toRecord(rows[0]) : null;
    },
    async delete(id) {
      const { rows } = await db.query(`DELETE FROM ${table} WHERE id = $1 RETURNING ${COLUMNS}`, [id]);
      return rows[0] ? toRecord(rows[0]) : null;
    },
    async reserve(tenantId, bytes, limit) {
      // One statement: insert the tenant's first reservation, or add to its usage only while the sum fits the limit.
      const { rows } = await db.query(
        `INSERT INTO ${quotas} AS q (tenant_id, used_bytes)
           SELECT $1, $2::bigint WHERE $2::bigint <= $3::bigint
         ON CONFLICT (tenant_id) DO UPDATE SET used_bytes = q.used_bytes + EXCLUDED.used_bytes
           WHERE q.used_bytes + EXCLUDED.used_bytes <= $3::bigint
         RETURNING used_bytes`,
        [tenantId, bytesParam(bytes), bytesParam(limit)],
      );
      return rows.length === 1;
    },
    async release(tenantId, bytes) {
      await db.query(
        `UPDATE ${quotas} SET used_bytes = GREATEST(used_bytes - $2::bigint, 0) WHERE tenant_id = $1`,
        [tenantId, bytesParam(bytes)],
      );
    },
    async usage(tenantId) {
      const { rows } = await db.query(`SELECT used_bytes FROM ${quotas} WHERE tenant_id = $1`, [tenantId]);
      return rows[0] ? Number(rows[0].used_bytes) : 0;
    },
    async claimScan(id, now, until) {
      const { rows } = await db.query(
        `UPDATE ${table} SET scan_claimed_until = $3::bigint
         WHERE id = $1 AND status = 'quarantined' AND (scan_claimed_until IS NULL OR scan_claimed_until <= $2::bigint)
         RETURNING ${COLUMNS}`,
        [id, now, until],
      );
      return rows[0] ? toRecord(rows[0]) : null;
    },
    async releaseScanClaim(id, until) {
      await db.query(`UPDATE ${table} SET scan_claimed_until = NULL WHERE id = $1 AND scan_claimed_until = $2::bigint`, [id, until]);
    },
    async listQuarantined(now, limit) {
      const { rows } = await db.query(
        `SELECT ${COLUMNS} FROM ${table}
         WHERE status = 'quarantined' AND (scan_claimed_until IS NULL OR scan_claimed_until <= $1::bigint)
         ORDER BY created_at LIMIT $2`,
        [now, limit],
      );
      return rows.map(toRecord);
    },
  };
}
