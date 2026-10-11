// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import test from "node:test";
import { createPasswordReset, hashToken, PasswordResetError, constantTimeEqual } from "../.build/modules/password-reset/files/core.js";
import { MemoryPasswordResetStore } from "../.build/modules/password-reset/files/memory-store.js";
import { createPasswordResetHandler } from "../.build/modules/password-reset/files/http.js";

const MINUTE = 60_000;
const ORIGIN = "https://app.example.com";

function fakeUsers(initial = [{ id: "u1", email: "Ann@example.com" }]) {
  const accounts = new Map(initial.map((user) => [user.id, { ...user }]));
  const hashes = new Map();
  return {
    accounts, hashes,
    async findByEmail(email) {
      for (const user of accounts.values()) if (user.email === email) return { ...user };
      return null;
    },
    async setPasswordHash(userId, hash) { hashes.set(userId, hash); },
  };
}

function setup(extra = {}) {
  let now = 1_000_000;
  let counter = 0;
  let bytes = 0;
  const store = extra.store ?? new MemoryPasswordResetStore();
  const users = extra.users ?? fakeUsers();
  const sent = [];
  const revoked = [];
  const reset = createPasswordReset({
    store, users, baseUrl: "https://app.example.com/reset-password",
    sendEmail: async (message) => { sent.push(message); },
    hashPassword: async (password) => `hashed:${password}`,
    passwordPolicy: (password) => (password.length < 12 ? ["too-short"] : []),
    revokeSessions: async (userId) => { revoked.push(userId); },
    now: () => now, newId: () => `t${++counter}`,
    // Distinct deterministic bytes per call.
    randomBytes: (length) => { bytes++; return Uint8Array.from({ length }, (_, i) => (i * 7 + bytes * 13) & 255); },
    ...extra.options,
  });
  const tokenOf = (message) => new URL(message.link).searchParams.get("token");
  return { store, users, sent, revoked, reset, tokenOf, advance: (ms) => { now += ms; } };
}
const code = (expected) => (error) => error instanceof PasswordResetError && error.code === expected;

test("request is enumeration-safe: identical result; unknown users get no email and no token", async () => {
  const { reset, sent, store } = setup();
  const known = await reset.request("  Ann@EXAMPLE.com ");
  const unknown = await reset.request("nobody@example.com");
  assert.deepEqual(known, { ok: true });
  assert.deepEqual(unknown, known);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].to, "Ann@example.com");
  assert.equal(store.dump().length, 1);
  assert.equal(store.dump()[0].userId, "u1");
  // Malformed input also resolves ok, with a server-only note.
  assert.deepEqual(await reset.request("not an email"), { ok: true, serverError: "invalid-email" });
});

test("only the SHA-256 hash is stored and the link carries a 43-character token", async () => {
  const { reset, sent, store, tokenOf } = setup();
  await reset.request("Ann@example.com");
  const token = tokenOf(sent[0]);
  assert.match(token, /^[A-Za-z0-9_-]{43}$/);
  assert.ok(sent[0].link.startsWith("https://app.example.com/reset-password?token="));
  const rows = store.dump();
  assert.equal(rows[0].tokenHash, await hashToken(token));
  assert.ok(!JSON.stringify(rows).includes(token), "raw token never stored");
  assert.equal(constantTimeEqual("abc", "abc"), true);
  assert.equal(constantTimeEqual("abc", "abd"), false);
});

test("verify does not consume; complete sets the hash once, revokes others and sessions", async () => {
  const { reset, sent, users, revoked, store, tokenOf, advance } = setup();
  await reset.request("Ann@example.com");
  advance(1000);
  await reset.request("Ann@example.com");
  const [first, second] = sent.map(tokenOf);
  const check = await reset.verify(second);
  assert.equal(check.valid, true);
  assert.equal(check.expiresAt, 1_001_000 + 30 * MINUTE);
  assert.equal((await reset.verify(second)).valid, true, "verify twice still valid");
  assert.deepEqual(await reset.complete(second, "correct horse battery"), { userId: "u1" });
  assert.equal(users.hashes.get("u1"), "hashed:correct horse battery");
  assert.deepEqual(revoked, ["u1"]);
  await assert.rejects(reset.complete(second, "correct horse battery"), code("invalid-token"));
  // The other pending link was revoked by the successful reset.
  assert.deepEqual(await reset.verify(first), { valid: false });
  await assert.rejects(reset.complete(first, "another long password"), code("invalid-token"));
  assert.ok(store.dump().find((row) => row.id === "t1").revokedAt !== undefined);
});

