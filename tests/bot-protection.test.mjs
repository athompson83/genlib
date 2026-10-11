// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import test from "node:test";
import { BotProtectionError } from "../.build/modules/bot-protection/files/crypto.js";
import { createCaptchaVerifier, mapProviderError, SITEVERIFY_URLS } from "../.build/modules/bot-protection/files/verify.js";
import { createPow, decodeSolution, encodeSolution, MAX_MAX_NUMBER, MIN_MAX_NUMBER, solveChallenge } from "../.build/modules/bot-protection/files/pow.js";
import { createHoneypot } from "../.build/modules/bot-protection/files/honeypot.js";
import { MemoryReplayStore } from "../.build/modules/bot-protection/files/memory-store.js";
import { createBotGuard } from "../.build/modules/bot-protection/files/guard.js";
import { createChallengeHandler, protect } from "../.build/modules/bot-protection/files/http.js";

const SECRET = "0x4AAAAAAA-super-secret-value-do-not-leak";
const NOW = Date.parse("2026-10-11T12:00:00Z");
const POW_KEY = "pow-key-".repeat(5);
const HONEY_KEY = "honeypot-key-".repeat(3);

/** Fake fetch that records calls and replies with `reply` (object -> JSON 200, function -> custom). */
function fakeFetch(reply) {
  const calls = [];
  const fetch = async (url, init) => {
    calls.push({ url, init, body: new URLSearchParams(init.body) });
    if (typeof reply === "function") return reply(url, init);
    return new Response(JSON.stringify(reply), { status: 200, headers: { "content-type": "application/json" } });
  };
  return { fetch, calls };
}
const ts = (msAgo) => new Date(NOW - msAgo).toISOString();
const good = { turnstile: { success: true, hostname: "example.com", action: "signup", challenge_ts: ts(10_000), "error-codes": [] },
  hcaptcha: { success: true, hostname: "example.com", challenge_ts: ts(10_000) },
  recaptcha: { success: true, hostname: "example.com", action: "signup", score: 0.9, challenge_ts: ts(10_000) } };

function verifier(provider, reply, extra = {}) {
  const { fetch, calls } = fakeFetch(reply);
  const v = createCaptchaVerifier({ provider, secret: SECRET, fetch, expectedHostnames: ["Example.com"], now: () => NOW,
    ...(provider === "hcaptcha" ? {} : { expectedAction: "signup" }), ...extra });
  return { v, calls };
}

for (const provider of ["turnstile", "hcaptcha", "recaptcha"]) {
  test(`${provider}: success posts form-encoded secret, response and remoteip to the documented endpoint`, async () => {
    const { v, calls } = verifier(provider, good[provider]);
    const result = await v.verify("token-abc", { remoteIp: "203.0.113.9", idempotencyKey: "7f1d2c1e-0000-4000-8000-000000000001" });
    assert.equal(result.ok, true);
    assert.deepEqual(result.reasons, []);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, SITEVERIFY_URLS[provider]);
    assert.equal(calls[0].init.method, "POST");
    assert.equal(calls[0].init.headers["content-type"], "application/x-www-form-urlencoded");
    assert.equal(calls[0].body.get("secret"), SECRET);
    assert.equal(calls[0].body.get("response"), "token-abc");
    assert.equal(calls[0].body.get("remoteip"), "203.0.113.9");
    assert.equal(calls[0].body.has("idempotency_key"), provider === "turnstile");
    assert.ok(!JSON.stringify(result).includes(SECRET));
  });

  test(`${provider}: wrong hostname, stale and future timestamps, and error codes are refused`, async () => {
    assert.deepEqual((await verifier(provider, { ...good[provider], hostname: "evil.test" }).v.verify("t")).reasons, ["hostname-mismatch"]);
    assert.deepEqual((await verifier(provider, { ...good[provider], hostname: undefined }).v.verify("t")).reasons, ["hostname-mismatch"]);
    assert.deepEqual((await verifier(provider, { ...good[provider], challenge_ts: ts(6 * 60_000) }).v.verify("t")).reasons, ["stale"]);
    assert.equal((await verifier(provider, { ...good[provider], challenge_ts: ts(6 * 60_000) }, { maxAgeMs: 10 * 60_000 }).v.verify("t")).ok, true);
    assert.deepEqual((await verifier(provider, { ...good[provider], challenge_ts: ts(-5 * 60_000) }).v.verify("t")).reasons, ["invalid-timestamp"]);
    assert.deepEqual((await verifier(provider, { ...good[provider], challenge_ts: "not a date" }).v.verify("t")).reasons, ["invalid-timestamp"]);
    const codes = await verifier(provider, { success: false, "error-codes": ["invalid-input-response", "timeout-or-duplicate", "invalid-input-secret", "something-new"] }).v.verify("t");
    assert.deepEqual(codes, { ok: false, reasons: ["invalid-token", "expired-or-duplicate", "invalid-secret", "provider-error"] });
    assert.deepEqual((await verifier(provider, { success: false }).v.verify("t")).reasons, ["rejected"]);
  });

  test(`${provider}: network failure is fail-closed by default and passes only with failOpen`, async () => {
    const down = () => { throw new TypeError(`fetch failed for secret=${SECRET}`); };
    const closed = await verifier(provider, down).v.verify("t");
    assert.deepEqual(closed, { ok: false, reasons: ["unavailable"] });
    const open = await verifier(provider, down, { failOpen: true }).v.verify("t");
    assert.deepEqual(open, { ok: true, failedOpen: true, reasons: ["unavailable"] });
    assert.ok(!JSON.stringify(open).includes(SECRET));
    for (const reply of [() => new Response("oops", { status: 502 }), () => new Response("<html>", { status: 200 }), () => new Response("{}", { status: 200 })]) {
      assert.deepEqual(await verifier(provider, reply).v.verify("t"), { ok: false, reasons: ["unavailable"] });
    }
  });
}

