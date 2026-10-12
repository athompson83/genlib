// SPDX-License-Identifier: Apache-2.0
// two-factor: TOTP enrollment, verification, replay protection, attempt limits, encrypted secrets, recovery codes,
// step-up checks and the Fetch adapter, with a deterministic clock and deterministic random bytes.
import assert from "node:assert/strict";
import test from "node:test";
import {
  createTwoFactor, TwoFactorError, base32Encode, base32Decode, totpCode, constantTimeEqual, normalizeRecoveryCode,
  hashRecoveryCode, buildOtpauthUri,
} from "../.build/modules/two-factor/files/core.js";
import { MemoryTwoFactorStore } from "../.build/modules/two-factor/files/memory-store.js";
import { createTwoFactorHandler } from "../.build/modules/two-factor/files/http.js";

const MINUTE = 60_000;
const ORIGIN = "https://app.example.com";
const KEY_A = Uint8Array.from({ length: 32 }, (_, i) => i + 1);
const KEY_B = Uint8Array.from({ length: 32 }, (_, i) => 200 - i);
const PEPPER = Uint8Array.from({ length: 32 }, (_, i) => (i * 3 + 7) & 255);
const RFC_SECRET = new TextEncoder().encode("12345678901234567890");

function setup(extra = {}) {
  let now = extra.start ?? 1_700_000_000_000;
  let calls = 0;
  const store = extra.store ?? new MemoryTwoFactorStore();
  const tf = createTwoFactor({
    store, issuer: "Example App",
    encryption: { currentKeyId: "k1", keys: { k1: KEY_A } },
    recoveryPepper: PEPPER,
    now: () => now,
    randomBytes: (length) => { calls++; return Uint8Array.from({ length }, (_, i) => (i * 31 + calls * 17 + 5) & 255); },
    ...extra.options,
  });
  return { store, tf, now: () => now, advance: (ms) => { now += ms; }, set: (ms) => { now = ms; } };
}

const codeFor = async (secret, atMs, offsetSteps = 0) => totpCode(base32Decode(secret), atMs + offsetSteps * 30_000);
const code = (expected) => (error) => error instanceof TwoFactorError && error.code === expected;

async function enrolled(extra) {
  const ctx = setup(extra);
  const { secret, otpauthUri } = await ctx.tf.beginEnrollment("u1", { accountName: "ann@example.com" });
  const { recoveryCodes } = await ctx.tf.confirmEnrollment("u1", await codeFor(secret, ctx.now()));
  ctx.advance(30_000); // move past the step used to confirm
  return { ...ctx, secret, otpauthUri, recoveryCodes };
}

test("totp matches the RFC 6238 Appendix B SHA-1 vectors (8 digits) and their 6-digit truncations", async () => {
  const vectors = [[59, "94287082"], [1111111109, "07081804"], [1111111111, "14050471"], [1234567890, "89005924"], [2000000000, "69279037"], [20000000000, "65353130"]];
  for (const [seconds, expected] of vectors) {
    assert.equal(await totpCode(RFC_SECRET, seconds * 1000, { digits: 8 }), expected);
    assert.equal(await totpCode(RFC_SECRET, seconds * 1000), expected.slice(-6));
  }
});

test("base32 round-trips RFC 4648 vectors and rejects invalid characters", () => {
  const enc = new TextEncoder();
  assert.equal(base32Encode(enc.encode("foobar")), "MZXW6YTBOI");
  assert.equal(base32Encode(RFC_SECRET), "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ");
  assert.deepEqual(base32Decode("mzxw 6ytb oi"), enc.encode("foobar"));
  assert.throws(() => base32Decode("MZXW1"), RangeError);
});

