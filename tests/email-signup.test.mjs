// SPDX-License-Identifier: Apache-2.0
// email-signup with the in-memory store: validation and normalization, unique accounts under concurrency, the NIST
// style policy, scrypt storage, hashed single-use tokens, the verified gate, resend limits, idempotent retried
// delivery, enumeration safety and the Fetch adapter.
import assert from "node:assert/strict";
import test from "node:test";
import { createEmailSignup, normalizeEmail, hashToken, assertVerified, SignupError } from "../.build/modules/email-signup/files/core.js";
import { MemoryEmailSignupStore } from "../.build/modules/email-signup/files/memory-store.js";
import { createEmailSignupHandler, createVerifiedGate } from "../.build/modules/email-signup/files/http.js";
import { createPasswordPolicy, defaultPasswordPolicy } from "../.build/modules/email-signup/files/password-policy.js";
import { createScryptHasher, parseScryptHash } from "../.build/modules/email-signup/files/scrypt-hasher.js";

const MINUTE = 60_000;
const ORIGIN = "https://app.example.com";
const GOOD = "a sufficiently long passphrase";
const fakeHasher = { hash: async (p) => `fake$${p}`, verify: async (p, h) => h === `fake$${p}` };

function setup(extra = {}) {
  let now = 1_000_000;
  let ids = 0;
  let bytes = 0;
  const store = extra.store ?? new MemoryEmailSignupStore();
  const sent = [];
  const existing = [];
  const verified = [];
  const sleeps = [];
  const signup = createEmailSignup({
    store, baseUrl: "https://app.example.com/verify-email",
    sendEmail: async (message) => { sent.push(message); },
    hasher: fakeHasher,
    onExistingAccount: async (notice) => { existing.push(notice); },
    onVerified: async (id) => { verified.push(id); },
    sleep: async (ms) => { sleeps.push(ms); },
    now: () => now, newId: () => `id${++ids}`,
    randomBytes: (length) => { bytes++; return Uint8Array.from({ length }, (_, i) => (i * 7 + bytes * 13) & 255); },
    ...extra.options,
  });
  const tokenOf = (message) => new URL(message.link).searchParams.get("token");
  return { store, signup, sent, existing, verified, sleeps, tokenOf, advance: (ms) => { now += ms; } };
}
const code = (expected) => (error) => error instanceof SignupError && error.code === expected;

test("validated-email: addresses are validated and normalized before use and comparison", async () => {
  assert.equal(normalizeEmail("  Ann.Lee+news@Example.COM "), "ann.lee+news@example.com");
  for (const bad of ["", "ann", "ann@", "@example.com", "ann@example", "ann@@example.com", "a b@example.com",
    ".ann@example.com", "ann..lee@example.com", "ann@-example.com", "änn@example.com", `${"a".repeat(65)}@example.com`,
    `ann@${"a".repeat(250)}.com`, 42, null]) {
    assert.equal(normalizeEmail(bad), null, `rejects ${String(bad)}`);
  }
  const { signup, store, sent } = setup();
  await assert.rejects(signup.signup("not an email", GOOD), code("invalid-email"));
  assert.equal(store.dump().accounts.length, 0);
  await signup.signup("  ANN@Example.com", GOOD);
  assert.equal(store.dump().accounts[0].email, "ann@example.com");
  assert.equal(sent[0].to, "ann@example.com");
  // A differently cased address is the same account.
  await signup.signup("ann@EXAMPLE.com", GOOD);
  assert.equal(store.dump().accounts.length, 1);
});

test("unique-account: four concurrent signups with the same normalized email create exactly one account", async () => {
  const { signup, store, sent, existing } = setup();
  const results = await Promise.all(["ann@example.com", "ANN@example.com", " ann@Example.com ", "Ann@EXAMPLE.COM"]
    .map((email) => signup.signup(email, GOOD)));
  assert.equal(store.dump().accounts.length, 1);
  assert.equal(sent.length, 1, "one verification email");
  assert.equal(existing.length, 3, "the other three notify the owner");
  assert.ok(results.every((result) => result.ok === true));
});