test("action mismatch for Turnstile and reCAPTCHA; hCaptcha refuses an expectedAction", async () => {
  assert.deepEqual((await verifier("turnstile", { ...good.turnstile, action: "login" }).v.verify("t")).reasons, ["action-mismatch"]);
  assert.deepEqual((await verifier("recaptcha", { ...good.recaptcha, action: undefined }).v.verify("t")).reasons, ["action-mismatch"]);
  assert.throws(() => createCaptchaVerifier({ provider: "hcaptcha", secret: SECRET, fetch: fakeFetch({}).fetch, expectedHostnames: ["a"], expectedAction: "x" }),
    (error) => error instanceof BotProtectionError && error.code === "invalid-config");
});

test("reCAPTCHA v3 low score is refused at the threshold; v2 replies without a score pass", async () => {
  assert.deepEqual((await verifier("recaptcha", { ...good.recaptcha, score: 0.3 }).v.verify("t")).reasons, ["low-score"]);
  assert.equal((await verifier("recaptcha", { ...good.recaptcha, score: 0.5 }).v.verify("t")).ok, true);
  assert.deepEqual((await verifier("recaptcha", { ...good.recaptcha, score: 0.6 }, { minScore: 0.7 }).v.verify("t")).reasons, ["low-score"]);
  const v2 = await verifier("recaptcha", { success: true, hostname: "example.com", challenge_ts: ts(1000) }, { expectedAction: undefined }).v.verify("t");
  assert.equal(v2.ok, true);
  // hCaptcha Enterprise scores mean risk, not humanity, so they are not compared to minScore.
  assert.equal((await verifier("hcaptcha", { ...good.hcaptcha, score: 0.1 }).v.verify("t")).ok, true);
});

test("missing or oversized tokens are refused without a network call", async () => {
  const { v, calls } = verifier("turnstile", good.turnstile);
  assert.deepEqual(await v.verify(""), { ok: false, reasons: ["missing-token"] });
  assert.deepEqual(await v.verify(undefined), { ok: false, reasons: ["missing-token"] });
  assert.deepEqual(await v.verify("x".repeat(5000)), { ok: false, reasons: ["invalid-token"] });
  assert.equal(calls.length, 0);
  assert.equal(mapProviderError("internal-error"), "unavailable");
  assert.equal(mapProviderError("__proto__"), "provider-error");
});

test("the secret never appears in thrown configuration errors", () => {
  const bad = [
    { provider: "nope", secret: SECRET, fetch() {}, expectedHostnames: ["a"] },
    { provider: "turnstile", secret: SECRET, fetch: "no", expectedHostnames: ["a"] },
    { provider: "turnstile", secret: SECRET, fetch() {}, expectedHostnames: [] },
    { provider: "recaptcha", secret: SECRET, fetch() {}, expectedHostnames: ["a"], minScore: 2 },
    { provider: "turnstile", secret: SECRET + "x".repeat(2000), fetch() {}, expectedHostnames: ["a"] },
  ];
  for (const options of bad) {
    assert.throws(() => createCaptchaVerifier(options), (error) => {
      assert.ok(error instanceof BotProtectionError);
      assert.ok(!error.message.includes(SECRET) && !String(error.stack).includes(SECRET));
      return true;
    });
  }
  assert.throws(() => createPow({ key: "short" }), (error) => error.code === "invalid-config" && !error.message.includes("short"));
});

