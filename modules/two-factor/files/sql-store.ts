// SPDX-License-Identifier: Apache-2.0
// TwoFactorStore on PostgreSQL through any `query(text, params)` executor that uses $1 placeholders and returns
// { rows } (node-postgres Pool or Client, postgres.js via a thin wrapper, Neon serverless, PGlite). Apply schema.sql
// first. Every check-and-write is ONE statement (conditional UPDATE ... RETURNING, an upsert, or data-modifying
// CTEs), so concurrent verifies of one code or one recovery code cannot both succeed and no transaction is needed.
import type { AttemptWindow, EncryptedSecret, TwoFactorEnrollment, TwoFactorStore } from "./core.js";

export interface SqlExecutor {
  query(text: string, params?: readonly unknown[]): Promise<{ rows: Record<string, unknown>[] }>;
}

export interface SqlTwoFactorStoreOptions {
  /** Table-name prefix (default two_factor): {prefix}_enrollments, {prefix}_recovery_codes, {prefix}_attempts. */
  readonly prefix?: string;
}

const COLUMNS = "user_id, status, key_id, iv, ciphertext, created_at, pending_expires_at, confirmed_at, last_used_step";

function toEnrollment(row: Record<string, unknown>): TwoFactorEnrollment {
  const text = (key: string) => String(row[key]);
  const time = (key: string) => Number(row[key]);
  return {
    userId: text("user_id"),
    status: text("status") === "active" ? "active" : "pending",
    secret: { keyId: text("key_id"), iv: text("iv"), ciphertext: text("ciphertext") },
    createdAt: time("created_at"),
    ...(row.pending_expires_at == null ? {} : { pendingExpiresAt: time("pending_expires_at") }),
    ...(row.confirmed_at == null ? {} : { confirmedAt: time("confirmed_at") }),
    lastUsedStep: row.last_used_step == null ? null : time("last_used_step"),
  };
}

export function createSqlTwoFactorStore(db: SqlExecutor, options: SqlTwoFactorStoreOptions = {}): TwoFactorStore {
  const prefix = options.prefix ?? "two_factor";
  if (!/^[a-z_][a-z0-9_]{0,40}$/.test(prefix)) throw new RangeError("Invalid table prefix");
  const E = `${prefix}_enrollments`;
  const C = `${prefix}_recovery_codes`;
  const A = `${prefix}_attempts`;

  return {
    async get(userId) {
      const { rows } = await db.query(`SELECT ${COLUMNS} FROM ${E} WHERE user_id = $1`, [userId]);
      return rows[0] ? toEnrollment(rows[0]) : null;
    },
    async savePending(e: TwoFactorEnrollment) {
      const { rows } = await db.query(
        `INSERT INTO ${E} (${COLUMNS}) VALUES ($1, 'pending', $2, $3, $4, $5, $6, NULL, NULL)
         ON CONFLICT (user_id) DO UPDATE SET status = 'pending', key_id = EXCLUDED.key_id, iv = EXCLUDED.iv,
           ciphertext = EXCLUDED.ciphertext, created_at = EXCLUDED.created_at,
           pending_expires_at = EXCLUDED.pending_expires_at, confirmed_at = NULL, last_used_step = NULL
         WHERE ${E}.status = 'pending'
         RETURNING user_id`,
        [e.userId, e.secret.keyId, e.secret.iv, e.secret.ciphertext, e.createdAt, e.pendingExpiresAt ?? null],
      );
      return rows.length === 1;
    },
    async activate(userId, ciphertext, step, now, recoveryHashes) {
      const { rows } = await db.query(
        `WITH a AS (
           UPDATE ${E} SET status = 'active', confirmed_at = $4, last_used_step = $3, pending_expires_at = NULL
           WHERE user_id = $1 AND status = 'pending' AND ciphertext = $2 AND pending_expires_at > $4
           RETURNING user_id),
         d AS (DELETE FROM ${C} WHERE user_id IN (SELECT user_id FROM a)),
         i AS (INSERT INTO ${C} (user_id, code_hash, created_at) SELECT a.user_id, h, $4 FROM a CROSS JOIN unnest($5::text[]) AS h)
         SELECT count(*)::int AS n FROM a`,
        [userId, ciphertext, step, now, [...recoveryHashes]],
      );
      return Number(rows[0]?.n) === 1;
    },
    async advanceStep(userId, step) {
      const { rows } = await db.query(
        `UPDATE ${E} SET last_used_step = $2 WHERE user_id = $1 AND status = 'active'
           AND (last_used_step IS NULL OR last_used_step < $2) RETURNING user_id`,
        [userId, step],
      );
      return rows.length === 1;
    },
    async updateSecret(userId, oldCiphertext, secret: EncryptedSecret) {
      const { rows } = await db.query(
        `UPDATE ${E} SET key_id = $3, iv = $4, ciphertext = $5 WHERE user_id = $1 AND ciphertext = $2 RETURNING user_id`,
        [userId, oldCiphertext, secret.keyId, secret.iv, secret.ciphertext],
      );
      return rows.length === 1;
    },
    async replaceRecoveryCodes(userId, recoveryHashes, now) {
      const { rows } = await db.query(
        `WITH a AS (SELECT user_id FROM ${E} WHERE user_id = $1 AND status = 'active' FOR UPDATE),
         d AS (DELETE FROM ${C} WHERE user_id IN (SELECT user_id FROM a)),
         i AS (INSERT INTO ${C} (user_id, code_hash, created_at) SELECT a.user_id, h, $3 FROM a CROSS JOIN unnest($2::text[]) AS h)
         SELECT count(*)::int AS n FROM a`,
        [userId, [...recoveryHashes], now],
      );
      return Number(rows[0]?.n) === 1;
    },
    async consumeRecoveryCode(userId, codeHash, now) {
      const { rows } = await db.query(
        `UPDATE ${C} SET used_at = $3 WHERE user_id = $1 AND code_hash = $2 AND used_at IS NULL RETURNING user_id`,
        [userId, codeHash, now],
      );
      return rows.length === 1;
    },
    async countRecoveryCodes(userId) {
      const { rows } = await db.query(`SELECT count(*)::int AS n FROM ${C} WHERE user_id = $1 AND used_at IS NULL`, [userId]);
      return Number(rows[0]?.n ?? 0);
    },
    async remove(userId) {
      const { rows } = await db.query(
        `WITH c AS (DELETE FROM ${C} WHERE user_id = $1), e AS (DELETE FROM ${E} WHERE user_id = $1 RETURNING user_id)
         SELECT count(*)::int AS n FROM e`,
        [userId],
      );
      return Number(rows[0]?.n) === 1;
    },
    async registerAttempt(userId, now, windowMs): Promise<AttemptWindow> {
      const { rows } = await db.query(
        `INSERT INTO ${A} (user_id, window_start, count) VALUES ($1, $2::bigint, 1)
         ON CONFLICT (user_id) DO UPDATE SET
           count = CASE WHEN ${A}.window_start <= $2::bigint - $3::bigint THEN 1 ELSE ${A}.count + 1 END,
           window_start = CASE WHEN ${A}.window_start <= $2::bigint - $3::bigint THEN $2::bigint ELSE ${A}.window_start END
         RETURNING count, window_start`,
        [userId, now, windowMs],
      );
      const row = rows[0] ?? {};
      return { count: Number(row.count), windowStart: Number(row.window_start) };
    },
    async clearAttempts(userId) {
      await db.query(`DELETE FROM ${A} WHERE user_id = $1`, [userId]);
    },
  };
}