test("password-policy: NIST-style default (length in code points, blocklist, no composition rules) and an injected policy", async () => {
  assert.deepEqual(defaultPasswordPolicy("short", {}), ["too-short"]);
  assert.deepEqual(defaultPasswordPolicy("all lowercase words no digits", {}), [], "no composition rules");
  assert.deepEqual(defaultPasswordPolicy("x".repeat(64), {}), ["repetitive"], "64 characters are allowed");
  assert.deepEqual(defaultPasswordPolicy("y".repeat(129), {}).includes("too-long"), true);
  assert.deepEqual(defaultPasswordPolicy("PasswordPassword", {}), ["common-password"]);
  assert.deepEqual(defaultPasswordPolicy("correcthorsebatterystaple", {}), ["common-password"]);
  assert.deepEqual(defaultPasswordPolicy("annabelle-is-my-name", { email: "annabelle@example.com" }), ["contains-email"]);
  // 15 emoji are 15 code points (30 UTF-16 units) and pass the length rule.
  assert.deepEqual(defaultPasswordPolicy("🙂🙃😀😁😂🤣😃😄😅😆😉😊😋😎😍", {}), []);
  assert.deepEqual(createPasswordPolicy({ minLength: 8, blocklist: ["genlibapp"] })("GenlibApp", {}), ["common-password"]);
  assert.throws(() => createPasswordPolicy({ maxLength: 32 }), RangeError);
  assert.throws(() => createPasswordPolicy({ minLength: 6 }), RangeError);

  const { signup, store } = setup();
  await assert.rejects(signup.signup("ann@example.com", "password1"), (error) => code("weak-password")(error) && error.problems.includes("too-short"));
  assert.equal(store.dump().accounts.length, 0, "a rejected password creates nothing");
  const calls = [];
  const custom = setup({ options: { passwordPolicy: (password, context) => { calls.push(context.email); return password === "pwned-but-long-enough" ? ["breached"] : []; } } });
  await assert.rejects(custom.signup.signup("bob@example.com", "pwned-but-long-enough"), (error) => error.problems[0] === "breached");
  await custom.signup.signup("bob@example.com", "short ok here");
  assert.deepEqual(calls, ["bob@example.com", "bob@example.com"]);
});

test("password-storage: default scrypt hasher writes a salted PHC string (N>=2^15, r=8, p=1, 16-byte salt) and verifies in constant time", async () => {
  const hasher = createScryptHasher({ cost: 15 });
  const first = await hasher.hash(GOOD);
  const second = await hasher.hash(GOOD);
  assert.match(first, /^\$scrypt\$ln=15,r=8,p=1\$[A-Za-z0-9+/]{22}\$[A-Za-z0-9+/]{43}$/);
  assert.notEqual(first, second, "random salt per hash");
  const parsed = parseScryptHash(first);
  assert.equal(parsed.salt.length, 16);
  assert.equal(parsed.key.length, 32);
  assert.equal(await hasher.verify(GOOD, first), true);
  assert.equal(await hasher.verify(GOOD + "!", first), false);
  // NFKC: the full-width form verifies against the ASCII password.
  assert.equal(await hasher.verify("ａ sufficiently long passphrase", first), true);
  assert.equal(await hasher.verify(GOOD, "$scrypt$ln=30,r=8,p=1$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"), false, "absurd cost refused");
  assert.equal(await hasher.verify(GOOD, "plaintext"), false);
  assert.equal(hasher.needsRehash(first), false);
  assert.equal(createScryptHasher({ cost: 16 }).needsRehash(first), true, "weaker cost needs rehash");
  assert.equal(hasher.needsRehash("$2b$10$bcrypt"), true);
  assert.throws(() => createScryptHasher({ cost: 14 }), RangeError, "N below 2^15 refused");
  assert.throws(() => createScryptHasher({ blockSize: 4 }), RangeError);

  // Default parameters (N = 2^17) through signup with no injected hasher: only the hash is stored.
  const { signup, store } = setup({ options: { hasher: undefined } });
  await signup.signup("ann@example.com", GOOD);
  const stored = store.dump().accounts[0].passwordHash;
  assert.match(stored, /^\$scrypt\$ln=17,r=8,p=1\$/);
  assert.ok(!JSON.stringify(store.dump()).includes(GOOD), "raw password never stored");
  assert.equal(await createScryptHasher().verify(GOOD, stored), true);
});