function powSetup(extra = {}) {
  let now = NOW;
  const store = new MemoryReplayStore({ now: () => now });
  const pow = createPow({ key: POW_KEY, maxNumber: 2000, now: () => now, randomNumber: () => 1234, ...extra });
  return { pow, store, advance: (ms) => { now += ms; } };
}

test("PoW: issue, solve and verify; the challenge is signed and bound to the form and expiry", async () => {
  const { pow, store } = powSetup();
  const challenge = await pow.issue("signup");
  assert.equal(challenge.algorithm, "SHA-256");
  assert.equal(challenge.maxNumber, 2000);
  assert.equal(challenge.expires, NOW + 600_000);
  assert.match(challenge.salt, /^[0-9a-f]{32}\?form=signup&expires=\d+$/);
  assert.match(challenge.signature, /^[0-9a-f]{64}$/);
  const solved = await solveChallenge(challenge);
  assert.equal(solved.number, 1234);
  assert.deepEqual(decodeSolution(solved.payload).number, 1234);
  assert.deepEqual(await pow.verify(solved.payload, { formId: "signup", store }), { ok: true, reasons: [] });
  // The same solution as an object is also accepted (JSON bodies) – but it is now a replay.
  assert.deepEqual(await pow.verify(decodeSolution(solved.payload), { formId: "signup", store }), { ok: false, reasons: ["pow-replayed"] });
});

test("PoW: tampered signature, other form, expired, wrong number, malformed and missing are refused", async () => {
  const { pow, store, advance } = powSetup();
  const challenge = await pow.issue("signup");
  const solution = decodeSolution((await solveChallenge(challenge)).payload);
  const flip = (hex) => (hex[0] === "a" ? "b" : "a") + hex.slice(1);
  const check = (value, formId = "signup") => pow.verify(value, { formId, store });
  assert.deepEqual((await check({ ...solution, signature: flip(solution.signature) })).reasons, ["pow-signature"]);
  // Changing the salt's form or expiry breaks the hash; re-signing needs the server key.
  assert.deepEqual((await check({ ...solution, salt: solution.salt.replace("form=signup", "form=login") }, "login")).reasons, ["pow-mismatch"]);
  assert.deepEqual((await check(solution, "login")).reasons, ["pow-form"]);
  assert.deepEqual((await check({ ...solution, number: solution.number + 1 })).reasons, ["pow-mismatch"]);
  const otherKey = createPow({ key: "another-key-".repeat(4), maxNumber: 1000 });
  assert.deepEqual((await otherKey.verify(solution, { formId: "signup", store })).reasons, ["pow-signature"]);
  for (const bad of [{ ...solution, algorithm: "SHA-1" }, { ...solution, number: -1 }, { ...solution, number: 1.5 }, "%%%", "e30=", { ...solution, salt: "x" }]) {
    assert.deepEqual((await check(bad)).reasons, ["pow-malformed"]);
  }
  assert.deepEqual((await check(undefined)).reasons, ["pow-missing"]);
  assert.deepEqual((await check("")).reasons, ["pow-missing"]);
  // None of the failures above consumed the challenge.
  assert.equal(store.size, 0);
  advance(600_001);
  assert.deepEqual((await check(solution)).reasons, ["pow-expired"]);
});

test("PoW: concurrent replays of one solution succeed exactly once", async () => {
  const { pow, store } = powSetup();
  const solved = await solveChallenge(await pow.issue("contact"));
  const results = await Promise.all(Array.from({ length: 10 }, () => pow.verify(solved.payload, { formId: "contact", store })));
  assert.equal(results.filter((r) => r.ok).length, 1);
  assert.ok(results.filter((r) => !r.ok).every((r) => r.reasons[0] === "pow-replayed"));
});

test("PoW: difficulty bounds, real random numbers and solver abort", async () => {
  for (const maxNumber of [MIN_MAX_NUMBER - 1, MAX_MAX_NUMBER + 1, 1.5, Number.NaN]) {
    assert.throws(() => createPow({ key: POW_KEY, maxNumber }), (e) => e instanceof BotProtectionError && e.code === "invalid-config");
  }
  assert.equal(createPow({ key: POW_KEY }).maxNumber, 50_000);
  assert.equal(createPow({ key: POW_KEY, maxNumber: MIN_MAX_NUMBER }).maxNumber, 1000);
  assert.equal(createPow({ key: POW_KEY, maxNumber: MAX_MAX_NUMBER }).maxNumber, 10_000_000);
  assert.throws(() => createPow({ key: POW_KEY, ttlMs: 10 }), (e) => e.code === "invalid-config");
  const pow = createPow({ key: POW_KEY, maxNumber: 1000 });
  const store = new MemoryReplayStore();
  const solved = await solveChallenge(await pow.issue("signup"));
  assert.ok(solved.number >= 0 && solved.number <= 1000);
  assert.equal((await pow.verify(solved.payload, { formId: "signup", store })).ok, true);
  await assert.rejects(pow.issue("bad form!"), (e) => e.code === "invalid-form");
  const controller = new AbortController();
  controller.abort();
  assert.equal(await solveChallenge(await pow.issue("signup"), { signal: controller.signal }), null);
  assert.equal(encodeSolution({ algorithm: "SHA-256", challenge: "a", salt: "b", number: 1, signature: "c" }).length > 0, true);
});

