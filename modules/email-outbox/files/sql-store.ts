// SPDX-License-Identifier: Apache-2.0
// EmailOutboxStore on PostgreSQL through any `query(text, params)` executor that uses $1 placeholders and returns
// { rows } (node-postgres Pool or Client, postgres.js via a thin wrapper, Neon serverless, PGlite). Apply schema.sql
// first. Claims are one UPDATE over a `FOR UPDATE SKIP LOCKED` subquery, so concurrent dispatchers on separate
// connections never claim the same row; completion and event transitions are single conditional UPDATEs.
import type { CompletePatch, EmailMessage, EmailOutboxStore, EmailStatus } from "./core.js";

export interface SqlExecutor {
  query(text: string, params?: readonly unknown[]): Promise<{ rows: Record<string, unknown>[] }>;
  /** Optional; not needed by this store, accepted so the same executor can be shared with other Genlib stores. */
  transaction?<T>(work: (tx: SqlExecutor) => Promise<T>): Promise<T>;
}

export interface SqlStoreOptions {
  /** Outbox table name (default email_outbox). Letters, digits and underscores only. */
  readonly table?: string;
  /** Suppression table name (default email_suppressions). */
  readonly suppressionTable?: string;
}

const COLUMNS = "id, key, tenant_id, to_addr, subject, text_body, html_body, tags, fingerprint, status, attempts, " +
  "next_attempt_at, lease_owner, lease_expires_at, provider_id, last_error, created_at, sent_at";

function toMessage(row: Record<string, unknown>): EmailMessage {
  const text = (key: string) => String(row[key]);
  const optText = (key: string) => (row[key] == null ? null : String(row[key]));
  const optTime = (key: string) => (row[key] == null ? null : Number(row[key]));
  const tags = typeof row.tags === "string" ? JSON.parse(row.tags) : (row.tags ?? {});
  return {
    id: text("id"), key: text("key"), tenantId: optText("tenant_id"), to: text("to_addr"), subject: text("subject"),
    text: text("text_body"), html: optText("html_body"), tags: tags as Record<string, string>, fingerprint: text("fingerprint").trim(),
    status: text("status") as EmailStatus, attempts: Number(row.attempts), nextAttemptAt: Number(row.next_attempt_at),
    leaseOwner: optText("lease_owner"), leaseExpiresAt: optTime("lease_expires_at"), providerId: optText("provider_id"),
    lastError: optText("last_error"), createdAt: Number(row.created_at), sentAt: optTime("sent_at"),
  };
}

const NAME = /^[a-z_][a-z0-9_]{0,62}$/;

export function createSqlEmailOutboxStore(db: SqlExecutor, options: SqlStoreOptions = {}): EmailOutboxStore {
  const table = options.table ?? "email_outbox";
  const suppressions = options.suppressionTable ?? "email_suppressions";
  if (!NAME.test(table) || !NAME.test(suppressions)) throw new RangeError("Invalid table name");
  const one = async (sql: string, params: unknown[]) => (await db.query(sql, params)).rows.map(toMessage)[0] ?? null;

  return {
    async insertIfAbsent(m) {
      const inserted = await one(
        `INSERT INTO ${table} (${COLUMNS}) VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
         ON CONFLICT (key) DO NOTHING RETURNING ${COLUMNS}`,
        [m.id, m.key, m.tenantId, m.to, m.subject, m.text, m.html, JSON.stringify(m.tags), m.fingerprint, m.status, m.attempts,
          m.nextAttemptAt, m.leaseOwner, m.leaseExpiresAt, m.providerId, m.lastError, m.createdAt, m.sentAt],
      );
      return inserted ?? (await one(`SELECT ${COLUMNS} FROM ${table} WHERE key = $1`, [m.key]))!;
    },
    findByKey: (key) => one(`SELECT ${COLUMNS} FROM ${table} WHERE key = $1`, [key]),
    findByProviderId: (providerId) => one(`SELECT ${COLUMNS} FROM ${table} WHERE provider_id = $1 LIMIT 1`, [providerId]),
    async claim({ now, limit, workerId, leaseMs }) {
      const due = `(status = 'queued' AND next_attempt_at <= $1) OR (status = 'sending' AND lease_expires_at < $1)`;
      const { rows } = await db.query(
        `UPDATE ${table} SET status = 'sending', lease_owner = $3, lease_expires_at = $1::bigint + $4::bigint, attempts = attempts + 1
         WHERE id IN (SELECT id FROM ${table} WHERE ${due} ORDER BY next_attempt_at LIMIT $2 FOR UPDATE SKIP LOCKED)
           AND (${due})
         RETURNING ${COLUMNS}`,
        [now, limit, workerId, leaseMs],
      );
      return rows.map(toMessage).sort((a, b) => a.nextAttemptAt - b.nextAttemptAt || a.createdAt - b.createdAt);
    },
    async complete(id, workerId, patch: CompletePatch) {
      const { rows } = await db.query(
        `UPDATE ${table} SET status = $3, lease_owner = NULL, lease_expires_at = NULL,
           provider_id = COALESCE($4, provider_id),
           last_error = CASE WHEN $3 = 'sent' THEN NULL ELSE COALESCE($5, last_error) END,
           next_attempt_at = COALESCE($6::bigint, next_attempt_at), sent_at = COALESCE($7::bigint, sent_at)
         WHERE id = $1 AND status = 'sending' AND lease_owner = $2 RETURNING id`,
        [id, workerId, patch.status, patch.providerId ?? null, patch.lastError ?? null, patch.nextAttemptAt ?? null, patch.sentAt ?? null],
      );
      return rows.length === 1;
    },
    cancel: (key) => one(`UPDATE ${table} SET status = 'cancelled' WHERE key = $1 AND status = 'queued' RETURNING ${COLUMNS}`, [key]),
    transitionByProviderId: (providerId, from, to) => one(
      `UPDATE ${table} SET status = $3 WHERE provider_id = $1 AND status = ANY($2::text[]) RETURNING ${COLUMNS}`,
      [providerId, [...from], to],
    ),
    async suppress(address, reason, at) {
      await db.query(`INSERT INTO ${suppressions} (address, reason, at) VALUES ($1, $2, $3) ON CONFLICT (address) DO NOTHING`, [address, reason, at]);
    },
    async isSuppressed(address) {
      return (await db.query(`SELECT 1 FROM ${suppressions} WHERE address = $1`, [address])).rows.length > 0;
    },
  };
}
