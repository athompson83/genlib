// SPDX-License-Identifier: Apache-2.0
// password-reset on real PostgreSQL semantics (PGlite, Postgres compiled to WASM): schema.sql applies, only token
// hashes are stored, and the conditional consume lets exactly one of several concurrent completes win.
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { createPasswordReset } from '../.build/modules/password-reset/files/core.js';
import { createSqlPasswordResetStore } from '../.build/modules/password-reset/files/sql-store.js';

const schema = readFileSync(new URL('../modules/password-reset/files/schema.sql', import.meta.url), 'utf8');
const executor = db => ({ query: (text, params) => db.query(text, params) });

async function setup(options = {}) {
  const db = new PGlite();
  await db.exec(schema);
  let now = 1_000_000;
  let bytes = 0;
  const accounts = new Map([['u1', { id: 'u1', email: 'ann@example.com' }]]);
  const hashes = new Map();
  const sent = [];
  const revoked = [];
  const users = {
    async findByEmail(email) { for (const user of accounts.values()) if (user.email === email) return { ...user }; return null; },
    async setPasswordHash(userId, hash) { hashes.set(userId, hash); },
  };
  const reset = createPasswordReset({
    store: createSqlPasswordResetStore(executor(db)), users, baseUrl: 'https://app.example.com/reset',
    sendEmail: async message => { sent.push(message); }, hashPassword: async p => `h:${p}`,
    passwordPolicy: p => (p.length < 12 ? ['too-short'] : []), revokeSessions: async id => { revoked.push(id); },
    now: () => now, randomBytes: length => { bytes++; return Uint8Array.from({ length }, (_, i) => (i * 5 + bytes * 11) & 255); },
    ...options,
  });
  const tokenOf = message => new URL(message.link).searchParams.get('token');
  return { db, reset, sent, revoked, hashes, accounts, tokenOf, advance: ms => { now += ms; } };
}

test('schema applies; hash-only storage; expiry; revoke-others; cap; weak password keeps the token', async () => {
  const { db, reset, sent, revoked, hashes, tokenOf, advance } = await setup({ maxActivePerUser: 2 });
  assert.deepEqual(await reset.request('nobody@example.com'), { ok: true });
  assert.equal((await db.query('SELECT count(*)::int AS n FROM password_reset_tokens')).rows[0].n, 0);
  for (let i = 0; i < 3; i++) { await reset.request('ann@example.com'); advance(1000); }
  const tokens = sent.map(tokenOf);
  const rows = (await db.query('SELECT * FROM password_reset_tokens ORDER BY created_at')).rows;
  assert.equal(rows.length, 3);
  assert.ok(rows.every(row => row.token_hash.length === 64));
  for (const token of tokens) assert.ok(!JSON.stringify(rows).includes(token), 'raw token never stored');
  // Cap of 2: the oldest was revoked.
  assert.deepEqual((await Promise.all(tokens.map(t => reset.verify(t)))).map(r => r.valid), [false, true, true]);
  await assert.rejects(reset.complete(tokens[2], 'short'), { code: 'weak-password' });
  assert.equal((await reset.verify(tokens[2])).valid, true);
  await reset.complete(tokens[2], 'a long enough password');
  assert.equal(hashes.get('u1'), 'h:a long enough password');
  assert.deepEqual(revoked, ['u1']);
  assert.equal((await reset.verify(tokens[1])).valid, false, 'other pending link revoked');
  const pending = await db.query('SELECT count(*)::int AS n FROM password_reset_tokens WHERE used_at IS NULL AND revoked_at IS NULL');
  assert.equal(pending.rows[0].n, 0);
  // Expiry.
  await reset.request('ann@example.com');
  const late = tokenOf(sent.at(-1));
  advance(30 * 60_000);
  await assert.rejects(reset.complete(late, 'a long enough password'), { code: 'invalid-token' });
  assert.throws(() => createSqlPasswordResetStore(executor(db), { table: 'bad; drop table x' }), RangeError);
});

test('concurrent completes against the database: exactly one wins', async () => {
  const { reset, sent, tokenOf } = await setup();
  await reset.request('ann@example.com');
  const token = tokenOf(sent[0]);
  const results = await Promise.allSettled([1, 2, 3, 4].map(n => reset.complete(token, `password number ${n}!`)));
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
  assert.ok(results.filter(r => r.status === 'rejected').every(r => r.reason.code === 'invalid-token'));
});

test('email change invalidates the link; delivery failure revokes the row', async () => {
  const { reset, sent, tokenOf, accounts, db } = await setup();
  await reset.request('ann@example.com');
  accounts.get('u1').email = 'ann.new@example.com';
  assert.equal((await reset.verify(tokenOf(sent[0]))).valid, false);

  const failing = await setup({ sendEmail: async () => { throw new Error('down'); } });
  assert.deepEqual(await failing.reset.request('ann@example.com'), { ok: true, serverError: 'delivery-failed' });
  const row = (await failing.db.query('SELECT revoked_at FROM password_reset_tokens')).rows[0];
  assert.ok(row.revoked_at !== null);
  void db;
});