test("verification-token: 256-bit random token in the link, stored only as SHA-256, expiring and single-use", async () => {
  const { signup, store, sent, tokenOf, advance } = setup();
  await signup.signup("ann@example.com", GOOD);
  const token = tokenOf(sent[0]);
  assert.match(token, /^[A-Za-z0-9_-]{43}$/, "32 bytes base64url");
  assert.ok(sent[0].link.startsWith("https://app.example.com/verify-email?token="));
  const [row] = store.dump().tokens;
  assert.equal(row.tokenHash, await hashToken(token));
  assert.ok(!JSON.stringify(store.dump()).includes(token), "raw token never stored");
  assert.equal(row.expiresAt - row.createdAt, 24 * 60 * MINUTE);
  // Expired.
  advance(24 * 60 * MINUTE);
  await assert.rejects(signup.confirm(token), code("invalid-token"));
  // Fresh link, used once.
  await signup.resend("ann@example.com");
  const fresh = tokenOf(sent[1]);
  assert.deepEqual(await signup.confirm(fresh), { accountId: "id1", newlyVerified: true });
  await assert.rejects(signup.confirm(fresh), code("invalid-token"), "single use");
  for (const bad of ["", "short", "x".repeat(43), fresh + "A", 7]) await assert.rejects(signup.confirm(bad), code("invalid-token"));
});

test("verified-gate: unverified accounts are refused by requireVerified, assertVerified and the HTTP gate until confirmed", async () => {
  const { signup, sent, tokenOf, verified } = setup();
  await signup.signup("ann@example.com", GOOD);
  assert.equal(await signup.isVerified("id1"), false);
  await assert.rejects(signup.requireVerified("id1"), code("unverified"));
  await assert.rejects(signup.requireVerified("nobody"), code("unverified"));
  assert.throws(() => assertVerified({}), code("unverified"));
  assert.throws(() => assertVerified(null), code("unverified"));
  const gate = createVerifiedGate({ signup, accountId: (request) => request.headers.get("x-test-account") });
  const asAccount = (id) => new Request(`${ORIGIN}/api/reports`, id ? { headers: { "x-test-account": id } } : {});
  const refused = await gate(asAccount("id1"));
  assert.equal(refused.status, 403);
  assert.equal((await refused.json()).error, "email-unverified");
  assert.equal(refused.headers.get("cache-control"), "no-store");
  assert.equal((await gate(asAccount(null))).status, 401);

  await signup.confirm(tokenOf(sent[0]));
  assert.equal(await gate(asAccount("id1")), null);
  assert.equal((await signup.requireVerified("id1")).id, "id1");
  assert.deepEqual(verified, ["id1"]);
  // A verified account gets no more links.
  assert.deepEqual(await signup.resend("ann@example.com"), { ok: true, serverError: "already-verified" });
});

test("verified-gate: four concurrent confirms of one link verify the account exactly once", async () => {
  const { signup, sent, tokenOf, verified, store } = setup();
  await signup.signup("ann@example.com", GOOD);
  const token = tokenOf(sent[0]);
  const results = await Promise.allSettled([1, 2, 3, 4].map(() => signup.confirm(token)));
  const won = results.filter((result) => result.status === "fulfilled");
  assert.equal(won.length, 1);
  assert.equal(won[0].value.newlyVerified, true);
  assert.ok(results.filter((result) => result.status === "rejected").every((result) => code("invalid-token")(result.reason)));
  assert.deepEqual(verified, ["id1"], "onVerified runs once");
  const verifiedAt = store.dump().accounts[0].verifiedAt;
  assert.equal(typeof verifiedAt, "number");
});

