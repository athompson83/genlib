// SPDX-License-Identifier: Apache-2.0
// webhook-delivery on PostgreSQL semantics (PGlite, Postgres compiled to WASM): schema.sql applies; enqueue writes
// delivery rows on the caller's transaction so they commit or roll back with the triggering change; claims take a
// lease with FOR UPDATE SKIP LOCKED and a crashed worker's rows are reclaimed after expiry; retries, dead, replay and
// tenant scoping hold on the SQL store; concurrent workers deliver each row once. PGlite runs one connection, so
// concurrency interleaves statements on it; SKIP LOCKED across connections is exercised only on a real server.
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { createWebhookDelivery } from '../.build/modules/webhook-delivery/files/core.js';
import { createSqlWebhookStore } from '../.build/modules/webhook-delivery/files/sql-store.js';
import { verifyStandardWebhook } from '../.build/modules/webhook-verification/files/providers.js';

const schema = readFileSync(new URL('../modules/webhook-delivery/files/schema.sql', import.meta.url), 'utf8');
const ADMIN = { id: 'admin', tenants: ['acme'] };
const OTHER = { id: 'other', tenants: ['globex'] };

async function setup(extra = {}) {
  const db = new PGlite();
  await db.exec(schema);
  await db.exec('CREATE TABLE orders (id text PRIMARY KEY, status text NOT NULL)');
  let now = 1_700_000_000_000;
  let ids = 0;
  const calls = [];
  const responses = [];
  const executor = { query: (text, params) => db.query(text, params) };
  const store = createSqlWebhookStore(executor);
  const delivery = createWebhookDelivery({
    store,
    fetch: async (url, init) => {
      calls.push({ url, init });
      const next = responses.length ? responses.shift() : new Response('ok', { status: 200 });
      if (typeof next === 'function') return next();
      if (next instanceof Error) throw next;
      return next;
    },
    resolveHost: async () => ['93.184.216.34'],
    authorize: (actor, tenantId) => Boolean(actor?.tenants?.includes(tenantId)),
    now: () => now, random: () => 0.5, newId: () => 'id' + ++ids, backoff: { baseMs: 1000, maxMs: 60_000 },
    ...extra,
  });
  return { db, store, delivery, calls, responses, advance: ms => { now += ms; }, at: () => now };
}

test('schema applies and delivery rows commit or roll back with the triggering change on the caller transaction', async () => {
  const env = await setup();
  await env.delivery.createEndpoint(ADMIN, 'acme', { url: 'https://hooks.example.com/in' });

  await assert.rejects(env.db.transaction(async tx => {
    const txExecutor = { query: (text, params) => tx.query(text, params) };
    await tx.query("INSERT INTO orders (id, status) VALUES ('o1', 'paid')");
    const queued = await env.delivery.enqueue({ tenantId: 'acme', eventId: 'order.paid:o1', type: 'order.paid', data: { id: 'o1' } }, { tx: txExecutor });
    assert.equal(queued.length, 1);
    throw new Error('payment capture failed');
  }), /payment capture failed/);
  assert.equal((await env.db.query('SELECT count(*)::int AS n FROM orders')).rows[0].n, 0);
  assert.equal((await env.db.query('SELECT count(*)::int AS n FROM webhook_deliveries')).rows[0].n, 0);

  await env.db.transaction(async tx => {
    const txExecutor = { query: (text, params) => tx.query(text, params) };
    await tx.query("INSERT INTO orders (id, status) VALUES ('o1', 'paid')");
    await env.delivery.enqueue({ tenantId: 'acme', eventId: 'order.paid:o1', type: 'order.paid', data: { id: 'o1' } }, { tx: txExecutor });
  });
  assert.equal((await env.db.query('SELECT count(*)::int AS n FROM orders')).rows[0].n, 1);
  const rows = (await env.db.query('SELECT event_id, status, tenant_id FROM webhook_deliveries')).rows;
  assert.deepEqual(rows, [{ event_id: 'order.paid:o1', status: 'pending', tenant_id: 'acme' }]);

  // The committed row survives a "restart": a new delivery instance over the same database delivers it.
  const restarted = createWebhookDelivery({
    store: createSqlWebhookStore({ query: (text, params) => env.db.query(text, params) }),
    fetch: async (url, init) => { env.calls.push({ url, init }); return new Response(null, { status: 204 }); },
    resolveHost: async () => ['93.184.216.34'], authorize: () => true, now: env.at,
  });
  assert.equal((await restarted.runOnce({ workerId: 'after-restart' })).succeeded, 1);
  assert.equal(env.calls.length, 1);
});

