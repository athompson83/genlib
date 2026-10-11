// SPDX-License-Identifier: Apache-2.0
// EmailSignupStore on PostgreSQL through any `query(text, params)` executor that uses $1 placeholders and returns
// { rows } (node-postgres Pool or Client, postgres.js via a thin wrapper, Neon serverless, PGlite). Apply schema.sql
// first. Account creation is INSERT ... ON CONFLICT DO NOTHING against a unique email index; consuming a token,
// marking an account verified and reserving a send are each one conditional UPDATE ... RETURNING.
import type { EmailSignupStore, SignupAccount, VerificationToken } from "./core.js";

export interface SqlExecutor {
  query(text: string, params?: readonly unknown[]): Promise<{ rows: Record<string, unknown>[] }>;
}

export interface SqlEmailSignupStoreOptions {
  /** Default email_signup_accounts. Lowercase letters, digits and underscores only. */
  readonly accountsTable?: string;
  /** Default email_verification_tokens. Lowercase letters, digits and underscores only. */
  readonly tokensTable?: string;
}

const ACCOUNT_COLUMNS = "id, email, password_hash, created_at, verified_at, last_sent_at, send_window_start, send_window_count";
const TOKEN_COLUMNS = "id, account_id, token_hash, email, created_at, expires_at, used_at, revoked_at";
const NAME = /^[a-z_][a-z0-9_]{0,62}$/;

const optionalTime = (row: Record<string, unknown>, column: string, key: string): Record<string, number> =>
  row[column] == null ? {} : { [key]: Number(row[column]) };

function toAccount(row: Record<string, unknown>): SignupAccount {
  return {
    id: String(row.id), email: String(row.email), passwordHash: String(row.password_hash), createdAt: Number(row.created_at),
    sendWindowCount: Number(row.send_window_count ?? 0),
    ...optionalTime(row, "verified_at", "verifiedAt"),
    ...optionalTime(row, "last_sent_at", "lastSentAt"),
    ...optionalTime(row, "send_window_start", "sendWindowStart"),
  };
}

function toToken(row: Record<string, unknown>): VerificationToken {
  return {
    id: String(row.id), accountId: String(row.account_id), tokenHash: String(row.token_hash).trim(), email: String(row.email),
    createdAt: Number(row.created_at), expiresAt: Number(row.expires_at),
    ...optionalTime(row, "used_at", "usedAt"),
    ...optionalTime(row, "revoked_at", "revokedAt"),
  };
}

export function createSqlEmailSignupStore(db: SqlExecutor, options: SqlEmailSignupStoreOptions = {}): EmailSignupStore {
  const accounts = options.accountsTable ?? "email_signup_accounts";
  const tokens = options.tokensTable ?? "email_verification_tokens";
  if (!NAME.test(accounts) || !NAME.test(tokens)) throw new RangeError("Invalid table name");
  const pending = "used_at IS NULL AND revoked_at IS NULL";

  return {
    async createAccount(account) {
      const { rows } = await db.query(
        `INSERT INTO ${accounts} (${ACCOUNT_COLUMNS}) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) ON CONFLICT (email) DO NOTHING RETURNING id`,
        [account.id, account.email, account.passwordHash, account.createdAt, account.verifiedAt ?? null,
          account.lastSentAt ?? null, account.sendWindowStart ?? null, account.sendWindowCount],
      );
      return rows.length === 1;
    },
    async findAccountByEmail(email) {
      const { rows } = await db.query(`SELECT ${ACCOUNT_COLUMNS} FROM ${accounts} WHERE email = $1`, [email]);
      return rows[0] ? toAccount(rows[0]) : null;
    },
    async findAccountById(id) {
      const { rows } = await db.query(`SELECT ${ACCOUNT_COLUMNS} FROM ${accounts} WHERE id = $1`, [id]);
      return rows[0] ? toAccount(rows[0]) : null;
    },
    async markVerified(accountId, now) {
      const { rows } = await db.query(
        `UPDATE ${accounts} SET verified_at = $2 WHERE id = $1 AND verified_at IS NULL RETURNING id`, [accountId, now],
      );
      return rows.length === 1;
    },
    async reserveSend(accountId, now, limits) {
      // SET expressions read the old row, so the window test is evaluated once against the same values as WHERE.
      const open = "(send_window_start IS NOT NULL AND $2::bigint - send_window_start < $4::bigint)";
      const { rows } = await db.query(
        `UPDATE ${accounts} SET last_sent_at = $2::bigint,
           send_window_start = CASE WHEN ${open} THEN send_window_start ELSE $2::bigint END,
           send_window_count = CASE WHEN ${open} THEN send_window_count + 1 ELSE 1 END
         WHERE id = $1 AND verified_at IS NULL
           AND (last_sent_at IS NULL OR $2::bigint - last_sent_at >= $3::bigint)
           AND (NOT ${open} OR send_window_count < $5::integer)
         RETURNING id`,
        [accountId, now, limits.cooldownMs, limits.windowMs, limits.maxPerWindow],
      );
      return rows.length === 1;
    },
    async issueToken(token) {
      // One statement: the UPDATE's snapshot does not include the CTE's new row. It revokes the account's other
      // pending links that already exist and are not newer (created_at <= this one), so the link issued last always
      // survives and a link with a later created_at (a concurrent issue on a clock ahead) is never revoked.
      await db.query(
        `WITH inserted AS (
           INSERT INTO ${tokens} (${TOKEN_COLUMNS}) VALUES ($1, $2, $3, $4, $5::bigint, $6, $7, $8) RETURNING id
         )
         UPDATE ${tokens} SET revoked_at = $5::bigint
         WHERE account_id = $2 AND ${pending} AND id <> $1
           AND created_at <= $5::bigint
           AND EXISTS (SELECT 1 FROM inserted)`,
        [token.id, token.accountId, token.tokenHash, token.email, token.createdAt, token.expiresAt, token.usedAt ?? null, token.revokedAt ?? null],
      );
    },
    async findTokenByHash(tokenHash) {
      const { rows } = await db.query(`SELECT ${TOKEN_COLUMNS} FROM ${tokens} WHERE token_hash = $1`, [tokenHash]);
      return rows[0] ? toToken(rows[0]) : null;
    },
    async consumeToken(tokenHash, now) {
      const { rows } = await db.query(
        `UPDATE ${tokens} SET used_at = $2 WHERE token_hash = $1 AND ${pending} AND expires_at > $2 RETURNING ${TOKEN_COLUMNS}`,
        [tokenHash, now],
      );
      return rows[0] ? toToken(rows[0]) : null;
    },
    async revokeToken(id, now) {
      const { rows } = await db.query(`UPDATE ${tokens} SET revoked_at = $2 WHERE id = $1 AND ${pending} RETURNING id`, [id, now]);
      return rows.length === 1;
    },
    async revokePendingTokens(accountId, now, exceptId) {
      const { rows } = exceptId === undefined
        ? await db.query(`UPDATE ${tokens} SET revoked_at = $2 WHERE account_id = $1 AND ${pending} RETURNING id`, [accountId, now])
        : await db.query(`UPDATE ${tokens} SET revoked_at = $2 WHERE account_id = $1 AND id <> $3 AND ${pending} RETURNING id`, [accountId, now, exceptId]);
      return rows.length;
    },
  };
}