test("resend-limits: cooldown and per-window cap on an injected clock, and each resend invalidates earlier links", async () => {
  const { signup, sent, tokenOf, advance } = setup({ options: { resendCooldownMs: MINUTE, maxSendsPerWindow: 3, sendWindowMs: 60 * MINUTE } });
  await signup.signup("ann@example.com", GOOD);
  // Cooldown: an immediate resend is refused (publicly still ok).
  assert.deepEqual(await signup.resend("ann@example.com"), { ok: true, serverError: "rate-limited" });
  await assert.rejects(signup.resendForAccount("id1"), (error) => code("rate-limited")(error) && error.retryAfterMs === MINUTE);
  advance(MINUTE);
  assert.deepEqual(await signup.resend("ann@example.com"), { ok: true });
  advance(MINUTE);
  assert.deepEqual(await signup.resendForAccount("id1"), { alreadyVerified: false });
  assert.equal(sent.length, 3);
  // Window cap of 3 sends (signup counts): refused even after the cooldown, until the window ends.
  advance(MINUTE);
  assert.deepEqual(await signup.resend("ann@example.com"), { ok: true, serverError: "rate-limited" });
  await assert.rejects(signup.resendForAccount("id1"), (error) => code("rate-limited")(error) && error.retryAfterMs === 57 * MINUTE);
  advance(57 * MINUTE);
  assert.deepEqual(await signup.resend("ann@example.com"), { ok: true });
  // Only the newest link works.
  const tokens = sent.map(tokenOf);
  for (const old of tokens.slice(0, -1)) await assert.rejects(signup.confirm(old), code("invalid-token"));
  assert.equal((await signup.confirm(tokens.at(-1))).newlyVerified, true);

  // Concurrent resends cannot exceed the limit.
  const burst = setup({ options: { resendCooldownMs: 0, maxSendsPerWindow: 2 } });
  await burst.signup.signup("bob@example.com", GOOD);
  await Promise.all([1, 2, 3, 4].map(() => burst.signup.resend("bob@example.com")));
  assert.equal(burst.sent.length, 2, "signup plus one resend");
  assert.deepEqual(await burst.signup.resend("nobody@example.com"), { ok: true, serverError: "unknown-account" });
});

test("verification-email: one idempotency key per token, retried with the same key; final failure revokes the link and is reported", async () => {
  let failures = 2;
  const attempts = [];
  const flaky = setup({ options: { sendEmail: async (message) => { attempts.push(message); if (failures-- > 0) throw new Error("timeout"); } } });
  assert.deepEqual(await flaky.signup.signup("ann@example.com", GOOD), { ok: true });
  assert.equal(attempts.length, 3);
  assert.ok(attempts.every((message) => message.idempotencyKey === attempts[0].idempotencyKey && message.link === attempts[0].link));
  assert.match(attempts[0].idempotencyKey, /^email-verification:id\d+$/);
  assert.equal(attempts[0].reason, "signup");
  assert.deepEqual(flaky.sleeps, [250, 1000]);
  assert.equal((await flaky.signup.confirm(flaky.tokenOf(attempts[0]))).newlyVerified, true);

  // Different tokens get different keys.
  const { signup, sent, advance } = setup();
  await signup.signup("bob@example.com", GOOD);
  advance(MINUTE);
  await signup.resend("bob@example.com");
  assert.notEqual(sent[0].idempotencyKey, sent[1].idempotencyKey);
  assert.equal(sent[1].reason, "resend");

  // Every attempt fails: reported server-side, link revoked, the account can resend later.
  const down = setup({ options: { sendAttempts: 2, sendEmail: async (message) => { attempts.push(message); throw new Error("down"); } } });
  assert.deepEqual(await down.signup.signup("cat@example.com", GOOD), { ok: true, serverError: "delivery-failed" });
  const lost = down.tokenOf(attempts.at(-1));
  await assert.rejects(down.signup.confirm(lost), code("invalid-token"), "a copy the provider sent anyway is inert");
  assert.ok(down.store.dump().tokens.every((token) => token.revokedAt !== undefined));
  down.advance(MINUTE);
  await assert.rejects(down.signup.resendForAccount("id1"), code("delivery-failed"));
});