test("expired, unknown, malformed, used and revoked tokens are indistinguishable", async () => {
  const { reset, sent, tokenOf, advance } = setup();
  await reset.request("Ann@example.com");
  const token = tokenOf(sent[0]);
  advance(30 * MINUTE);
  assert.deepEqual(await reset.verify(token), { valid: false });
  const errors = [];
  for (const candidate of [token, "A".repeat(43), "short", 42]) {
    errors.push(await reset.complete(candidate, "a long enough password").catch((error) => [error.code, error.message]));
  }
  assert.equal(new Set(errors.map((item) => JSON.stringify(item))).size, 1);
  assert.equal(errors[0][0], "invalid-token");
});

test("concurrent completes: exactly one wins", async () => {
  const { reset, sent, tokenOf, users } = setup();
  await reset.request("Ann@example.com");
  const token = tokenOf(sent[0]);
  const results = await Promise.allSettled([1, 2, 3, 4].map((n) => reset.complete(token, `password number ${n}!`)));
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  assert.ok(results.filter((r) => r.status === "rejected").every((r) => r.reason.code === "invalid-token"));
  assert.ok(users.hashes.get("u1").startsWith("hashed:password number"));
});

test("a weak password is refused with problems and does not consume the token", async () => {
  const { reset, sent, tokenOf, users } = setup();
  await reset.request("Ann@example.com");
  const token = tokenOf(sent[0]);
  await assert.rejects(reset.complete(token, "short"), (error) => code("weak-password")(error) && error.problems.includes("too-short"));
  await assert.rejects(reset.complete(token, ""), code("weak-password"));
  assert.equal(users.hashes.size, 0);
  assert.equal((await reset.verify(token)).valid, true);
  await reset.complete(token, "now a long password");
  assert.equal(users.hashes.get("u1"), "hashed:now a long password");
});

test("maxActivePerUser caps valid links; older ones are revoked", async () => {
  const { reset, sent, tokenOf, advance } = setup({ options: { maxActivePerUser: 2 } });
  for (let i = 0; i < 4; i++) { await reset.request("Ann@example.com"); advance(1000); }
  const results = await Promise.all(sent.map(tokenOf).map((token) => reset.verify(token)));
  assert.deepEqual(results.map((r) => r.valid), [false, false, true, true]);
});

test("a link dies when the account email changes after the request", async () => {
  const { reset, sent, tokenOf, users } = setup();
  await reset.request("Ann@example.com");
  const token = tokenOf(sent[0]);
  users.accounts.get("u1").email = "ann.new@example.com";
  assert.deepEqual(await reset.verify(token), { valid: false });
  // Even if the old address is later taken by someone else, the link stays dead.
  users.accounts.set("u2", { id: "u2", email: "Ann@example.com" });
  await assert.rejects(reset.complete(token, "a long enough password"), code("invalid-token"));
  assert.equal(users.hashes.size, 0);
});

test("email delivery failure revokes the token and is reported server-side only", async () => {
  const store = new MemoryPasswordResetStore();
  const { reset } = setup({ store, options: { sendEmail: async () => { throw new Error("smtp down"); } } });
  assert.deepEqual(await reset.request("Ann@example.com"), { ok: true, serverError: "delivery-failed" });
  const [row] = store.dump();
  assert.ok(row.revokedAt !== undefined);
});

test("configuration is validated", () => {
  const base = { store: new MemoryPasswordResetStore(), users: fakeUsers(), sendEmail: async () => {}, hashPassword: async (p) => p };
  assert.throws(() => createPasswordReset({ ...base, baseUrl: "http://evil.example/reset" }), RangeError);
  assert.throws(() => createPasswordReset({ ...base, baseUrl: "https://a.example/reset?x=1" }), RangeError);
  assert.throws(() => createPasswordReset({ ...base, baseUrl: "https://a.example/reset", ttlMs: 1000 }), RangeError);
  assert.throws(() => createPasswordReset({ ...base, baseUrl: "https://a.example/reset", maxActivePerUser: 0 }), RangeError);
  assert.ok(createPasswordReset({ ...base, baseUrl: "http://localhost:3000/reset" }));
});

