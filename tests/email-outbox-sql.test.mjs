// SPDX-License-Identifier: Apache-2.0
// email-outbox on real PostgreSQL semantics (PGlite, Postgres compiled to WASM): schema.sql applies, the SQL store
// keeps the core behaviors (idempotent insert, retries, lease reclaim, events, suppression, cancel), and concurrent
// dispatchers never send the same message twice. PGlite runs one connection, so concurrency here interleaves
// statements on that connection; SKIP LOCKED across connections is exercised only on a multi-connection server.
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { createEmailOutbox } from '../.build/modules/email-outbox/files/core.js';
import { createSqlEmailOutboxStore } from '../.build/modules/email-outbox/files/sql-store.js';

const schema = readFileSync(new URL('../modules/email-outbox/files/schema.sql', import.meta.url), 'utf8');
const templates = { note: data => ({ subject: `Note ${data.n}`, text: `Body ${data.n}` }) };

async function setup(transport, extra = {}) {
  const db = new PGlite();
  await db.exec(schema);
  let now = 1_000_000;
  let ids = 0;
  const store = createSqlEmailOutboxStore({ query: (text, params) => db.query(text, params) });
  const make = (t = transport) => createEmailOutbox({ store, transport: t, templates, from: 'a@acme.example', now: () => now, newId: () => 'id-' + ++ids, backoff: () => 1000, ...extra });
  return { db, store, outbox: make(), make, advance: ms => { now += ms; }, at: () => now };
}

test('schema applies and the SQL store keeps the core behavior', async () => {
  const results = [{ status: 'retryable', error: 'http 503' }];
  const transport = { send: async () => results.shift() ?? { status: 'sent', providerId: 'prov-1' } };
  const { db, store, outbox, advance } = await setup(transport);
  const first = await outbox.enqueue({ key: 'k1', to: 'Ann@example.com', template: 'note', data: { n: 1 }, tenantId: 'acme', tags: { kind: 'note' } });
  assert.equal((await outbox.enqueue({ key: 'k1', to: 'Ann@example.com', template: 'note', data: { n: 1 }, tenantId: 'acme', tags: { kind: 'note' } })).id, first.id);
  await assert.rejects(outbox.enqueue({ key: 'k1', to: 'Ann@example.com', template: 'note', data: { n: 2 }, tenantId: 'acme' }), { code: 'key-reused' });
  const row = (await db.query('SELECT to_addr, status, tags, tenant_id FROM email_outbox WHERE key = $1', ['k1'])).rows[0];
  assert.deepEqual(row, { to_addr: 'Ann@example.com', status: 'queued', tags: { kind: 'note' }, tenant_id: 'acme' });

  assert.equal((await outbox.dispatch({ workerId: 'w1' })).retried, 1);
  let message = await outbox.get('k1');
  assert.equal(message.status, 'queued');
  assert.equal(message.attempts, 1);
  assert.equal(message.lastError, 'http 503');
  advance(1000);
  assert.equal((await outbox.dispatch({ workerId: 'w1' })).sent, 1);
  message = await outbox.get('k1');
  assert.deepEqual([message.status, message.providerId, message.lastError, message.attempts], ['sent', 'prov-1', null, 2]);
  assert.deepEqual(message.tags, { kind: 'note' });

  assert.equal((await outbox.handleEvent({ type: 'delivered', providerId: 'prov-1', at: 5 })).applied, true);
  assert.equal((await outbox.handleEvent({ type: 'delivered', providerId: 'prov-1', at: 5 })).applied, false);
  assert.equal((await outbox.handleEvent({ type: 'bounced', providerId: 'prov-1', at: 6, hard: true })).applied, true);
  assert.equal((await outbox.handleEvent({ type: 'bounced', providerId: 'prov-1', at: 6, hard: true })).applied, false);
  assert.deepEqual((await db.query('SELECT address, reason FROM email_suppressions')).rows, [{ address: 'ann@example.com', reason: 'hard-bounce' }]);
  await assert.rejects(outbox.enqueue({ key: 'k2', to: 'ann@EXAMPLE.com', template: 'note', data: { n: 3 } }), { code: 'suppressed' });

  await outbox.enqueue({ key: 'c', to: 'b@example.com', template: 'note', data: { n: 4 } });
  assert.equal((await outbox.cancel('c')).status, 'cancelled');
  await assert.rejects(outbox.cancel('c'), { code: 'not-cancellable' });

  // Lease reclaim: a crashed claim is retaken after expiry, and the stale owner cannot complete.
  await outbox.enqueue({ key: 'crash', to: 'c@example.com', template: 'note', data: { n: 5 } });
  const [claimed] = await store.claim({ now: 1_001_000, limit: 5, workerId: 'dead-worker', leaseMs: 5000 });
  assert.equal(claimed.key, 'crash');
  assert.equal((await outbox.dispatch({ workerId: 'w2' })).claimed, 0);
  advance(5001);
  assert.equal((await outbox.dispatch({ workerId: 'w2' })).sent, 1);
  assert.equal(await store.complete(claimed.id, 'dead-worker', { status: 'failed' }), false);
  assert.equal((await outbox.get('crash')).attempts, 2);
  assert.throws(() => createSqlEmailOutboxStore({ query: async () => ({ rows: [] }) }, { table: 'x; drop' }), RangeError);
});

test('concurrent dispatchers never send the same message twice', async () => {
  const sends = [];
  const transport = {
    async send(message, { idempotencyKey }) {
      sends.push(idempotencyKey);
      await new Promise(resolve => setTimeout(resolve, 1));
      return { status: 'sent', providerId: 'p-' + idempotencyKey };
    },
  };
  const { db, outbox, make } = await setup(transport);
  for (let n = 0; n < 60; n++) await outbox.enqueue({ key: 'm' + n, to: `u${n}@example.com`, template: 'note', data: { n } });
  const workers = Array.from({ length: 6 }, () => make());
  const summaries = await Promise.all(workers.map((worker, i) => worker.dispatch({ workerId: 'w' + i, batch: 7 })));
  const again = await Promise.all(workers.map((worker, i) => worker.dispatch({ workerId: 'w' + i, batch: 7 })));
  const more = await Promise.all(workers.map((worker, i) => worker.dispatch({ workerId: 'w' + i, batch: 7 })));
  const total = [...summaries, ...again, ...more].reduce((sum, s) => sum + s.sent, 0);
  assert.equal(total, 60);
  assert.equal(sends.length, 60);
  assert.equal(new Set(sends).size, 60, 'no message was sent twice');
  assert.deepEqual((await db.query("SELECT count(*)::int AS n FROM email_outbox WHERE status = 'sent' AND attempts = 1")).rows[0].n, 60);
});

test('concurrent enqueues with one key insert one row', async () => {
  const { db, outbox } = await setup({ send: async () => ({ status: 'sent', providerId: 'x' }) });
  const results = await Promise.all([1, 2, 3, 4, 5].map(() => outbox.enqueue({ key: 'same', to: 'a@example.com', template: 'note', data: { n: 1 } })));
  assert.equal(new Set(results.map(r => r.id)).size, 1);
  assert.equal((await db.query('SELECT count(*)::int AS n FROM email_outbox')).rows[0].n, 1);
});