test("signup is enumeration-safe: an existing email gets the same result, no new account or link, and the owner is notified", async () => {
  const { signup, store, sent, existing } = setup();
  const fresh = await signup.signup("ann@example.com", GOOD);
  const again = await signup.signup("Ann@Example.com", "another long passphrase");
  assert.deepEqual(fresh, { ok: true });
  assert.equal(again.ok, true);
  assert.equal(again.serverError, "existing-account", "server-only detail");
  assert.equal(store.dump().accounts.length, 1);
  assert.equal(store.dump().accounts[0].passwordHash, `fake$${GOOD}`, "the existing password is untouched");
  assert.equal(sent.length, 1);
  assert.deepEqual(existing, [{ accountId: "id1", email: "ann@example.com", verified: false }]);
});

test("a link stops working when the account email changes after it was sent", async () => {
  const { signup, store, sent, tokenOf } = setup();
  await signup.signup("ann@example.com", GOOD);
  store.changeEmail("id1", "ann.new@example.com");
  await assert.rejects(signup.confirm(tokenOf(sent[0])), code("invalid-token"));
  assert.equal(await signup.isVerified("id1"), false);
});

test("options are validated", () => {
  const store = new MemoryEmailSignupStore();
  const base = { store, sendEmail: async () => {}, baseUrl: "https://app.example.com/verify" };
  assert.throws(() => createEmailSignup({ ...base, baseUrl: "http://app.example.com/verify" }), RangeError);
  assert.throws(() => createEmailSignup({ ...base, baseUrl: "https://app.example.com/verify?x=1" }), RangeError);
  assert.throws(() => createEmailSignup({ ...base, ttlMs: MINUTE }), RangeError);
  assert.throws(() => createEmailSignup({ ...base, maxSendsPerWindow: 0 }), RangeError);
  assert.ok(createEmailSignup({ ...base, baseUrl: "http://localhost:3000/verify" }));
});

test("HTTP signup: when sendEmail and onExistingAccount both throw, new and registered emails get identical 202 bodies", async () => {
  const results = [];
  const { signup, store } = setup({ options: {
    sendEmail: async () => { throw new Error("provider down"); },
    onExistingAccount: async () => { throw new Error("provider down"); },
    sendAttempts: 1,
  } });
  const handler = createEmailSignupHandler({ signup, prefix: "/api/signup", allowedOrigins: [ORIGIN], onResult: (route, result) => results.push(result) });
  const post = (email) => handler(new Request(`${ORIGIN}/api/signup/signup`, {
    method: "POST", headers: { "content-type": "application/json", origin: ORIGIN }, body: JSON.stringify({ email, password: GOOD }),
  }));
  const fresh = await post("ann@example.com");
  const registered = await post("ann@example.com");
  assert.equal(fresh.status, 202);
  assert.equal(registered.status, 202);
  assert.equal(await fresh.text(), await registered.text());
  assert.deepEqual(results.map((result) => result.serverError), ["delivery-failed", "existing-account-notice-failed"]);
  assert.equal(store.dump().accounts.length, 1);
});

