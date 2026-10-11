// SPDX-License-Identifier: Apache-2.0
// PushSubscriptionStore on PostgreSQL through any `query(text, params)` executor that uses $1 placeholders and
// returns { rows } (node-postgres Pool or Client, postgres.js via a thin wrapper, Neon serverless, PGlite). Apply
// schema.sql first. Every state change is one statement: an upsert on the endpoint primary key (so concurrent
// subscribes of one browser leave one row), a DELETE ... RETURNING (so exactly one caller reports a removal),
// and an in-place failure_count increment.
import type { PushSubscriptionRecord, PushSubscriptionStore } from "./push.js";

export interface SqlExecutor {
  query(text: string, params?: readonly unknown[]): Promise<{ rows: Record<string, unknown>[] }>;
  /** Not needed by this store; accepted so one executor shape serves every Genlib SQL store. */
  transaction?<T>(work: (tx: SqlExecutor) => Promise<T>): Promise<T>;
}

export interface SqlPushStoreOptions {
  /** Table name (default push_subscriptions). Letters, digits and underscores only. */
  readonly table?: string;
}

const COLUMNS = "endpoint, user_id, p256dh, auth, created_at, last_success_at, failure_count";

function toRecord(row: Record<string, unknown>): PushSubscriptionRecord {
  return {
    endpoint: String(row.endpoint), userId: String(row.user_id), p256dh: String(row.p256dh), auth: String(row.auth),
    createdAt: Number(row.created_at), lastSuccessAt: row.last_success_at == null ? null : Number(row.last_success_at),
    failureCount: Number(row.failure_count),
  };
}

export function createSqlPushSubscriptionStore(db: SqlExecutor, options: SqlPushStoreOptions = {}): PushSubscriptionStore {
  const table = options.table ?? "push_subscriptions";
  if (!/^[a-z_][a-z0-9_]{0,62}$/.test(table)) throw new RangeError("Invalid table name");

  return {
    async upsert(subscription) {
      const { rows } = await db.query(
        `INSERT INTO ${table} (endpoint, user_id, p256dh, auth, created_at, failure_count) VALUES ($1, $2, $3, $4, $5, 0)
         ON CONFLICT (endpoint) DO UPDATE SET user_id = EXCLUDED.user_id, p256dh = EXCLUDED.p256dh, auth = EXCLUDED.auth, failure_count = 0
         RETURNING ${COLUMNS}`,
        [subscription.endpoint, subscription.userId, subscription.p256dh, subscription.auth, subscription.createdAt],
      );
      return toRecord(rows[0]!);
    },
    async listByUser(userId) {
      const { rows } = await db.query(`SELECT ${COLUMNS} FROM ${table} WHERE user_id = $1 ORDER BY created_at, endpoint`, [userId]);
      return rows.map(toRecord);
    },
    async remove(endpoint, userId) {
      const { rows } = userId === undefined
        ? await db.query(`DELETE FROM ${table} WHERE endpoint = $1 RETURNING endpoint`, [endpoint])
        : await db.query(`DELETE FROM ${table} WHERE endpoint = $1 AND user_id = $2 RETURNING endpoint`, [endpoint, userId]);
      return rows.length === 1;
    },
    async recordSuccess(endpoint, at) {
      await db.query(`UPDATE ${table} SET last_success_at = $2, failure_count = 0 WHERE endpoint = $1`, [endpoint, at]);
    },
    async recordFailure(endpoint) {
      const { rows } = await db.query(`UPDATE ${table} SET failure_count = failure_count + 1 WHERE endpoint = $1 RETURNING failure_count`, [endpoint]);
      return rows.length === 1 ? Number(rows[0]!.failure_count) : null;
    },
  };
}