test("secret provisioning: 160-bit CSPRNG secret in base32 and an otpauth URI with encoded issuer and label", async () => {
  const seen = [];
  const { tf } = setup({ options: { randomBytes: (length) => { seen.push(length); return crypto.getRandomValues(new Uint8Array(length)); } } });
  const result = await tf.beginEnrollment("u1", { accountName: "ann smith@example.com" });
  assert.match(result.secret, /^[A-Z2-7]{32}$/);
  assert.equal(base32Decode(result.secret).length, 20, "160 bits");
  assert.ok(seen.includes(20));
  const uri = new URL(result.otpauthUri);
  assert.equal(uri.protocol, "otpauth:");
  assert.equal(uri.host, "totp");
  assert.equal(result.otpauthUri.split("?")[0], "otpauth://totp/Example%20App:ann%20smith%40example.com");
  assert.equal(uri.searchParams.get("secret"), result.secret);
  assert.equal(uri.searchParams.get("issuer"), "Example App");
  assert.equal(uri.searchParams.get("algorithm"), "SHA1");
  assert.equal(uri.searchParams.get("digits"), "6");
  assert.equal(uri.searchParams.get("period"), "30");
  assert.throws(() => buildOtpauthUri({ issuer: "Bad:Issuer", accountName: "a", secret: result.secret }), RangeError);
  assert.throws(() => createTwoFactor({ store: new MemoryTwoFactorStore(), issuer: "X", encryption: { currentKeyId: "k1", keys: { k1: KEY_A } }, recoveryPepper: PEPPER, secretBytes: 16 }), RangeError);
});

test("confirm enrollment: 2FA is required only after a valid code for the pending secret", async () => {
  const { tf, now, advance } = setup();
  const { secret } = await tf.beginEnrollment("u1", { accountName: "ann@example.com" });
  assert.equal(await tf.isEnabled("u1"), false, "pending enrollment does not require 2FA");
  await assert.rejects(tf.verify("u1", await codeFor(secret, now())), code("not-enabled"));
  await assert.rejects(tf.confirmEnrollment("u1", "000000"), code("invalid-code"));
  assert.equal(await tf.isEnabled("u1"), false, "wrong code does not enable");
  advance(MINUTE);
  const { recoveryCodes } = await tf.confirmEnrollment("u1", await codeFor(secret, now()));
  assert.equal(recoveryCodes.length, 10);
  assert.equal(await tf.isEnabled("u1"), true);
  await assert.rejects(tf.confirmEnrollment("u1", await codeFor(secret, now())), code("no-pending-enrollment"));
});

test("confirm enrollment: the pending secret expires and a new enrollment replaces the old pending secret", async () => {
  const { tf, now, advance } = setup();
  const first = await tf.beginEnrollment("u1", { accountName: "ann@example.com" });
  advance(15 * MINUTE);
  await assert.rejects(tf.confirmEnrollment("u1", await codeFor(first.secret, now())), code("no-pending-enrollment"));
  assert.equal(await tf.isEnabled("u1"), false);
  const second = await tf.beginEnrollment("u1", { accountName: "ann@example.com" });
  assert.notEqual(second.secret, first.secret);
  await assert.rejects(tf.confirmEnrollment("u1", await codeFor(first.secret, now())), code("invalid-code"), "old pending secret is gone");
  await tf.confirmEnrollment("u1", await codeFor(second.secret, now()));
  assert.equal(await tf.isEnabled("u1"), true);
});

test("code verification: accepts the current step and one step of skew either way, rejects two steps", async () => {
  for (const [offset, accepted] of [[-1, true], [0, true], [1, true], [-2, false], [2, false]]) {
    const { tf, secret, now, advance } = await enrolled();
    advance(60_000); // keep the confirming step out of the window so only skew is tested
    const attempt = tf.verify("u1", await codeFor(secret, now(), offset));
    if (accepted) assert.deepEqual(await attempt, { ok: true, method: "totp" }, `offset ${offset}`);
    else await assert.rejects(attempt, code("invalid-code"), `offset ${offset}`);
  }
});

test("code verification: malformed codes fail; spaces inside a code are tolerated", async () => {
  const { tf, secret, now, store } = await enrolled();
  for (const bad of ["", "12345", "1234567", "12a456", "１２３４５６", null, 123456, "123456\n7"]) {
    await assert.rejects(tf.verify("u1", bad), code("invalid-code"), JSON.stringify(bad));
    await store.clearAttempts("u1");
  }
  const good = await codeFor(secret, now());
  assert.deepEqual(await tf.verify("u1", `${good.slice(0, 3)} ${good.slice(3)}`), { ok: true, method: "totp" });
  assert.equal(constantTimeEqual("123456", "123456"), true);
  assert.equal(constantTimeEqual("123456", "123457"), false);
  assert.equal(constantTimeEqual("123456", "12345"), false);
});

