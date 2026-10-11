// SPDX-License-Identifier: Apache-2.0
// api-keys on real PostgreSQL semantics (PGlite, Postgres compiled to WASM): schema.sql applies, the stored row holds
// only the HMAC of the key, a revoke takes effect on the next verify, lookup-id collisions retry through ON CONFLICT,
// and last-used writes are throttled by one conditional UPDATE.
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createHmac } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { ApiKeyError, createApiKeys } from '../.build/modules/api-keys/files/core.js';
import { createSqlApiKeyStore } from '../.build/modules/api-keys/files/sql-store.js';

const schema = readFileSync(new URL('../modules/api-keys/files/schema.sql', import.meta.url), 'utf8');
const PEPPER = 'sql-pepper-0123456789-abcdefghijklmnopqr';
const authorize = async (actor, action, { tenantId }) => (actor.userId === 'alice' && tenantId === 'acme') || (actor.userId === 'eve' && tenantId === 'globex');
const holderScopes = async () => ['invoices:read', 'invoices:write'];
const executor = db => ({ query: (text, params) => db.query(text, params) });
const code = expected => error => error instanceof ApiKeyError && error.code === expected;
const alice = { userId: 'alice' }, eve = { userId: 'eve' };

async function setup(extra = {}) {
  const db = new PGlite();
  await db.exec(schema);
  let now = 1_000_000;
  let counter = 0;
  const store = createSqlApiKeyStore(executor(db));
  const keys = createApiKeys({ store, authorize, holderScopes, pepper: PEPPER, now: () => now, newId: () => `k-${String(++counter).padStart(4, '0')}`, ...extra });
  return { db, keys, advance: ms => { now += ms; }, at: () => now };
}

test('schema applies and the row holds only the HMAC of the key, never the key', async () => {
  const { db, keys } = await setup();
  const { key, info } = await keys.create(alice, { tenantId: 'acme', name: 'CI', scopes: ['invoices:read', 'invoices:write'] });
  const row = (await db.query('SELECT * FROM api_keys WHERE id = $1', [info.id])).rows[0];
  const [, , lookupId, secret] = key.split('_');
  assert.equal(row.key_hash, createHmac('sha256', PEPPER).update(key).digest('hex'));
  assert.equal(row.lookup_id, lookupId);
  assert.equal(row.prefix, info.prefix);
  assert.deepEqual(row.scopes, ['invoices:read', 'invoices:write']);
  for (const [column, value] of Object.entries(row)) {
    assert.ok(!String(value).includes(secret), `${column} does not contain the secret`);
  }
  assert.equal((await keys.verify(key, ['invoices:write'])).tenantId, 'acme');
  await assert.rejects(db.query("UPDATE api_keys SET key_hash = 'plaintext' WHERE id = $1", [info.id]), /check/i);
  await assert.rejects(keys.list(eve, 'acme'), code('forbidden'));
  await keys.create(eve, { tenantId: 'globex', name: 'other', scopes: ['invoices:read'] });
  assert.deepEqual((await keys.list(alice, 'acme')).map(k => k.id), [info.id]);
  assert.throws(() => createSqlApiKeyStore(executor(db), { table: 'bad; drop table x' }), RangeError);
});

test('a revoke on PostgreSQL takes effect on the next verify', async () => {
  const { db, keys, at } = await setup();
  const { key, info } = await keys.create(alice, { tenantId: 'acme', name: 'CI', scopes: ['invoices:read'] });
  await keys.verify(key);
  const revoked = await keys.revoke(alice, info.id);
  assert.equal(revoked.revokedAt, at());
  await assert.rejects(keys.verify(key), code('revoked'));
  const row = (await db.query('SELECT revoked_at, revoked_by FROM api_keys WHERE id = $1', [info.id])).rows[0];
  assert.deepEqual(row, { revoked_at: at(), revoked_by: 'alice' });
  assert.equal((await keys.revoke(alice, info.id)).revokedAt, at());
});

test('lookup-id collisions use ON CONFLICT and retry', async () => {
  let call = 0;
  // Calls 1 and 3 draw the lookup id: both all-zero bytes, so the second key collides and retries (calls 5 and 6).
  const randomBytes = n => (++call === 1 || call === 3 ? new Uint8Array(n) : crypto.getRandomValues(new Uint8Array(n)));
  const { db, keys } = await setup({ randomBytes });
  const first = await keys.create(alice, { tenantId: 'acme', name: 'a', scopes: ['invoices:read'] });
  const second = await keys.create(alice, { tenantId: 'acme', name: 'b', scopes: ['invoices:read'] });
  assert.equal(first.key.split('_')[2], '000000000000');
  assert.notEqual(second.key.split('_')[2], '000000000000');
  assert.equal(call, 6);
  assert.equal((await db.query('SELECT count(*)::int AS n FROM api_keys')).rows[0].n, 2);
  assert.equal((await keys.verify(second.key)).keyId, second.info.id);
});

test('last-used writes on PostgreSQL are throttled to one per interval', async () => {
  const used = [];
  const { db, keys, advance, at } = await setup({ lastUsedIntervalMs: 60_000, onAudit: event => { if (event.type === 'key.used') used.push(event.at); } });
  const { key, info } = await keys.create(alice, { tenantId: 'acme', name: 'CI', scopes: ['invoices:read'] });
  const lastUsed = async () => (await db.query('SELECT last_used_at FROM api_keys WHERE id = $1', [info.id])).rows[0].last_used_at;
  assert.equal(await lastUsed(), null);
  await keys.verify(key);
  const first = at();
  assert.equal(await lastUsed(), first);
  advance(59_999);
  await keys.verify(key);
  assert.equal(await lastUsed(), first);
  advance(1);
  await Promise.all([keys.verify(key), keys.verify(key), keys.verify(key)]);
  assert.equal(await lastUsed(), at());
  assert.deepEqual(used, [first, at()], 'three concurrent verifies after the interval write once');
  const store = createSqlApiKeyStore(executor(db));
  assert.equal(await store.touchLastUsed(info.id, at() + 10, at()), true);
  assert.equal(await store.touchLastUsed(info.id, at() + 20, at()), false, 'conditional: a recent write blocks the next');
  await keys.revoke(alice, info.id);
  assert.equal(await store.touchLastUsed(info.id, at() + 1_000_000, at() + 1_000_000), false, 'revoked keys are not touched');
});