test('SQL store keeps signing, retries, dead, replay with the same webhook-id and tenant scoping', async () => {
  const env = await setup({ maxAttempts: 2 });
  const { endpoint, secret } = await env.delivery.createEndpoint(ADMIN, 'acme', { url: 'https://hooks.example.com/in', eventTypes: ['order.paid'] });
  await env.delivery.createEndpoint(OTHER, 'globex', { url: 'https://hooks.example.com/g' });
  const [queued] = await env.delivery.enqueue({ tenantId: 'acme', eventId: 'evt-1', type: 'order.paid', data: { n: 1 } });
  assert.equal((await env.delivery.enqueue({ tenantId: 'acme', eventId: 'evt-1', type: 'order.paid', data: { n: 1 } }))[0].id, queued.id);
  assert.deepEqual(await env.delivery.enqueue({ tenantId: 'acme', eventId: 'evt-x', type: 'user.created', data: {} }), []);

  env.responses.push(new TypeError('fetch failed'), new Response('', { status: 502 }));
  assert.equal((await env.delivery.runOnce({ workerId: 'w1' })).retried, 1);
  const row = await env.store.getDelivery('acme', queued.id);
  assert.equal(row.nextAttemptAt - env.at(), 750);
  env.advance(750);
  assert.equal((await env.delivery.runOnce({ workerId: 'w1' })).dead, 1);
  const attempts = await env.delivery.listAttempts(ADMIN, 'acme', queued.id);
  assert.deepEqual(attempts.map(a => [a.attempt, a.outcome, a.statusCode]), [[1, 'network-error', null], [2, 'http-error', 502]]);

  await assert.rejects(env.delivery.replay(OTHER, 'globex', queued.id), { code: 'not-found' });
  await assert.rejects(env.delivery.getEndpoint(OTHER, 'globex', endpoint.id), { code: 'not-found' });
  assert.equal((await env.delivery.replay(ADMIN, 'acme', queued.id)).attempts, 0);
  const rotated = await env.delivery.rotateSecret(ADMIN, 'acme', endpoint.id);
  assert.equal((await env.delivery.runOnce({ workerId: 'w1' })).succeeded, 1);
  const last = env.calls.at(-1);
  assert.equal(new Set(env.calls.map(c => c.init.headers['webhook-id'])).size, 1);
  for (const s of [secret, rotated.secret]) {
    assert.deepEqual(await verifyStandardWebhook({ secret: s, payload: last.init.body, headers: new Headers(last.init.headers), clock: env.at }), { ok: true });
  }
  const stored = (await env.db.query('SELECT secrets FROM webhook_endpoints WHERE id = $1', [endpoint.id])).rows[0].secrets;
  assert.equal(stored.length, 2);
  assert.equal((await env.delivery.listEndpoints(ADMIN, 'acme'))[0].secrets.length, 2);
});

test('a crashed worker\'s claim holds until the lease expires, then another worker reclaims it; the stale worker cannot complete', async () => {
  const env = await setup();
  await env.delivery.createEndpoint(ADMIN, 'acme', { url: 'https://hooks.example.com/in' });
  const [queued] = await env.delivery.enqueue({ tenantId: 'acme', eventId: 'evt-1', type: 'x', data: {} });
  const [claimed] = await env.store.claim({ now: env.at(), limit: 5, workerId: 'crashed', leaseMs: 30_000 });
  assert.equal(claimed.id, queued.id);
  assert.equal(claimed.status, 'delivering');
  assert.equal((await env.delivery.runOnce({ workerId: 'w2', leaseMs: 30_000 })).claimed, 0);
  env.advance(30_001);
  // While w2's attempt is in flight (its lease live), the stale worker tries to complete; owner fencing refuses it.
  let stale;
  env.responses.push(async () => {
    const during = await env.store.getDelivery('acme', queued.id);
    assert.deepEqual([during.status, during.leaseOwner], ['delivering', 'w2']);
    stale = await env.store.complete(queued.id, 'crashed', { status: 'dead', lastError: 'stale' });
    return new Response('ok', { status: 200 });
  });
  assert.equal((await env.delivery.runOnce({ workerId: 'w2', leaseMs: 30_000 })).succeeded, 1);
  assert.equal(stale, false, 'complete must be fenced by the lease owner');
  const row = await env.store.getDelivery('acme', queued.id);
  assert.deepEqual([row.status, row.attempts, row.leaseOwner, row.lastError], ['succeeded', 2, null, null]);
  // renewLease is fenced the same way.
  assert.equal(await env.store.renewLease(queued.id, 'crashed', env.at() + 1000), false);
});

test('four concurrent workers over 40 deliveries send each exactly once', async () => {
  const env = await setup();
  await env.delivery.createEndpoint(ADMIN, 'acme', { url: 'https://hooks.example.com/in' });
  for (let i = 0; i < 40; i++) await env.delivery.enqueue({ tenantId: 'acme', eventId: 'e' + i, type: 'x', data: { i } });
  const results = await Promise.all([1, 2, 3, 4].map(n => env.delivery.runOnce({ workerId: 'w' + n, limit: 40, concurrency: 4, leaseMs: 600_000 })));
  assert.equal(results.reduce((sum, r) => sum + r.succeeded, 0), 40);
  const ids = env.calls.map(c => c.init.headers['webhook-id']);
  assert.equal(ids.length, 40);
  assert.equal(new Set(ids).size, 40);
  assert.equal((await env.db.query("SELECT count(*)::int AS n FROM webhook_deliveries WHERE status = 'succeeded'")).rows[0].n, 40);
});

test('concurrent secret rotations do not lose a secret: the optimistic version check refuses the stale write', async () => {
  const env = await setup();
  const { endpoint } = await env.delivery.createEndpoint(ADMIN, 'acme', { url: 'https://hooks.example.com/in' });
  const raw = await env.store.getEndpoint('acme', endpoint.id);
  assert.ok(await env.store.updateEndpoint('acme', endpoint.id, raw.version, { description: 'first' }, env.at()));
  assert.equal(await env.store.updateEndpoint('acme', endpoint.id, raw.version, { description: 'stale' }, env.at()), null);
  const results = await Promise.allSettled([1, 2, 3].map(() => env.delivery.rotateSecret(ADMIN, 'acme', endpoint.id)));
  const ok = results.filter(r => r.status === 'fulfilled').length;
  const conflicts = results.filter(r => r.status === 'rejected' && r.reason.code === 'conflict').length;
  assert.equal(ok + conflicts, 3);
  assert.ok(ok >= 1);
  const after = await env.store.getEndpoint('acme', endpoint.id);
  assert.equal(after.secrets.length, 1 + ok);
});