test("MemoryReplayStore refuses repeats until expiry and fails closed when full", async () => {
  let now = 0;
  const store = new MemoryReplayStore({ now: () => now, maxEntries: 2 });
  assert.equal(await store.consume("a", 100), true);
  assert.equal(await store.consume("a", 100), false);
  assert.equal(await store.consume("b", 50), true);
  assert.equal(await store.consume("c", 100), false);
  now = 60;
  assert.equal(await store.consume("c", 100), true);
  assert.equal(await store.consume("d", 10), false);
});

function honeypotSetup(extra = {}) {
  let now = NOW;
  const honeypot = createHoneypot({ key: HONEY_KEY, now: () => now, ...extra });
  return { honeypot, advance: (ms) => { now += ms; } };
}

test("honeypot: a filled hidden field and a too-fast submission are bots; a normal fill passes", async () => {
  const { honeypot, advance } = honeypotSetup();
  const { token, fieldName, tokenField } = await honeypot.issue("signup");
  assert.equal(fieldName, "website");
  assert.equal(tokenField, "form_ts");
  advance(1000);
  assert.deepEqual(await honeypot.check({ form_ts: token, website: "" }, "signup"), { ok: false, reasons: ["too-fast"] });
  advance(2500);
  assert.deepEqual(await honeypot.check({ form_ts: token, website: "http://spam.test" }, "signup"), { ok: false, reasons: ["honeypot-filled"] });
  assert.deepEqual(await honeypot.check({ form_ts: token, website: "" }, "signup"), { ok: true, reasons: [] });
  assert.deepEqual(await honeypot.check({ form_ts: token }, "login"), { ok: false, reasons: ["form-token-invalid"] });
  const [issuedAt, mac] = token.split(".");
  assert.deepEqual(await honeypot.check({ form_ts: `${Number(issuedAt) - 60_000}.${mac}` }, "signup"), { ok: false, reasons: ["form-token-invalid"] });
  assert.deepEqual(await honeypot.check({ form_ts: "nonsense" }, "signup"), { ok: false, reasons: ["form-token-invalid"] });
  assert.deepEqual(await honeypot.check({}, "signup"), { ok: false, reasons: ["form-token-missing"] });
  advance(86_400_000);
  assert.deepEqual(await honeypot.check({ form_ts: token }, "signup"), { ok: false, reasons: ["form-token-expired"] });
  assert.throws(() => createHoneypot({ key: HONEY_KEY, fieldName: "a", tokenField: "a" }), (e) => e.code === "invalid-config");
});

function guardSetup({ captchaReply = good.turnstile } = {}) {
  let now = NOW;
  const store = new MemoryReplayStore({ now: () => now });
  const pow = createPow({ key: POW_KEY, maxNumber: 1000, now: () => now, randomNumber: () => 7 });
  const honeypot = createHoneypot({ key: HONEY_KEY, now: () => now });
  const { fetch, calls } = fakeFetch(captchaReply);
  const verifier = createCaptchaVerifier({ provider: "turnstile", secret: SECRET, fetch, expectedHostnames: ["example.com"], now: () => now });
  const guard = createBotGuard({ formId: "signup", store, provider: verifier, pow, honeypot, clientIp: () => "198.51.100.4" });
  const fields = async () => {
    const solved = await solveChallenge(await pow.issue("signup"));
    const { token } = await honeypot.issue("signup");
    return { email: "a@example.com", website: "", form_ts: token, pow: solved.payload, "cf-turnstile-response": "tok" };
  };
  return { guard, pow, calls, fields, advance: (ms) => { now += ms; } };
}