test("replay protection: an accepted time step cannot be used again, nor an earlier step in the window", async () => {
  const { tf, secret, now } = await enrolled();
  const current = await codeFor(secret, now());
  await tf.verify("u1", current);
  await assert.rejects(tf.verify("u1", current), code("invalid-code"), "same code replayed");
  await assert.rejects(tf.verify("u1", await codeFor(secret, now(), -1)), code("invalid-code"), "earlier step still in window");
  await tf.verify("u1", await codeFor(secret, now(), 1));
  await assert.rejects(tf.verify("u1", current), code("invalid-code"));
});

test("replay protection: the code used to confirm enrollment cannot be replayed for sign-in", async () => {
  const { tf, now } = setup();
  const { secret } = await tf.beginEnrollment("u1", { accountName: "a@example.com" });
  const used = await codeFor(secret, now());
  await tf.confirmEnrollment("u1", used);
  await assert.rejects(tf.verify("u1", used), code("invalid-code"));
});

test("replay protection: of four concurrent verifies of one code exactly one wins (memory store)", async () => {
  const { tf, secret, now } = await enrolled();
  const value = await codeFor(secret, now());
  const results = await Promise.allSettled([1, 2, 3, 4].map(() => tf.verify("u1", value)));
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  assert.ok(results.filter((r) => r.status === "rejected").every((r) => r.reason.code === "invalid-code"));
});

test("attempt limits: five failures per 15 minutes lock the account, even for a correct code, until the window passes", async () => {
  const { tf, secret, now, advance } = await enrolled();
  for (let i = 0; i < 5; i++) await assert.rejects(tf.verify("u1", "000000"), code("invalid-code"));
  const locked = await tf.verify("u1", await codeFor(secret, now())).catch((error) => error);
  assert.equal(locked.code, "rate-limited");
  assert.ok(locked.retryAfterMs > 0 && locked.retryAfterMs <= 15 * MINUTE);
  advance(15 * MINUTE);
  assert.deepEqual(await tf.verify("u1", await codeFor(secret, now())), { ok: true, method: "totp" });
});

test("attempt limits: limits are per account and a success resets the count", async () => {
  const { tf, secret, now, advance } = await enrolled();
  for (let i = 0; i < 4; i++) await assert.rejects(tf.verify("u1", "000000"), code("invalid-code"));
  await tf.verify("u1", await codeFor(secret, now()));
  advance(30_000);
  for (let i = 0; i < 4; i++) await assert.rejects(tf.verify("u1", "000000"), code("invalid-code"));
  await assert.rejects(tf.verify("u2", "000000"), code("not-enabled"), "another account is unaffected");
});

test("attempt limits: the recovery-code path shares the same per-account limit", async () => {
  const { tf, recoveryCodes } = await enrolled();
  for (let i = 0; i < 3; i++) await assert.rejects(tf.verify("u1", "000000"), code("invalid-code"));
  for (let i = 0; i < 2; i++) await assert.rejects(tf.verifyRecoveryCode("u1", "AAAAA-AAAAA"), code("invalid-code"));
  await assert.rejects(tf.verifyRecoveryCode("u1", recoveryCodes[0]), code("rate-limited"));
  await assert.rejects(tf.verify("u1", "000000"), code("rate-limited"));
});

test("attempt limits: concurrent wrong guesses cannot exceed the limit", async () => {
  const { tf } = await enrolled();
  const results = await Promise.allSettled(Array.from({ length: 12 }, () => tf.verify("u1", "000000")));
  assert.equal(results.filter((r) => r.reason?.code === "invalid-code").length, 5);
  assert.equal(results.filter((r) => r.reason?.code === "rate-limited").length, 7);
});

