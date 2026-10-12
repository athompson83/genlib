// SPDX-License-Identifier: Apache-2.0
// email-signup on real PostgreSQL semantics (PGlite, Postgres compiled to WASM): schema.sql applies, the unique
// email index makes concurrent signups create one account, only hashes are stored, and the conditional updates
// let exactly one confirm verify the account and keep concurrent resends within the limits.
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { createEmailSignup, hashToken } from '../.build/modules/email-signup/files/core.js';
import { createSqlEmailSignupStore } from '../.build/modules/email-signup/files/sql-store.js';

const schema = readFileSync(new URL('../modules/email-signup/files/schema.sql', import.meta.url), 'utf8');
const executor = db => ({ query: (text, params) => db.query(text, params) });
const GOOD = 'a sufficiently long passphrase';
const MINUTE = 60_000;

async function setup(options = {}) {
  const db = new PGlite();
  await db.exec(schema);
  let now = 1_000_000;
  let bytes = 0;
  const sent = [];
  const existing = [];
  const verified = [];
  const signup = createEmailSignup({
    store: createSqlEmailSignupStore(executor(db)), baseUrl: 'https://app.example.com/verify',
    sendEmail: async message => { sent.push(message); }, hasher: { hash: async p => `h:${p}`, verify: async () => false },
    onExistingAccount: notice => { existing.push(notice); }, onVerified: id => { verified.push(id); },
    sleep: async () => {}, now: () => now,
    randomBytes: length => { bytes++; return Uint8Array.from({ length }, (_, i) => (i * 5 + bytes * 11) & 255); },
    ...options,
  });
  const tokenOf = message => new URL(message.link).searchParams.get('token');
  const count = async (sql) => (await db.query(sql)).rows[0].n;
  return { db, signup, sent, existing, verified, tokenOf, count, advance: ms => { now += ms; } };
}

test('unique-account on PostgreSQL: four concurrent signups with the same normalized email create exactly one row', async () => {
  const { signup, sent, existing, count, db } = await setup();
  const results = await Promise.all(['ann@example.com', 'ANN@example.com', ' Ann@Example.com', 'ann@EXAMPLE.COM']
    .map(email => signup.signup(email, GOOD)));
  assert.ok(results.every(result => result.ok === true));
  assert.equal(await count('SELECT count(*)::int AS n FROM email_signup_accounts'), 1);
  assert.equal(sent.length, 1);
  assert.equal(existing.length, 3);
  // The index also rejects a direct duplicate insert.
  await assert.rejects(db.query("INSERT INTO email_signup_accounts (id, email, password_hash, created_at) VALUES ('x', 'ann@example.com', 'h', 1)"));
  await assert.rejects(db.query("INSERT INTO email_signup_accounts (id, email, password_hash, created_at) VALUES ('y', 'Bob@example.com', 'h', 1)"), 'non-normalized email refused by CHECK');
});

test('verification-token on PostgreSQL: hash-only storage, expiry, single use; the account is verified once', async () => {
  const { db, signup, sent, verified, tokenOf, advance } = await setup();
  await signup.signup('ann@example.com', GOOD);
  const token = tokenOf(sent[0]);
  const rows = (await db.query('SELECT * FROM email_verification_tokens')).rows;
  assert.equal(rows.length, 1);
  assert.equal(rows[0].token_hash, await hashToken(token));
  const account = (await db.query('SELECT * FROM email_signup_accounts')).rows[0];
  assert.equal(account.password_hash, `h:${GOOD}`, 'the injected hasher output is what is stored');
  assert.ok(!JSON.stringify(rows).includes(token), 'no raw token stored');
  assert.equal(await signup.isVerified(account.id), false);
  advance(24 * 60 * MINUTE);
  await assert.rejects(signup.confirm(token), { code: 'invalid-token' });
  await signup.resend('ann@example.com');
  const fresh = tokenOf(sent[1]);
  assert.equal((await signup.confirm(fresh)).newlyVerified, true);
  await assert.rejects(signup.confirm(fresh), { code: 'invalid-token' });
  assert.equal(await signup.isVerified(account.id), true);
  assert.deepEqual(verified, [account.id]);
});

test('verified-gate on PostgreSQL: four concurrent confirms of one link, exactly one wins', async () => {
  const { signup, sent, verified, tokenOf } = await setup();
  await signup.signup('ann@example.com', GOOD);
  const results = await Promise.allSettled([1, 2, 3, 4].map(() => signup.confirm(tokenOf(sent[0]))));
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
  assert.ok(results.filter(r => r.status === 'rejected').every(r => r.reason.code === 'invalid-token'));
  assert.equal(verified.length, 1);
});

