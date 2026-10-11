// SPDX-License-Identifier: Apache-2.0
// PasswordResetStore on PostgreSQL through any `query(text, params)` executor that uses $1 placeholders and returns
// { rows } (node-postgres Pool or Client, postgres.js via a thin wrapper, Neon serverless, PGlite). Apply schema.sql
// first. Consuming a token is one conditional UPDATE ... RETURNING, so only one concurrent consumer can win.
import type { PasswordResetStore, ResetToken } from "./core.js";

export interface SqlExecutor {
  query(text: string, params?: readonly unknown[]): Promise<{ rows: Record<string, unknown>[] }>;
  /** Runs `work` in one transaction (BEGIN/COMMIT, rollback on throw). Optional; this store does not need it. */
  transaction?<T>(work: (tx: SqlExecutor) => Promise<T>): Promise<T>;
}

export interface SqlPasswordResetStoreOptions {
  /** Table name (default password_reset_tokens). Lowercase letters, digits and underscores only. */
  readonly table?: string;
}

const COLUMNS = "id, user_id, token_hash, email, created_at, expires_at, used_at, revoked_at";

function toToken(row: Record<string, unknown>): ResetToken {
  const text = (key: string) => String(row[key]);
  const time = (key: string) => Number(row[key]);
  return {
    id: text("id"), userId: text("user_id"), tokenHash: text("token_hash").trim(), email: text("email"),
    createdAt: time("created_at"), expiresAt: time("expires_at"),
    ...(row.used_at == null ? {} : { usedAt: time("used_at") }),
    ...(row.revoked_at == null ? {} : { revokedAt: time("revoked_at") }),
  };
}

export function createSqlPasswordResetStore(db: SqlExecutor, options: SqlPasswordResetStoreOptions = {}): PasswordResetStore {
  const table = options.table ?? "password_reset_tokens";
  if (!/^[a-z_][a-z0-9_]{0,62}$/.test(table)) throw new RangeError("Invalid table name");
  const pending = "used_at IS NULL AND revoked_at IS NULL";

  return {
    async insert(token) {
      await db.query(
        `INSERT INTO ${table} (${COLUMNS}) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [token.id, token.userId, token.tokenHash, token.email, token.createdAt, token.expiresAt, token.usedAt ?? null, token.revokedAt ?? null],
      );
    },
    async findByTokenHash(tokenHash) {
      const { rows } = await db.query(`SELECT ${COLUMNS} FROM ${table} WHERE token_hash = $1`, [tokenHash]);
      return rows[0] ? toToken(rows[0]) : null;
    },
    async listPending(userId, now) {
      const { rows } = await db.query(
        `SELECT ${COLUMNS} FROM ${table} WHERE user_id = $1 AND ${pending} AND expires_at > $2 ORDER BY created_at DESC, id DESC`,
        [userId, now],
      );
      return rows.map(toToken);
    },
    async consume(tokenHash, now) {
      const { rows } = await db.query(
        `UPDATE ${table} SET used_at = $2 WHERE token_hash = $1 AND ${pending} AND expires_at > $2 RETURNING ${COLUMNS}`,
        [tokenHash, now],
      );
      return rows[0] ? toToken(rows[0]) : null;
    },
    async revoke(id, now) {
      const { rows } = await db.query(`UPDATE ${table} SET revoked_at = $2 WHERE id = $1 AND ${pending} RETURNING id`, [id, now]);
      return rows.length === 1;
    },
    async revokePending(userId, now, exceptId) {
      const { rows } = exceptId === undefined
        ? await db.query(`UPDATE ${table} SET revoked_at = $2 WHERE user_id = $1 AND ${pending} RETURNING id`, [userId, now])
        : await db.query(`UPDATE ${table} SET revoked_at = $2 WHERE user_id = $1 AND id <> $3 AND ${pending} RETURNING id`, [userId, now, exceptId]);
      return rows.length;
    },
  };
}