test("createBotGuard runs honeypot, PoW and captcha in order and stops at the first failure", async () => {
  const { guard, calls, fields, advance } = guardSetup();
  const ok = await fields();
  advance(5000);
  const request = new Request("https://example.com/signup", { method: "POST" });
  assert.deepEqual(await guard.check(request, ok), { ok: true, reasons: [] });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].body.get("remoteip"), "198.51.100.4");
  assert.deepEqual(await guard.check(request, ok), { ok: false, reasons: ["pow:pow-replayed"] });
  const trapped = await guard.check(request, { ...(await fields()), website: "x" });
  assert.deepEqual(trapped, { ok: false, reasons: ["honeypot:honeypot-filled"] });
  assert.equal(calls.length, 1, "honeypot failure makes no siteverify call");
  assert.throws(() => createBotGuard({ formId: "signup", store: new MemoryReplayStore() }), TypeError);
});

test("protect(): passes good submissions, hides the failing check and handles each body type and the limit", async () => {
  const { guard, fields, advance } = guardSetup();
  const rejected = [];
  let seenBody = null;
  const handler = async (request) => { seenBody = await request.text(); return new Response("created", { status: 201 }); };
  const wrapped = protect(handler, guard, { maxBodyBytes: 4096, onReject: (result) => { rejected.push(result.reasons); } });
  const post = (body, type) => wrapped(new Request("https://example.com/signup", { method: "POST", headers: type ? { "content-type": type } : {}, body }));

  const urlencoded = new URLSearchParams(await fields()).toString();
  advance(5000);
  let response = await post(urlencoded, "application/x-www-form-urlencoded");
  assert.equal(response.status, 201);
  assert.equal(seenBody, urlencoded, "the handler still reads the original body");

  const multipart = new FormData();
  for (const [name, value] of Object.entries(await fields())) multipart.set(name, value);
  multipart.set("avatar", new File(["png"], "me.png", { type: "image/png" }));
  advance(5000);
  const encoded = new Request("https://example.com/signup", { method: "POST", body: multipart });
  response = await wrapped(encoded);
  assert.equal(response.status, 201);

  advance(5000);
  const jsonFields = await fields();
  advance(5000);
  assert.equal((await post(JSON.stringify(jsonFields), "application/json; charset=utf-8")).status, 201);

  // Honeypot, PoW replay and too-fast all look identical to the client.
  const trap = { ...(await fields()), website: "spam" };
  advance(5000);
  for (const body of [JSON.stringify(trap), JSON.stringify(jsonFields)]) {
    response = await post(body, "application/json");
    assert.equal(response.status, 403);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.deepEqual(await response.json(), { error: "bot-check-failed" });
  }
  assert.deepEqual(rejected, [["honeypot:honeypot-filled"], ["pow:pow-replayed"]]);

  assert.equal((await post("x".repeat(5000), "application/x-www-form-urlencoded")).status, 413);
  const streamed = new ReadableStream({ start(c) { for (let i = 0; i < 10; i++) c.enqueue(new Uint8Array(1000)); c.close(); } });
  assert.equal((await wrapped(new Request("https://example.com/signup", { method: "POST", headers: { "content-type": "application/json" }, body: streamed, duplex: "half" }))).status, 413);
  assert.equal((await post("{not json", "application/json")).status, 400);
  assert.equal((await post("[1]", "application/json")).status, 400);
  assert.equal((await post("hello", "text/plain")).status, 415);
  assert.equal((await wrapped(new Request("https://example.com/signup"))).status, 201, "GET passes through");
});

test("protect(): a captcha provider outage is refused by default", async () => {
  const { guard, fields, advance } = guardSetup({ captchaReply: () => { throw new Error("ECONNRESET"); } });
  const wrapped = protect(() => new Response("ok"), guard);
  const body = JSON.stringify(await fields());
  advance(5000);
  const response = await wrapped(new Request("https://example.com/signup", { method: "POST", headers: { "content-type": "application/json" }, body }));
  assert.equal(response.status, 403);
  assert.deepEqual(await response.json(), { error: "bot-check-failed" });
});

test("challenge route issues a no-store PoW challenge for allowed forms only", async () => {
  const { pow } = powSetup();
  const handler = createChallengeHandler({ pow, prefix: "/api/bot/", forms: ["signup", "login"] });
  const response = await handler(new Request("https://example.com/api/bot/challenge?form=signup"));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  const challenge = await response.json();
  assert.match(challenge.salt, /form=signup/);
  assert.equal((await handler(new Request("https://example.com/api/bot/challenge?form=admin"))).status, 400);
  assert.equal((await handler(new Request("https://example.com/api/bot/challenge"))).status, 400);
  assert.equal((await handler(new Request("https://example.com/api/bot/challenge?form=signup", { method: "POST" }))).status, 405);
  assert.equal((await handler(new Request("https://example.com/api/bot/other"))).status, 404);
});