test('resend-limits on PostgreSQL: cooldown, window cap, concurrent resends bounded, earlier links revoked', async () => {
  const { signup, sent, tokenOf, advance, count } = await setup({ resendCooldownMs: MINUTE, maxSendsPerWindow: 3 });
  await signup.signup('ann@example.com', GOOD);
  assert.equal((await signup.resend('ann@example.com')).serverError, 'rate-limited');
  advance(MINUTE);
  const burst = await Promise.all([1, 2, 3, 4].map(() => signup.resend('ann@example.com')));
  assert.equal(burst.filter(r => r.serverError === undefined).length, 1, 'one concurrent resend wins the slot');
  advance(MINUTE);
  assert.deepEqual(await signup.resend('ann@example.com'), { ok: true });
  advance(MINUTE);
  assert.equal((await signup.resend('ann@example.com')).serverError, 'rate-limited', 'window cap of 3');
  advance(57 * MINUTE);
  assert.deepEqual(await signup.resend('ann@example.com'), { ok: true });
  assert.equal(sent.length, 4);
  assert.equal(await count('SELECT count(*)::int AS n FROM email_verification_tokens WHERE used_at IS NULL AND revoked_at IS NULL'), 1);
  for (const old of sent.slice(0, -1).map(tokenOf)) await assert.rejects(signup.confirm(old), { code: 'invalid-token' });
  assert.equal((await signup.confirm(tokenOf(sent.at(-1)))).newlyVerified, true);
  assert.throws(() => createSqlEmailSignupStore(executor({}), { tokensTable: 'bad; drop table x' }), RangeError);
});

test('verification-email on PostgreSQL: failed delivery revokes the stored token and is reported server-side', async () => {
  const keys = [];
  const { db, signup } = await setup({ sendAttempts: 2, sendEmail: async message => { keys.push(message.idempotencyKey); throw new Error('down'); } });
  const failed = await signup.signup('ann@example.com', GOOD);
  assert.equal(failed.serverError, 'delivery-failed');
  assert.equal(typeof failed.accountId, 'string');
  assert.equal(keys.length, 2);
  assert.equal(keys[0], keys[1], 'retries reuse the idempotency key');
  const row = (await db.query('SELECT revoked_at FROM email_verification_tokens')).rows[0];
  assert.ok(row.revoked_at !== null);
});

test('resend-limits on PostgreSQL: interleaved concurrent resends leave at least one working link', async () => {
  const db = new PGlite();
  await db.exec(schema);
  // A barrier holds each token-writing statement until both resends reach it, so the two issues interleave.
  let waiting = [];
  let armed = false;
  const barrier = {
    async query(text, params) {
      if (armed && /^\s*(INSERT INTO email_verification_tokens|WITH)/.test(text)) {
        await new Promise(resolve => { waiting.push(resolve); if (waiting.length === 2) { waiting.forEach(release => release()); waiting = []; } });
      }
      return db.query(text, params);
    },
  };
  const sent = [];
  const signup = createEmailSignup({
    store: createSqlEmailSignupStore(barrier), baseUrl: 'https://app.example.com/verify',
    sendEmail: async message => { sent.push(message); }, hasher: { hash: async p => `h:${p}`, verify: async () => false },
    resendCooldownMs: 0, maxSendsPerWindow: 10, sleep: async () => {}, now: () => 1_000_000,
  });
  const tokenOf = message => new URL(message.link).searchParams.get('token');
  await signup.signup('ann@example.com', GOOD);
  armed = true;
  await Promise.all([signup.resend('ann@example.com'), signup.resend('ann@example.com')]);
  assert.equal(sent.length, 3);
  const pending = (await db.query('SELECT count(*)::int AS n FROM email_verification_tokens WHERE used_at IS NULL AND revoked_at IS NULL')).rows[0].n;
  // PGlite runs the two atomic issues one after the other: the last one revokes the rest, including the signup link.
  assert.equal(pending, 1, 'exactly one link survives');
  const outcomes = await Promise.allSettled(sent.slice(1).map(message => signup.confirm(tokenOf(message))));
  assert.ok(outcomes.some(outcome => outcome.status === 'fulfilled'), 'at least one resent link confirms');
});

test('resend-limits on PostgreSQL: the per-window cap is rolling', async () => {
  const { signup, sent, advance } = await setup({ resendCooldownMs: MINUTE, maxSendsPerWindow: 5, sendWindowMs: 60 * MINUTE });
  await signup.signup('ann@example.com', GOOD);
  advance(56 * MINUTE);
  for (let i = 0; i < 4; i++) { assert.deepEqual(await signup.resend('ann@example.com'), { ok: true }); advance(MINUTE); }
  assert.deepEqual(await signup.resend('ann@example.com'), { ok: true }, 'the signup email left the rolling hour');
  advance(MINUTE);
  assert.equal((await signup.resend('ann@example.com')).serverError, 'rate-limited', 'five sends in the last hour');
  const burst = await Promise.all([1, 2, 3].map(() => (advance(0), signup.resend('ann@example.com'))));
  assert.ok(burst.every(r => r.serverError === 'rate-limited'));
  advance(55 * MINUTE);
  assert.deepEqual(await signup.resend('ann@example.com'), { ok: true });
  assert.equal(sent.length, 7);
});
