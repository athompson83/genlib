// SPDX-License-Identifier: Apache-2.0
import { createHash, randomUUID } from 'node:crypto';

/** A pg Pool/Client or transaction-scoped adapter. SQL values are always bound parameters. */
export interface SqlExecutor { query(text: string, values?: unknown[]): Promise<{ rows: Record<string, unknown>[]; rowCount?: number | null }> }
export interface VerifiedWebhook { tenantId: string; provider: string; eventId: string; rawBody: Uint8Array; payload: unknown }
export interface InboxLease {
  id: string; token: string; tenantId: string; provider: string; eventId: string;
  payload: unknown; attempt: number; idempotencyKey: string;
}
export class WebhookIdentityConflict extends Error { override name = 'WebhookIdentityConflict' }
export class LostInboxLease extends Error { override name = 'LostInboxLease' }

function positive(value: number, max: number, label: string) { if (!Number.isSafeInteger(value) || value < 1 || value > max) throw new Error(`Invalid ${label}.`); }
function scope(value: string) { if (!value || value.length > 200 || /[\u0000-\u001f]/u.test(value)) throw new Error('Invalid webhook identity.'); }
function key(tenant: string, provider: string, event: string) { return createHash('sha256').update(JSON.stringify([tenant, provider, event])).digest('hex'); }
function leaseFrom(row: Record<string, unknown>): InboxLease {
  return { id: String(row.id), token: String(row.lease_token), tenantId: String(row.tenant_id), provider: String(row.provider), eventId: String(row.event_id),
    payload: row.payload, attempt: Number(row.attempts), idempotencyKey: key(String(row.tenant_id), String(row.provider), String(row.event_id)) };
}

export class PostgresWebhookInbox {
  constructor(private readonly db: SqlExecutor) {}

  /** Call only after provider signature, timestamp and tenant authorization checks succeed. */
  async receiveVerified(event: VerifiedWebhook): Promise<{ id: string; duplicate: boolean; state: string }> {
    scope(event.tenantId); scope(event.provider); scope(event.eventId);
    if (event.rawBody.byteLength > 1_048_576) throw new Error('Webhook body exceeds 1 MiB.');
    const payload = JSON.stringify(event.payload);
    if (payload === undefined || Buffer.byteLength(payload) > 1_048_576) throw new Error('Invalid or oversized webhook payload.');
    const hash = createHash('sha256').update(event.rawBody).digest('hex');
    const result = await this.db.query(`INSERT INTO genlib_webhook_inbox (tenant_id, provider, event_id, payload_hash, payload)
      VALUES ($1,$2,$3,$4,$5::jsonb)
      ON CONFLICT (tenant_id, provider, event_id) DO UPDATE
      SET received_count = genlib_webhook_inbox.received_count + 1, last_seen_at = now()
      WHERE genlib_webhook_inbox.payload_hash = EXCLUDED.payload_hash
      RETURNING id, received_count, state`, [event.tenantId, event.provider, event.eventId, hash, payload]);
    const row = result.rows[0];
    if (!row) throw new WebhookIdentityConflict('The same webhook identity was received with different bytes.');
    return { id: String(row.id), duplicate: Number(row.received_count) > 1, state: String(row.state) };
  }

  async claim(options: { leaseSeconds?: number; maxAttempts?: number } = {}): Promise<InboxLease | null> {
    const seconds = options.leaseSeconds ?? 60, max = options.maxAttempts ?? 8;
    positive(seconds, 3_600, 'lease duration'); positive(max, 100, 'attempt limit');
    const token = randomUUID();
    const result = await this.db.query(`WITH exhausted AS (
      UPDATE genlib_webhook_inbox SET state = 'dead', lease_token = NULL, lease_until = NULL,
        last_error = 'Lease expired after maximum attempts'
      WHERE ((state = 'processing' AND lease_until <= now()) OR state = 'pending') AND attempts >= $3 RETURNING id
    ), candidate AS (
      SELECT id FROM genlib_webhook_inbox
      WHERE ((state = 'pending' AND available_at <= now()) OR (state = 'processing' AND lease_until <= now())) AND attempts < $3
      ORDER BY available_at, id FOR UPDATE SKIP LOCKED LIMIT 1
    ) UPDATE genlib_webhook_inbox AS inbox SET state = 'processing', attempts = attempts + 1,
      lease_token = $1::uuid, lease_until = now() + $2 * interval '1 second'
      FROM candidate WHERE inbox.id = candidate.id RETURNING inbox.*`, [token, seconds, max]);
    return result.rows[0] ? leaseFrom(result.rows[0]) : null;
  }

  async extend(lease: InboxLease, seconds = 60): Promise<void> {
    positive(seconds, 3_600, 'lease duration');
    const result = await this.db.query(`UPDATE genlib_webhook_inbox SET lease_until = now() + $3 * interval '1 second'
      WHERE id = $1 AND lease_token = $2::uuid AND state = 'processing' AND lease_until > now() RETURNING id`, [lease.id, lease.token, seconds]);
    if (!result.rows.length) throw new LostInboxLease('Webhook lease expired or was replaced.');
  }

  async complete(lease: InboxLease, output: unknown = null): Promise<void> {
    const encoded = JSON.stringify(output);
    if (encoded === undefined || Buffer.byteLength(encoded) > 65_536) throw new Error('Inbox output must be JSON within 64 KiB.');
    const result = await this.db.query(`UPDATE genlib_webhook_inbox SET state = 'complete', output = $3::jsonb,
      completed_at = now(), lease_token = NULL, lease_until = NULL, last_error = NULL
      WHERE id = $1 AND lease_token = $2::uuid AND state = 'processing' AND lease_until > now() RETURNING id`, [lease.id, lease.token, encoded]);
    if (!result.rows.length) throw new LostInboxLease('Webhook lease expired or was replaced.');
  }

  async fail(lease: InboxLease, safeMessage: string, options: { retryAfterSeconds?: number; maxAttempts?: number } = {}): Promise<void> {
    const retry = options.retryAfterSeconds ?? 60, max = options.maxAttempts ?? 8;
    positive(retry, 604_800, 'retry delay'); positive(max, 100, 'attempt limit');
    const result = await this.db.query(`UPDATE genlib_webhook_inbox SET state = CASE WHEN attempts >= $5 THEN 'dead' ELSE 'pending' END,
      available_at = now() + $3 * interval '1 second', lease_token = NULL, lease_until = NULL, last_error = $4
      WHERE id = $1 AND lease_token = $2::uuid AND state = 'processing' AND lease_until > now() RETURNING id`, [lease.id, lease.token, retry, safeMessage.slice(0, 2_000), max]);
    if (!result.rows.length) throw new LostInboxLease('Webhook lease expired or was replaced.');
  }
}

/** Runs one claim. The stable key must also be honored by any external side-effect provider. */
export async function processInboxOnce(inbox: PostgresWebhookInbox, handler: (lease: InboxLease) => Promise<unknown>): Promise<'empty' | 'complete' | 'retry'> {
  const lease = await inbox.claim(); if (!lease) return 'empty';
  try { const result = await handler(lease); await inbox.complete(lease, result); return 'complete'; }
  catch (error) {
    if (error instanceof LostInboxLease) throw error;
    await inbox.fail(lease, 'Handler failed; inspect application logs using the inbox ID.');
    return 'retry';
  }
}
