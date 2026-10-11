// SPDX-License-Identifier: Apache-2.0
// two-factor on real PostgreSQL semantics (PGlite, Postgres compiled to WASM): schema.sql applies, secrets are stored
// only as ciphertext and recovery codes only as HMACs, and the conditional updates let exactly one of several
// concurrent verifies of one code (or one recovery code) win.
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { createTwoFactor, base32Decode, totpCode } from "../.build/modules/two-factor/files/core.js";
import { createSqlTwoFactorStore } from "../.build/modules/two-factor/files/sql-store.js";

const schema = readFileSync(new URL("../modules/two-factor/files/schema.sql", import.meta.url), "utf8");
const executor = (db) => ({ query: (text, params) => db.query(text, params) });
const MINUTE = 60_000;
const KEY = Uint8Array.from({ length: 32 }, (_, i) => i + 9);
const PEPPER = Uint8Array.from({ length: 32 }, (_, i) => 255 - i);

async function setup() {
  const db = new PGlite();
  await db.exec(schema);
  let now = 1_700_000_000_000;
  const store = createSqlTwoFactorStore(executor(db));
  const tf = createTwoFactor({
    store, issuer: "Example", encryption: { currentKeyId: "k1", keys: { k1: KEY } }, recoveryPepper: PEPPER, now: () => now,
  });
  const codeFor = (secret, offset = 0) => totpCode(base32Decode(secret), now + offset * 30_000);
  return { db, store, tf, codeFor, now: () => now, advance: (ms) => { now += ms; } };
}

async function enrolled() {
  const ctx = await setup();
  const { secret } = await ctx.tf.beginEnrollment("u1", { accountName: "ann@example.com" });
  const { recoveryCodes } = await ctx.tf.confirmEnrollment("u1", await ctx.codeFor(secret));
  ctx.advance(30_000);
  return { ...ctx, secret, recoveryCodes };
}

test("sql: schema applies; enrollment confirms only with a valid code before expiry; secret stored as ciphertext", async () => {
  const { db, tf, codeFor, advance } = await setup();
  const first = await tf.beginEnrollment("u1", { accountName: "ann@example.com" });
  advance(16 * MINUTE);
  await assert.rejects(tf.confirmEnrollment("u1", await codeFor(first.secret)), { code: "no-pending-enrollment" });
  const { secret } = await tf.beginEnrollment("u1", { accountName: "ann@example.com" });
  await assert.rejects(tf.confirmEnrollment("u1", "000000"), { code: "invalid-code" });
  assert.equal(await tf.isEnabled("u1"), false);
  const { recoveryCodes } = await tf.confirmEnrollment("u1", await codeFor(secret));
  assert.equal(await tf.isEnabled("u1"), true);
  await assert.rejects(tf.beginEnrollment("u1", { accountName: "ann@example.com" }), { code: "already-enabled" });
  const dump = JSON.stringify((await db.query("SELECT * FROM two_factor_enrollments")).rows)
    + JSON.stringify((await db.query("SELECT * FROM two_factor_recovery_codes")).rows);
  assert.ok(!dump.includes(secret), "no plaintext secret");
  for (const value of recoveryCodes) assert.ok(!dump.includes(value.replace("-", "")), "no plaintext recovery code");
  const row = (await db.query("SELECT key_id, last_used_step FROM two_factor_enrollments")).rows[0];
  assert.equal(row.key_id, "k1");
  assert.ok(row.last_used_step !== null, "confirming step recorded");
  assert.equal((await db.query("SELECT count(*)::int AS n FROM two_factor_recovery_codes WHERE used_at IS NULL")).rows[0].n, 10);
  assert.throws(() => createSqlTwoFactorStore(executor(db), { prefix: "bad; drop table x" }), RangeError);
});

test("sql: of four concurrent verifies of one code exactly one wins, and the step cannot be replayed", async () => {
  const { tf, secret, codeFor } = await enrolled();
  const value = await codeFor(secret);
  const results = await Promise.allSettled([1, 2, 3, 4].map(() => tf.verify("u1", value)));
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  assert.ok(results.filter((r) => r.status === "rejected").every((r) => r.reason.code === "invalid-code"));
  await assert.rejects(tf.verify("u1", value), { code: "invalid-code" });
  await assert.rejects(tf.verify("u1", await codeFor(secret, -1)), { code: "invalid-code" });
});

test("sql: recovery codes are single use under concurrency and regeneration replaces all of them", async () => {
  const { tf, recoveryCodes, now } = await enrolled();
  const results = await Promise.allSettled([1, 2, 3, 4].map(() => tf.verifyRecoveryCode("u1", recoveryCodes[0])));
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal((await tf.status("u1")).recoveryCodesRemaining, 9);
  await assert.rejects(tf.regenerateRecoveryCodes("u1", { authenticatedAt: now() - 11 * MINUTE }), { code: "reauthentication-required" });
  const fresh = await tf.regenerateRecoveryCodes("u1", { authenticatedAt: now() });
  await assert.rejects(tf.verifyRecoveryCode("u1", recoveryCodes[1]), { code: "invalid-code" });
  assert.equal((await tf.verifyRecoveryCode("u1", fresh.recoveryCodes[0])).remaining, 9);
});

test("sql: attempt limit is atomic under concurrency, shared with recovery codes, and resets after the window", async () => {
  const { tf, secret, codeFor, recoveryCodes, advance } = await enrolled();
  const results = await Promise.allSettled(Array.from({ length: 8 }, () => tf.verify("u1", "000000")));
  assert.equal(results.filter((r) => r.reason?.code === "invalid-code").length, 5);
  assert.equal(results.filter((r) => r.reason?.code === "rate-limited").length, 3);
  await assert.rejects(tf.verifyRecoveryCode("u1", recoveryCodes[0]), { code: "rate-limited" });
  advance(15 * MINUTE);
  assert.deepEqual(await tf.verify("u1", await codeFor(secret)), { ok: true, method: "totp" });
});

test("sql: disable requires recent re-authentication and deletes the secret and codes", async () => {
  const { db, tf, now } = await enrolled();
  await assert.rejects(tf.disable("u1", { authenticatedAt: now() - 11 * MINUTE }), { code: "reauthentication-required" });
  assert.equal(await tf.isEnabled("u1"), true);
  await tf.disable("u1", { authenticatedAt: now() - MINUTE });
  assert.equal(await tf.isEnabled("u1"), false);
  assert.equal((await db.query("SELECT count(*)::int AS n FROM two_factor_recovery_codes")).rows[0].n, 0);
  assert.equal((await db.query("SELECT count(*)::int AS n FROM two_factor_enrollments")).rows[0].n, 0);
});
