// SPDX-License-Identifier: Apache-2.0
// AccountDeletionStore on PostgreSQL through any `query(text, params)` executor that uses $1 placeholders and
// returns { rows } (node-postgres Pool or Client, postgres.js via a thin wrapper, Neon serverless, PGlite). Apply
// schema.sql first. Every state change is one conditional statement: the claim is a single
// UPDATE ... WHERE id IN (SELECT ... FOR UPDATE SKIP LOCKED) that re-checks the due condition, so concurrent
// workers never claim the same request, and renew/step/complete/release only succeed while the caller holds the lease.
import type { AccountDeletionStore, DeletionRequest, DeletionStatus } from "./core.js";

export interface SqlExecutor {
  query(text: string, params?: readonly unknown[]): Promise<{ rows: Record<string, unknown>[] }>;
  /** Runs `work` in one transaction. Optional; this store does not need it. */
  transaction?<T>(work: (tx: SqlExecutor) => Promise<T>): Promise<T>;
}

export interface SqlStoreOptions {
  /** Table name (default account_deletions). Letters, digits and underscores only. */
  readonly table?: string;
}

const COLUMNS = "id, user_id, requested_by, requested_at, scheduled_for, status, reason, cancelled_at, cancelled_by, completed_at, claim_token, claim_expires_at, attempts, completed_steps, last_error";
const DUE = "((status = 'pending' AND scheduled_for <= $1) OR (status = 'executing' AND claim_expires_at <= $1))";

function steps(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String);
  // Drivers without array parsing return the text form {a,b}.
  if (typeof value === "string" && value.startsWith("{") && value.endsWith("}")) {
    const inner = value.slice(1, -1);
    return inner === "" ? [] : inner.split(",").map((item) => item.replace(/^"|"$/g, ""));
  }
  return [];
}

function toRequest(row: Record<string, unknown>): DeletionRequest {
  const text = (key: string) => String(row[key]);
  const maybeText = (key: string) => (row[key] == null ? null : String(row[key]));
  const time = (key: string) => (row[key] == null ? null : Number(row[key]));
  return {
    id: text("id"), userId: text("user_id"), requestedBy: text("requested_by"), requestedAt: Number(row.requested_at),
    scheduledFor: Number(row.scheduled_for), status: text("status") as DeletionStatus, reason: maybeText("reason"),
    cancelledAt: time("cancelled_at"), cancelledBy: maybeText("cancelled_by"), completedAt: time("completed_at"),
    claimToken: maybeText("claim_token"), claimExpiresAt: time("claim_expires_at"), attempts: Number(row.attempts),
    completedSteps: steps(row.completed_steps), lastError: maybeText("last_error"),
  };
}

export function createSqlAccountDeletionStore(db: SqlExecutor, options: SqlStoreOptions = {}): AccountDeletionStore {
  const table = options.table ?? "account_deletions";
  if (!/^[a-z_][a-z0-9_]{0,62}$/.test(table)) throw new RangeError("Invalid table name");
  const one = async (sql: string, params: unknown[]) => (await db.query(sql, params)).rows.map(toRequest)[0] ?? null;
  const changed = async (sql: string, params: unknown[]) => (await db.query(sql, params)).rows.length === 1;

  return {
    async insert(r) {
      return changed(
        `INSERT INTO ${table} (${COLUMNS}) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
         ON CONFLICT (user_id) WHERE status IN ('pending', 'executing', 'completed') DO NOTHING RETURNING id`,
        [r.id, r.userId, r.requestedBy, r.requestedAt, r.scheduledFor, r.status, r.reason, r.cancelledAt, r.cancelledBy, r.completedAt,
          r.claimToken, r.claimExpiresAt, r.attempts, [...r.completedSteps], r.lastError],
      );
    },
    findById: (id) => one(`SELECT ${COLUMNS} FROM ${table} WHERE id = $1`, [id]),
    findLatest: (userId) => one(`SELECT ${COLUMNS} FROM ${table} WHERE user_id = $1 ORDER BY requested_at DESC, id DESC LIMIT 1`, [userId]),
    discard: (id) => changed(`DELETE FROM ${table} WHERE id = $1 AND status = 'pending' RETURNING id`, [id]),
    cancel: (id, by, at) => one(
      `UPDATE ${table} SET status = 'cancelled', cancelled_at = $3, cancelled_by = $2
       WHERE id = $1 AND status = 'pending' AND scheduled_for > $3 RETURNING ${COLUMNS}`,
      [id, by, at],
    ),
    async claimDue(at, limit, token, leaseUntil) {
      const { rows } = await db.query(
        `UPDATE ${table} SET status = 'executing', claim_token = $2, claim_expires_at = $3, attempts = attempts + 1
         WHERE id IN (SELECT id FROM ${table} WHERE ${DUE} ORDER BY scheduled_for, id LIMIT $4 FOR UPDATE SKIP LOCKED)
           AND ${DUE}
         RETURNING ${COLUMNS}`,
        [at, token, leaseUntil, limit],
      );
      return rows.map(toRequest).sort((a, b) => a.scheduledFor - b.scheduledFor || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    },
    renew: (id, token, leaseUntil) => changed(
      `UPDATE ${table} SET claim_expires_at = $3 WHERE id = $1 AND status = 'executing' AND claim_token = $2 RETURNING id`,
      [id, token, leaseUntil],
    ),
    recordStep: (id, token, step, leaseUntil) => changed(
      `UPDATE ${table}
       SET completed_steps = CASE WHEN $3 = ANY(completed_steps) THEN completed_steps ELSE array_append(completed_steps, $3::text) END,
           claim_expires_at = $4
       WHERE id = $1 AND status = 'executing' AND claim_token = $2 RETURNING id`,
      [id, token, step, leaseUntil],
    ),
    complete: (id, token, at) => changed(
      `UPDATE ${table} SET status = 'completed', completed_at = $3, claim_token = NULL, claim_expires_at = NULL, last_error = NULL
       WHERE id = $1 AND status = 'executing' AND claim_token = $2 RETURNING id`,
      [id, token, at],
    ),
    release: (id, token, retryAt, error) => changed(
      `UPDATE ${table} SET claim_token = NULL, claim_expires_at = $3, last_error = $4
       WHERE id = $1 AND status = 'executing' AND claim_token = $2 RETURNING id`,
      [id, token, retryAt, error],
    ),
  };
}