test("secret protection: AES-256-GCM ciphertext with key id; plaintext never stored or returned after confirmation", async () => {
  const { tf, store, secret, now } = await enrolled();
  const row = store.dump().enrollments[0];
  assert.equal(row.secret.keyId, "k1");
  assert.equal(base64ToBytes(row.secret.iv).length, 12);
  assert.equal(base64ToBytes(row.secret.ciphertext).length, 20 + 16, "secret plus GCM tag");
  const everything = JSON.stringify(store.dump());
  assert.ok(!everything.includes(secret), "base32 secret not stored");
  const status = await tf.status("u1");
  assert.deepEqual(status, { enabled: true, pending: false, recoveryCodesRemaining: 10 });
  assert.ok(!JSON.stringify(status).includes(secret));
  await assert.rejects(tf.beginEnrollment("u1", { accountName: "a@example.com" }), code("already-enabled"), "cannot re-show the secret");
  // The ciphertext is bound to the user id (AAD): moved to another user it fails to decrypt.
  await store.savePending({ ...row, userId: "u2", status: "pending", pendingExpiresAt: now() + MINUTE, lastUsedStep: null });
  await assert.rejects(tf.confirmEnrollment("u2", await codeFor(secret, now())), code("secret-unreadable"));
});

test("secret protection: old keys still decrypt after rotation and reencryptSecret moves the row to the current key", async () => {
  const ctx = await enrolled();
  const rotated = createTwoFactor({
    store: ctx.store, issuer: "Example App", recoveryPepper: PEPPER, now: ctx.now,
    encryption: { currentKeyId: "k2", keys: { k1: KEY_A, k2: KEY_B } },
  });
  assert.deepEqual(await rotated.verify("u1", await codeFor(ctx.secret, ctx.now())), { ok: true, method: "totp" });
  assert.equal(await rotated.reencryptSecret("u1"), true);
  assert.equal(ctx.store.dump().enrollments[0].secret.keyId, "k2");
  assert.equal(await rotated.reencryptSecret("u1"), false, "already current");
  ctx.advance(30_000);
  const onlyNew = createTwoFactor({
    store: ctx.store, issuer: "Example App", recoveryPepper: PEPPER, now: ctx.now,
    encryption: { currentKeyId: "k2", keys: { k2: KEY_B } },
  });
  assert.deepEqual(await onlyNew.verify("u1", await codeFor(ctx.secret, ctx.now())), { ok: true, method: "totp" });
  assert.throws(() => createTwoFactor({ store: ctx.store, issuer: "X", recoveryPepper: PEPPER, encryption: { currentKeyId: "k1", keys: { k1: new Uint8Array(16) } } }), RangeError);
  assert.throws(() => createTwoFactor({ store: ctx.store, issuer: "X", recoveryPepper: PEPPER, encryption: { currentKeyId: "kx", keys: { k1: KEY_A } } }), RangeError);
});

test("recovery codes: random, stored only as HMAC-SHA-256 with the pepper, single use, case and dash insensitive", async () => {
  const { tf, store, recoveryCodes } = await enrolled();
  assert.equal(new Set(recoveryCodes).size, 10);
  for (const value of recoveryCodes) assert.match(value, /^[A-Z2-7]{5}-[A-Z2-7]{5}$/);
  const hashes = store.dump().recoveryCodes.map((item) => item.codeHash);
  assert.equal(hashes.length, 10);
  for (const value of recoveryCodes) {
    assert.ok(!JSON.stringify(store.dump()).includes(value.replace("-", "")));
    assert.ok(hashes.includes(await hashRecoveryCode(PEPPER, value)));
  }
  const expectedHmac = await hmacHex(PEPPER, normalizeRecoveryCode(recoveryCodes[0]));
  assert.equal(await hashRecoveryCode(PEPPER, recoveryCodes[0]), expectedHmac);
  assert.deepEqual(await tf.verifyRecoveryCode("u1", ` ${recoveryCodes[0].toLowerCase().replace("-", "")} `), { ok: true, method: "recovery-code", remaining: 9 });
  await assert.rejects(tf.verifyRecoveryCode("u1", recoveryCodes[0]), code("invalid-code"), "single use");
  assert.equal((await tf.status("u1")).recoveryCodesRemaining, 9);
});

test("recovery codes: concurrent uses of one code, exactly one wins", async () => {
  const { tf, recoveryCodes } = await enrolled();
  const results = await Promise.allSettled([1, 2, 3, 4].map(() => tf.verifyRecoveryCode("u1", recoveryCodes[1])));
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
});

