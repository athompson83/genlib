import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { PostgresWebhookInbox, WebhookIdentityConflict, LostInboxLease, processInboxOnce } from '../.build/inbox.js';
import { createJobRunner } from '../.build/jobs.js';
const schema = await readFile(new URL('../src/inbox.sql', import.meta.url), 'utf8');
const raw = await readFile(new URL('../fixtures/webhook.json', import.meta.url));
const event = { tenantId: 'tenant-a', provider: 'provider-a', eventId: 'event-100', rawBody: raw, payload: JSON.parse(raw) };

async function fixture(t) { const db = new PGlite(); t.after(() => db.close()); await db.exec(schema); return { db, inbox: new PostgresWebhookInbox(db) }; }

test('real PostgreSQL engine enforces durable deduplication and detects changed bytes', async t => {
  const { db, inbox } = await fixture(t);
  const first = await inbox.receiveVerified(event), duplicate = await inbox.receiveVerified(event);
  assert.equal(first.duplicate, false); assert.equal(duplicate.duplicate, true); assert.equal(duplicate.id, first.id);
  await assert.rejects(inbox.receiveVerified({ ...event, rawBody: Buffer.from('different') }), WebhookIdentityConflict);
  const newTenant = await inbox.receiveVerified({ ...event, tenantId: 'tenant-b' }); assert.notEqual(newTenant.id, first.id);
  const recreated = new PostgresWebhookInbox(db); assert.equal((await recreated.receiveVerified(event)).duplicate, true);
});

test('claims are distinct and stale owners cannot complete or extend a replaced lease', async t => {
  const { db, inbox } = await fixture(t); await inbox.receiveVerified(event);
  const lease = await inbox.claim(); assert.ok(lease); assert.equal(await inbox.claim(), null);
  await db.query("UPDATE genlib_webhook_inbox SET lease_until = now() - interval '1 second' WHERE id = $1", [lease.id]);
  const replacement = await inbox.claim(); assert.ok(replacement); assert.notEqual(replacement.token, lease.token);
  assert.equal(replacement.idempotencyKey, lease.idempotencyKey); assert.equal(replacement.attempt, 2);
  await assert.rejects(inbox.complete(lease), LostInboxLease); await assert.rejects(inbox.extend(lease), LostInboxLease);
  await inbox.complete(replacement, { processed: true });
  assert.equal(await inbox.claim(), null); assert.equal((await inbox.receiveVerified(event)).state, 'complete');
});

test('failed jobs respect retry availability and become dead at the attempt ceiling', async t => {
  const { db, inbox } = await fixture(t); await inbox.receiveVerified(event);
  const first = await inbox.claim({ maxAttempts: 2 }); await inbox.fail(first, 'Transient failure', { maxAttempts: 2 });
  assert.equal(await inbox.claim({ maxAttempts: 2 }), null);
  await db.query("UPDATE genlib_webhook_inbox SET available_at = now() - interval '1 second'");
  const second = await inbox.claim({ maxAttempts: 2 }); await inbox.fail(second, 'Permanent failure', { maxAttempts: 2 });
  assert.equal((await db.query('SELECT state FROM genlib_webhook_inbox')).rows[0].state, 'dead');
});

test('expired final attempt is dead-lettered and successful processing records output', async t => {
  const { db, inbox } = await fixture(t); await inbox.receiveVerified(event);
  await inbox.claim({ maxAttempts: 1 });
  await db.query("UPDATE genlib_webhook_inbox SET lease_until = now() - interval '1 second'");
  assert.equal(await inbox.claim({ maxAttempts: 1 }), null);
  assert.equal((await db.query('SELECT state FROM genlib_webhook_inbox')).rows[0].state, 'dead');
  await inbox.receiveVerified({ ...event, eventId: 'event-101' });
  assert.equal(await processInboxOnce(inbox, async lease => ({ key: lease.idempotencyKey })), 'complete');
});

test('pg-boss package loads and runner refuses work before explicit startup', async () => {
  const runner = createJobRunner({ connectionString: 'postgres://test:test@127.0.0.1/unused', onError() {} });
  await assert.rejects(runner.enqueue('reports', {}), /Start/);
  await assert.rejects(runner.register('reports', value => value, async () => {}), /Start/);
});
