// SPDX-License-Identifier: Apache-2.0
// web-push on real PostgreSQL semantics (PGlite, Postgres compiled to WASM; one connection, so "concurrent" calls
// interleave on it rather than racing across connections): schema.sql applies, upsert dedupes on endpoint,
// a 410 from the push service deletes the row, and the single-statement updates stay exact under concurrency.
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { base64UrlEncode, generateVapidKeys } from '../.build/modules/web-push/files/crypto.js';
import { createWebPush } from '../.build/modules/web-push/files/push.js';
import { createSqlPushSubscriptionStore } from '../.build/modules/web-push/files/sql-store.js';

const schema = readFileSync(new URL('../modules/web-push/files/schema.sql', import.meta.url), 'utf8');
const executor = db => ({ query: (text, params) => db.query(text, params) });
const ENDPOINT = id => `https://fcm.googleapis.com/fcm/send/${id}`;

async function keys() {
  const pair = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const publicKey = new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey));
  return { p256dh: base64UrlEncode(publicKey), auth: base64UrlEncode(crypto.getRandomValues(new Uint8Array(16))) };
}

async function setup(statusFor = () => 201) {
  const db = new PGlite();
  await db.exec(schema);
  let now = 1_000_000;
  const store = createSqlPushSubscriptionStore(executor(db));
  const fetch = async url => new Response(null, { status: statusFor(url) });
  const webPush = createWebPush({ vapid: { ...(await generateVapidKeys()), subject: 'mailto:ops@example.com' }, store, fetch, now: () => now });
  return { db, store, webPush, advance: ms => { now += ms; } };
}

test('schema applies; upsert dedupes on endpoint, keeps created_at and resets failures', async () => {
  const { db, store, webPush, advance } = await setup();
  const k1 = await keys();
  const k2 = await keys();
  const first = await webPush.subscribe('u1', { endpoint: ENDPOINT('a'), keys: k1 });
  assert.deepEqual(first, { endpoint: ENDPOINT('a'), userId: 'u1', p256dh: k1.p256dh, auth: k1.auth, createdAt: 1_000_000, lastSuccessAt: null, failureCount: 0 });
  assert.equal(await store.recordFailure(ENDPOINT('a')), 1);
  advance(5000);
  const again = await webPush.subscribe('u2', { endpoint: ENDPOINT('a'), keys: k2 });
  assert.deepEqual([again.userId, again.p256dh, again.createdAt, again.failureCount], ['u2', k2.p256dh, 1_000_000, 0]);
  assert.equal((await db.query('SELECT count(*)::int AS n FROM push_subscriptions')).rows[0].n, 1);
  assert.deepEqual(await store.listByUser('u1'), []);
  // Concurrent subscribes of one browser end with one row.
  await Promise.all(Array.from({ length: 10 }, (_, i) => webPush.subscribe(`u${i % 2}`, { endpoint: ENDPOINT('b'), keys: k1 })));
  assert.equal((await db.query('SELECT count(*)::int AS n FROM push_subscriptions WHERE endpoint = $1', [ENDPOINT('b')])).rows[0].n, 1);
  const plan = (await db.query("SELECT indexname FROM pg_indexes WHERE tablename = 'push_subscriptions'")).rows.map(r => r.indexname);
  assert.ok(plan.includes('push_subscriptions_user_id'));
  assert.throws(() => createSqlPushSubscriptionStore(executor(db), { table: 'x; drop table y' }), RangeError);
});

test('send records success, and a 410 deletes the subscription row', async () => {
  const { db, store, webPush, advance } = await setup(url => (url.endsWith('/gone') ? 410 : 201));
  const k = await keys();
  await webPush.subscribe('u1', { endpoint: ENDPOINT('live'), keys: k });
  await webPush.subscribe('u1', { endpoint: ENDPOINT('gone'), keys: k });
  advance(1000);
  const results = await webPush.send('u1', { title: 'Hi' }, { ttl: 60 });
  assert.deepEqual(results.map(r => [r.endpoint.split('/').pop(), r.outcome, r.removed]).sort(), [['gone', 'gone', true], ['live', 'sent', false]]);
  const rows = (await db.query('SELECT endpoint, last_success_at, failure_count FROM push_subscriptions')).rows;
  assert.deepEqual(rows.map(r => [r.endpoint, Number(r.last_success_at), r.failure_count]), [[ENDPOINT('live'), 1_001_000, 0]]);
  assert.equal(await store.remove(ENDPOINT('live'), 'someone-else'), false, 'owner-scoped delete');
  assert.equal(await webPush.unsubscribe(ENDPOINT('live'), 'u1'), true);
  assert.equal(await store.recordFailure(ENDPOINT('live')), null);
});

test('concurrent removals report exactly one winner; concurrent failures count exactly', async () => {
  const { store, webPush } = await setup();
  const k = await keys();
  await webPush.subscribe('u1', { endpoint: ENDPOINT('x'), keys: k });
  await webPush.subscribe('u1', { endpoint: ENDPOINT('y'), keys: k });
  const counts = await Promise.all(Array.from({ length: 20 }, () => store.recordFailure(ENDPOINT('y'))));
  assert.deepEqual([...counts].sort((a, b) => a - b), Array.from({ length: 20 }, (_, i) => i + 1));
  const removals = await Promise.all(Array.from({ length: 6 }, () => store.remove(ENDPOINT('x'))));
  assert.equal(removals.filter(Boolean).length, 1);
  assert.deepEqual((await store.listByUser('u1')).map(s => [s.endpoint, s.failureCount]), [[ENDPOINT('y'), 20]]);
});