test("two interleaved concurrent resends leave at least one working link", async () => {
  // A barrier holds each resend's token write until both resends reach it, so their store calls interleave.
  const inner = new MemoryEmailSignupStore();
  let waiting = [];
  let armed = false;
  const slow = new Proxy(inner, {
    get(target, key) {
      const value = target[key];
      if (typeof value !== "function") return value;
      return async (...args) => {
        if (armed && /token/i.test(String(key)) && /^(insert|issue)/.test(String(key))) {
          await new Promise((resolve) => { waiting.push(resolve); if (waiting.length === 2) { waiting.forEach((release) => release()); waiting = []; } });
        }
        return value.apply(target, args);
      };
    },
  });
  const { signup, sent, tokenOf } = setup({ store: slow, options: { resendCooldownMs: 0, maxSendsPerWindow: 10 } });
  await signup.signup("ann@example.com", GOOD);
  armed = true;
  await Promise.all([signup.resend("ann@example.com"), signup.resend("ann@example.com")]);
  assert.equal(sent.length, 3);
  const outcomes = await Promise.allSettled(sent.slice(1).map((message) => signup.confirm(tokenOf(message))));
  assert.ok(outcomes.some((outcome) => outcome.status === "fulfilled"), "at least one resent link confirms");
  await assert.rejects(signup.confirm(tokenOf(sent[0])), code("invalid-token"), "the signup link was invalidated");
});

test("HTTP adapter: 202 identical bodies, 400 problems, 200 confirm, origin, 429 keys, bounded body, no-store", async () => {
  const { signup, sent, tokenOf } = setup();
  const keys = [];
  const results = [];
  let allow = true;
  const handler = createEmailSignupHandler({
    signup, prefix: "/api/signup/", allowedOrigins: [ORIGIN],
    rateLimit: (key) => { keys.push(key); return allow; }, clientIp: () => "203.0.113.9",
    onResult: (route, result) => results.push([route, result]),
  });
  const post = (path, body, headers = {}) => handler(new Request(`${ORIGIN}/api/signup/${path}`, {
    method: "POST", headers: { "content-type": "application/json", origin: ORIGIN, ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  }));

  const created = await post("signup", { email: "Ann@Example.com", password: GOOD });
  const duplicate = await post("signup", { email: "ann@example.com", password: GOOD });
  assert.equal(created.status, 202);
  assert.equal(duplicate.status, 202);
  assert.equal(await created.text(), await duplicate.text());
  assert.equal(created.headers.get("cache-control"), "no-store");
  assert.equal(created.headers.get("referrer-policy"), "no-referrer");
  assert.deepEqual(keys.slice(0, 2), ["ip:203.0.113.9", "email:ann@example.com"]);
  assert.equal(results[1][1].serverError, "existing-account");

  const weak = await post("signup", { email: "bob@example.com", password: "short" });
  assert.equal(weak.status, 400);
  assert.deepEqual((await weak.json()).problems, ["too-short"]);
  assert.equal((await post("signup", { email: "nope", password: GOOD })).status, 400);

  assert.equal((await post("resend", { email: "ann@example.com" })).status, 202);
  assert.equal((await post("resend", { email: "nobody@example.com" })).status, 202);

  const bad = await post("confirm", { token: "x".repeat(43) });
  assert.equal(bad.status, 400);
  assert.equal((await bad.json()).error, "invalid-token");
  const ok = await post("confirm", { token: tokenOf(sent[0]) });
  assert.equal(ok.status, 200);
  assert.deepEqual(await ok.json(), { verified: true });

  assert.equal((await post("signup", { email: "c@example.com", password: GOOD }, { origin: "https://evil.example" })).status, 403);
  assert.equal((await post("signup", "{nope")).status, 400);
  assert.equal((await post("signup", { email: "c@example.com", password: "p".repeat(5000) })).status, 400, "bounded body");
  assert.equal((await post("signup", { email: "c@example.com", password: GOOD }, { "content-type": "text/plain" })).status, 400);
  assert.equal((await handler(new Request(`${ORIGIN}/api/signup/confirm`))).status, 405);
  assert.equal((await handler(new Request(`${ORIGIN}/api/other`))).status, 404);
  assert.equal((await post("unknown", {})).status, 404);
  allow = false;
  const limited = await post("confirm", { token: tokenOf(sent[0]) });
  assert.equal(limited.status, 429);
  assert.equal(limited.headers.get("cache-control"), "no-store");
});
