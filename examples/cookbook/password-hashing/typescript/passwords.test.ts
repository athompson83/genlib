// SPDX-License-Identifier: Apache-2.0
// Run: node --test passwords.test.ts
import assert from 'node:assert/strict';
import { test } from 'node:test';
import argon2 from 'argon2';
import { bcryptHash, hashPassword, verifyPassword } from './passwords.ts';

// node-argon2 writes PHC parameters as m,p,t (sorted); compare them as a set.
function params(hash: string): Record<string, string> {
  const [, type, , list] = hash.split('$');
  return { type, ...Object.fromEntries(list.split(',').map((kv) => kv.split('='))) };
}
const OWASP = { type: 'argon2id', m: '19456', t: '2', p: '1' };

test('hash and verify', async () => {
  const h = await hashPassword('correct horse battery staple');
  assert.deepEqual(params(h), OWASP);
  assert.deepEqual(await verifyPassword(h, 'correct horse battery staple'), { ok: true });
  assert.deepEqual(await verifyPassword(h, 'wrong'), { ok: false });
  assert.notEqual(h, await hashPassword('correct horse battery staple'));
});

test('weaker argon2 parameters trigger rehash', async () => {
  const weak = await argon2.hash('pw', { type: argon2.argon2id, memoryCost: 8192, timeCost: 1, parallelism: 1 });
  const r = await verifyPassword(weak, 'pw');
  assert.equal(r.ok, true);
  assert.deepEqual(params(r.rehash ?? '$x$$a=b'), OWASP);
  const argon2i = await argon2.hash('pw', { type: argon2.argon2i, memoryCost: 19456, timeCost: 2, parallelism: 1 });
  assert.ok((await verifyPassword(argon2i, 'pw')).rehash);
});

test('bcrypt legacy hash upgrades to argon2id', async () => {
  const legacy = await bcryptHash('pw', 10);
  const r = await verifyPassword(legacy, 'pw');
  assert.equal(r.ok, true);
  assert.match(r.rehash ?? '', /^\$argon2id\$/);
  assert.deepEqual(await verifyPassword(legacy, 'nope'), { ok: false });
  await assert.rejects(bcryptHash('x'.repeat(73)));
});

test('verifies a hash from the reference implementation', async () => {
  // argon2-cffi 25.1.0 (libargon2) output for "pw". Note: node-argon2 itself writes
  // parameters as m,p,t, which libargon2-based verifiers reject (see docs).
  const cffi = '$argon2id$v=19$m=19456,t=2,p=1$ecqUURt5rXczDOhwQxrhZw$w2dzt0CPmUdvSjkaj1rGvX6AKzIZ19bg8BnDrVw4KQc';
  assert.deepEqual(await verifyPassword(cffi, 'pw'), { ok: true });
});

test('malformed hash is rejected', async () => {
  assert.deepEqual(await verifyPassword('not-a-hash', 'pw'), { ok: false });
});
