// SPDX-License-Identifier: Apache-2.0
// ShortLinkStore on PostgreSQL through any `query(text, params)` executor that uses $1 placeholders and returns
// { rows } (node-postgres Pool or Client, postgres.js via a thin wrapper, Neon serverless, PGlite). Apply
// schema.sql first. A click is one conditional UPDATE that checks disabled, expiry and max_clicks and increments
// in the same statement, so concurrent resolves can never push clicks past max_clicks.
import type { LinkCursor, ShortLink, ShortLinkPatch, ShortLinkStore } from "./core.js";

export interface SqlExecutor {
  query(text: string, params?: readonly unknown[]): Promise<{ rows: Record<string, unknown>[] }>;
  /** Runs `work` in one transaction. Optional; this store does not need it. */
  transaction?<T>(work: (tx: SqlExecutor) => Promise<T>): Promise<T>;
}

export interface SqlStoreOptions {
  /** Table name (default short_links). Letters, digits and underscores only. */
  readonly table?: string;
}

const COLUMNS = "id, tenant_id, code, url, created_by, created_at, expires_at, max_clicks, clicks, last_click_at, disabled";

function toLink(row: Record<string, unknown>): ShortLink {
  const text = (key: string) => String(row[key]);
  const time = (key: string) => (row[key] == null ? null : Number(row[key]));
  return {
    id: text("id"), tenantId: text("tenant_id"), code: text("code"), url: text("url"), createdBy: text("created_by"),
    createdAt: Number(row.created_at), expiresAt: time("expires_at"), maxClicks: time("max_clicks"), clicks: Number(row.clicks),
    lastClickAt: time("last_click_at"), disabled: row.disabled === true || row.disabled === "t",
  };
}

export function createSqlShortLinkStore(db: SqlExecutor, options: SqlStoreOptions = {}): ShortLinkStore {
  const table = options.table ?? "short_links";
  if (!/^[a-z_][a-z0-9_]{0,62}$/.test(table)) throw new RangeError("Invalid table name");
  const one = async (sql: string, params: unknown[]) => (await db.query(sql, params)).rows.map(toLink)[0] ?? null;

  return {
    async insert(link) {
      const { rows } = await db.query(
        `INSERT INTO ${table} (${COLUMNS}) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) ON CONFLICT (code) DO NOTHING RETURNING id`,
        [link.id, link.tenantId, link.code, link.url, link.createdBy, link.createdAt, link.expiresAt, link.maxClicks, link.clicks, link.lastClickAt, link.disabled],
      );
      return rows.length === 1;
    },
    findById: (id) => one(`SELECT ${COLUMNS} FROM ${table} WHERE id = $1`, [id]),
    findByCode: (code) => one(`SELECT ${COLUMNS} FROM ${table} WHERE code = $1`, [code]),
    async list(tenantId: string, page: { before: LinkCursor | null; limit: number }) {
      const { rows } = page.before === null
        ? await db.query(`SELECT ${COLUMNS} FROM ${table} WHERE tenant_id = $1 ORDER BY created_at DESC, id DESC LIMIT $2`, [tenantId, page.limit])
        : await db.query(
          `SELECT ${COLUMNS} FROM ${table} WHERE tenant_id = $1 AND (created_at, id) < ($2::bigint, $3::text) ORDER BY created_at DESC, id DESC LIMIT $4`,
          [tenantId, page.before.createdAt, page.before.id, page.limit],
        );
      return rows.map(toLink);
    },
    async update(id: string, patch: ShortLinkPatch) {
      // Column names come from this fixed list, never from the patch keys.
      const sets: string[] = [];
      const params: unknown[] = [id];
      const set = (column: string, value: unknown) => { params.push(value); sets.push(`${column} = $${params.length}`); };
      if (patch.url !== undefined) set("url", patch.url);
      if (patch.expiresAt !== undefined) set("expires_at", patch.expiresAt);
      if (patch.disabled !== undefined) set("disabled", patch.disabled);
      if (sets.length === 0) return one(`SELECT ${COLUMNS} FROM ${table} WHERE id = $1`, params);
      return one(`UPDATE ${table} SET ${sets.join(", ")} WHERE id = $1 RETURNING ${COLUMNS}`, params);
    },
    async delete(id) {
      return (await db.query(`DELETE FROM ${table} WHERE id = $1 RETURNING id`, [id])).rows.length === 1;
    },
    async recordClick(code, at) {
      const { rows } = await db.query(
        `UPDATE ${table} SET clicks = clicks + 1, last_click_at = $2
         WHERE code = $1 AND NOT disabled AND (expires_at IS NULL OR expires_at > $2) AND (max_clicks IS NULL OR clicks < max_clicks)
         RETURNING id, url`,
        [code, at],
      );
      const row = rows[0];
      return row ? { id: String(row.id), url: String(row.url) } : null;
    },
  };
}