test("recovery codes: regenerating replaces every previous code (with recent re-authentication)", async () => {
  const { tf, recoveryCodes, now } = await enrolled();
  const fresh = await tf.regenerateRecoveryCodes("u1", { authenticatedAt: now() - MINUTE });
  assert.equal(fresh.recoveryCodes.length, 10);
  assert.ok(fresh.recoveryCodes.every((value) => !recoveryCodes.includes(value)));
  await assert.rejects(tf.verifyRecoveryCode("u1", recoveryCodes[2]), code("invalid-code"));
  assert.equal((await tf.verifyRecoveryCode("u1", fresh.recoveryCodes[0])).remaining, 9);
});

test("step-up: disabling and regenerating require re-authentication within 10 minutes and are refused otherwise", async () => {
  const { tf, now, recoveryCodes } = await enrolled();
  await assert.rejects(tf.disable("u1", { authenticatedAt: now() - 11 * MINUTE }), code("reauthentication-required"));
  await assert.rejects(tf.disable("u1", {}), code("reauthentication-required"));
  await assert.rejects(tf.disable("u1", { authenticatedAt: now() + 5 * MINUTE }), code("reauthentication-required"), "future timestamps refused");
  await assert.rejects(tf.regenerateRecoveryCodes("u1", { authenticatedAt: now() - 11 * MINUTE }), code("reauthentication-required"));
  await assert.rejects(tf.regenerateRecoveryCodes("u1", { authenticatedAt: Number.NaN }), code("reauthentication-required"));
  assert.equal(await tf.isEnabled("u1"), true, "refusals change nothing");
  assert.equal((await tf.verifyRecoveryCode("u1", recoveryCodes[0])).remaining, 9);
  await tf.disable("u1", { authenticatedAt: now() - 9 * MINUTE });
  assert.equal(await tf.isEnabled("u1"), false);
  assert.deepEqual(await tf.status("u1"), { enabled: false, pending: false, recoveryCodesRemaining: 0 });
  await assert.rejects(tf.verifyRecoveryCode("u1", recoveryCodes[1]), code("not-enabled"));
});

function base64ToBytes(text) { return Uint8Array.from(atob(text), (c) => c.charCodeAt(0)); }
async function hmacHex(keyBytes, message) {
  const key = await crypto.subtle.importKey("raw", keyBytes, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message)));
  return Array.from(mac, (b) => b.toString(16).padStart(2, "0")).join("");
}

// ---------- HTTP adapter ----------

function httpSetup(ctx, extra = {}) {
  const limits = [];
  const verified = [];
  let session = { userId: "u1", stage: "signed-in", accountName: "ann@example.com", authenticatedAt: ctx.now() };
  const handler = createTwoFactorHandler({
    twoFactor: ctx.tf, prefix: "/api/2fa", allowedOrigins: [ORIGIN],
    authenticate: async () => session,
    rateLimit: (key) => { limits.push(key); return !(extra.block ?? []).includes(key); },
    clientIp: () => "203.0.113.9",
    onVerified: async (event) => { verified.push(event); return { "set-cookie": "mfa=1; HttpOnly" }; },
    ...extra.options,
  });
  const call = (method, path, body, headers = {}) => handler(new Request(`https://app.example.com/api/2fa${path}`, {
    method, headers: { origin: ORIGIN, ...(body === undefined ? {} : { "content-type": "application/json" }), ...headers },
    ...(body === undefined ? {} : { body: typeof body === "string" ? body : JSON.stringify(body) }),
  }));
  return { handler, call, limits, verified, setSession: (value) => { session = value; } };
}