// HTTP adapter

function http(extra = {}, setupExtra = {}) {
  const context = setup(setupExtra);
  const results = [];
  const handler = createPasswordResetHandler({
    reset: context.reset, prefix: "/api/password-reset", allowedOrigins: [ORIGIN],
    clientIp: () => "203.0.113.9", onRequestResult: (result) => results.push(result), ...extra,
  });
  const post = (path, body, headers = {}) => handler(new Request(`${ORIGIN}/api/password-reset/${path}`, {
    method: "POST", headers: { "content-type": "application/json", origin: ORIGIN, ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  }));
  const get = (path) => handler(new Request(`${ORIGIN}/api/password-reset/${path}`));
  return { ...context, handler, results, post, get };
}

function assertHeaders(response) {
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(response.headers.get("referrer-policy"), "no-referrer");
}

test("HTTP request: always 202 with the same body for known, unknown, malformed and failed delivery", async () => {
  const { post, results, sent } = http();
  const bodies = [];
  for (const email of ["Ann@example.com", "nobody@example.com", "garbage"]) {
    const response = await post("request", { email });
    assert.equal(response.status, 202);
    assertHeaders(response);
    bodies.push(await response.text());
  }
  assert.equal(new Set(bodies).size, 1);
  assert.deepEqual(JSON.parse(bodies[0]), { ok: true });
  assert.equal(sent.length, 1);
  assert.equal(results[2].serverError, "invalid-email");

  const failing = http({}, { options: { sendEmail: async () => { throw new Error("down"); } } });
  const response = await failing.post("request", { email: "Ann@example.com" });
  assert.equal(response.status, 202);
  assert.equal(await response.text(), bodies[0], "delivery failure is never exposed");
  assert.equal(failing.results[0].serverError, "delivery-failed");
});

test("HTTP verify and complete: statuses, problems and headers", async () => {
  const { post, get, sent, tokenOf } = http();
  await post("request", { email: "Ann@example.com" });
  const token = tokenOf(sent[0]);
  let response = await get(`verify?token=${token}`);
  assert.equal(response.status, 200);
  assertHeaders(response);
  assert.equal((await response.json()).valid, true);
  response = await get("verify?token=nope");
  assert.deepEqual(await response.json(), { valid: false });

  response = await post("complete", { token, password: "short" });
  assert.equal(response.status, 400);
  assertHeaders(response);
  const weak = await response.json();
  assert.equal(weak.error, "weak-password");
  assert.deepEqual(weak.problems, ["too-short"]);

  response = await post("complete", { token, password: "a long enough password" });
  assert.equal(response.status, 204);
  assertHeaders(response);
  response = await post("complete", { token, password: "a long enough password" });
  assert.equal(response.status, 400);
  assert.equal((await response.json()).error, "invalid-token");
});

test("HTTP: origin check, rate limit 429, bounded body, bad JSON and unknown routes", async () => {
  const keys = [];
  const blocked = new Set(["email:ann@example.com"]);
  const { post, get, handler, sent } = http({ rateLimit: async (key) => { keys.push(key); return !blocked.has(key); } });
  let response = await post("request", { email: "Ann@example.com" }, { origin: "https://evil.example" });
  assert.equal(response.status, 403);
  assertHeaders(response);
  response = await post("request", { email: "ANN@Example.com" });
  assert.equal(response.status, 429);
  assertHeaders(response);
  assert.deepEqual(keys, ["ip:203.0.113.9", "email:ann@example.com"]);
  assert.equal(sent.length, 0);
  blocked.add("ip:203.0.113.9");
  response = await post("complete", { token: "x", password: "y" });
  assert.equal(response.status, 429);

  const open = http();
  response = await open.post("request", JSON.stringify({ email: "a".repeat(5000) + "@example.com" }));
  assert.equal(response.status, 400);
  assert.equal((await response.json()).error, "bad-request");
  response = await open.post("request", "{not json");
  assert.equal((await response.json()).error, "invalid-json");
  response = await open.post("request", { email: "Ann@example.com" }, { "content-type": "text/plain" });
  assert.equal(response.status, 400);
  response = await open.get("complete");
  assert.equal(response.status, 405);
  response = await handler(new Request(`${ORIGIN}/elsewhere`));
  assert.equal(response.status, 404);
});