test("HTTP adapter: enroll, confirm, verify, recovery, regenerate and disable with no-store responses", async () => {
  const ctx = setup();
  const { call, verified, limits } = httpSetup(ctx);
  const enroll = await call("POST", "/enroll", {});
  assert.equal(enroll.status, 200);
  assert.equal(enroll.headers.get("cache-control"), "no-store");
  const { secret, otpauthUri } = await enroll.json();
  assert.ok(otpauthUri.startsWith("otpauth://totp/Example%20App:ann%40example.com?"));
  const confirm = await call("POST", "/enroll/confirm", { code: await codeFor(secret, ctx.now()) });
  assert.equal(confirm.status, 200);
  const { recoveryCodes } = await confirm.json();
  assert.equal(recoveryCodes.length, 10);
  const status = await call("GET", "/status");
  assert.deepEqual(await status.json(), { enabled: true, pending: false, recoveryCodesRemaining: 10 });
  assert.equal(status.headers.get("cache-control"), "no-store");
  ctx.advance(30_000);
  const ok = await call("POST", "/verify", { code: await codeFor(secret, ctx.now()) });
  assert.equal(ok.status, 200);
  assert.equal(ok.headers.get("set-cookie"), "mfa=1; HttpOnly");
  assert.deepEqual(verified, [{ userId: "u1", method: "totp" }]);
  const bad = await call("POST", "/verify", { code: "000000" });
  assert.equal(bad.status, 400);
  assert.equal((await bad.json()).error, "invalid-code");
  const recovery = await call("POST", "/recovery", { code: recoveryCodes[0] });
  assert.deepEqual(await recovery.json(), { ok: true, remaining: 9 });
  const regen = await call("POST", "/recovery-codes/regenerate", {});
  assert.equal(regen.status, 200);
  assert.equal((await regen.json()).recoveryCodes.length, 10);
  const off = await call("POST", "/disable", {});
  assert.equal(off.status, 204);
  assert.equal(off.headers.get("cache-control"), "no-store");
  assert.ok(limits.includes("ip:203.0.113.9") && limits.includes("user:u1"));
});

test("HTTP adapter: origin check, auth hook, session stage, rate-limit hook, step-up refusal, bounded body and lockout status", async () => {
  const ctx = await enrolled();
  const { call, setSession } = httpSetup(ctx, { block: ["user:blocked"] });
  assert.equal((await call("POST", "/verify", { code: "000000" }, { origin: "https://evil.example" })).status, 403);
  assert.equal((await call("POST", "/verify", "{}", { origin: "", "content-type": "application/json" })).status, 403);
  assert.equal((await call("POST", "/verify", "x".repeat(5000))).status, 400);
  assert.equal((await call("POST", "/verify", "{nope")).status, 400);
  assert.equal((await call("POST", "/verify", "{}", { "content-type": "text/plain" })).status, 400);
  assert.equal((await call("DELETE", "/verify")).status, 405);
  assert.equal((await call("GET", "/../other")).status, 404);
  setSession({ userId: "u1", stage: "signed-in", authenticatedAt: ctx.now() - 20 * MINUTE });
  const stale = await call("POST", "/disable", {});
  assert.equal(stale.status, 403);
  assert.equal((await stale.json()).error, "reauthentication-required");
  setSession(null);
  assert.equal((await call("GET", "/status")).status, 401);
  setSession({ userId: "blocked", stage: "second-factor-pending" });
  assert.equal((await call("POST", "/verify", { code: "000000" })).status, 429);
  // A password-only session may verify but cannot touch settings, even with a fresh authenticatedAt.
  setSession({ userId: "u1", stage: "second-factor-pending", authenticatedAt: ctx.now() });
  for (const path of ["/recovery-codes/regenerate", "/disable", "/enroll", "/enroll/confirm"]) {
    const refused = await call("POST", path, {});
    assert.equal(refused.status, 403, path);
    assert.equal((await refused.json()).error, "second-factor-required");
  }
  assert.equal((await call("GET", "/status")).status, 403);
  assert.equal(await ctx.tf.isEnabled("u1"), true);
  for (let i = 0; i < 5; i++) await call("POST", "/verify", { code: "000000" });
  const locked = await call("POST", "/verify", { code: await codeFor(ctx.secret, ctx.now()) });
  assert.equal(locked.status, 429);
  assert.ok(Number(locked.headers.get("retry-after")) > 0);
  assert.equal(locked.headers.get("cache-control"), "no-store");
});

test("enrollment: an account name with a colon is refused with bad-request instead of a plain RangeError", async () => {
  const { tf } = setup();
  await assert.rejects(tf.beginEnrollment("u1", { accountName: "ann:smith" }), code("bad-request"));
  await assert.rejects(tf.beginEnrollment("u1", { accountName: "" }), code("bad-request"));
  assert.equal(await tf.isEnabled("u1"), false);
});

test("HTTP adapter: user ids containing a colon enroll with a colon-free label; a bad accountName returns JSON 400", async () => {
  const ctx = setup();
  const { call, setSession } = httpSetup(ctx);
  setSession({ userId: "user:42", stage: "signed-in", authenticatedAt: ctx.now() });
  const enroll = await call("POST", "/enroll", {});
  assert.equal(enroll.status, 200);
  const { secret, otpauthUri } = await enroll.json();
  assert.equal(otpauthUri.split("?")[0], "otpauth://totp/Example%20App:user-42");
  const confirm = await call("POST", "/enroll/confirm", { code: await codeFor(secret, ctx.now()) });
  assert.equal(confirm.status, 200);
  assert.equal(await ctx.tf.isEnabled("user:42"), true);
  setSession({ userId: "u9", stage: "signed-in", accountName: "a:b", authenticatedAt: ctx.now() });
  const bad = await call("POST", "/enroll", {});
  assert.equal(bad.status, 400);
  assert.equal(bad.headers.get("content-type"), "application/json");
  assert.equal((await bad.json()).error, "bad-request");
});

// ---- Options from fitting the module to an independent app spec (0.2.0) ----

test("lockoutMs: consecutive failures lock the account from the attempt that reached the limit, without extension", async () => {
  const { tf, secret, now, advance } = await enrolled({ options: { lockoutMs: 15 * MINUTE } });
  // Failures spread over more than 15 minutes still add up: there is no rolling-off window in this mode.
  for (let i = 0; i < 4; i++) { await assert.rejects(tf.verify("u1", "000000"), code("invalid-code")); advance(5 * MINUTE); }
  await assert.rejects(tf.verify("u1", "000000"), code("invalid-code"), "the fifth failure");
  const locked = await tf.verify("u1", await codeFor(secret, now())).catch((error) => error);
  assert.equal(locked.code, "rate-limited");
  assert.equal(locked.retryAfterMs, 15 * MINUTE, "locked for 15 minutes from the fifth failure");
  advance(15 * MINUTE - 1000);
  const still = await tf.verifyRecoveryCode("u1", "AAAAA-AAAAA").catch((error) => error);
  assert.equal(still.code, "rate-limited");
  assert.equal(still.retryAfterMs, 1000, "attempts while locked do not extend the lock");
  advance(1000);
  assert.deepEqual(await tf.verify("u1", await codeFor(secret, now())), { ok: true, method: "totp" }, "the end of the lock resets the count");
  advance(30_000);
  for (let i = 0; i < 4; i++) await assert.rejects(tf.verify("u1", "000000"), code("invalid-code"));
  assert.deepEqual(await tf.verify("u1", await codeFor(secret, now())), { ok: true, method: "totp" }, "a success resets the count");
  advance(30_000);
  for (let i = 0; i < 4; i++) await assert.rejects(tf.verify("u1", "000000"), code("invalid-code"));
  // Concurrent wrong guesses cannot get more than the limit checked.
  const burst = await enrolled({ options: { lockoutMs: 15 * MINUTE } });
  const results = await Promise.allSettled(Array.from({ length: 12 }, () => burst.tf.verify("u1", "000000")));
  assert.equal(results.filter((r) => r.reason?.code === "invalid-code").length, 5);
  assert.equal(results.filter((r) => r.reason?.code === "rate-limited").length, 7);
  assert.throws(() => setup({ options: { lockoutMs: 10 } }), RangeError);
});

test("allowCodeSpaces: false accepts only exactly six ASCII digits", async () => {
  const { tf, secret, now, advance, store } = await enrolled({ options: { allowCodeSpaces: false } });
  const good = await codeFor(secret, now());
  for (const spaced of [`${good.slice(0, 3)} ${good.slice(3)}`, ` ${good}`, `${good} `]) {
    await assert.rejects(tf.verify("u1", spaced), code("invalid-code"), JSON.stringify(spaced));
  }
  await store.clearAttempts("u1");
  assert.deepEqual(await tf.verify("u1", good), { ok: true, method: "totp" });
  advance(30_000);
  const begun = await setup({ options: { allowCodeSpaces: false } });
  const { secret: s2 } = await begun.tf.beginEnrollment("u2", { accountName: "bob@example.com" });
  const c2 = await codeFor(s2, begun.now());
  await assert.rejects(begun.tf.confirmEnrollment("u2", ` ${c2}`), code("invalid-code"), "enrollment confirmation too");
});
