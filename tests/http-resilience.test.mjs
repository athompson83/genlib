// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import test from "node:test";
import { backoffDelay, retry, withTimeout } from "../.build/modules/http-resilience/files/retry.js";
import { fetchWithRetry, parseRetryAfter, isRetryableRequest } from "../.build/modules/http-resilience/files/fetch-retry.js";
import { createCircuitBreaker, CircuitOpenError } from "../.build/modules/http-resilience/files/circuit-breaker.js";

/** Records requested waits and resolves immediately. */
function recordingSleep() {
  const waits = [];
  return { waits, sleep: async ms => { waits.push(ms); } };
}

/** Fake Fetch boundary: returns queued results and records what was sent. */
function fakeFetch(results) {
  const calls = [];
  return {
    calls,
    fetch: async (input, init) => {
      calls.push({ input, init });
      assert.ok(results.length, "unexpected extra request");
      const next = results.shift();
      if (next instanceof Error) throw next;
      return typeof next === "function" ? next() : next;
    },
  };
}

test("retry uses exponential backoff capped by maxDelayMs without jitter", async () => {
  const { waits, sleep } = recordingSleep();
  let calls = 0;
  await assert.rejects(retry(async () => { calls += 1; throw new Error("boom"); },
    { attempts: 6, baseDelayMs: 100, maxDelayMs: 1000, jitter: "none", sleep }), /boom/);
  assert.equal(calls, 6);
  assert.deepEqual(waits, [100, 200, 400, 800, 1000]);
});

test("retry returns the first success and passes attempt numbers", async () => {
  const { sleep } = recordingSleep();
  const seen = [];
  const value = await retry(async attempt => { seen.push(attempt); if (attempt < 3) throw new Error("x"); return "ok"; },
    { attempts: 5, baseDelayMs: 1, maxDelayMs: 1, sleep });
  assert.equal(value, "ok");
  assert.deepEqual(seen, [1, 2, 3]);
});

test("full jitter stays within [0, cap)", async () => {
  const opts = { baseDelayMs: 100, maxDelayMs: 1000, jitter: "full" };
  for (const r of [0, 0.25, 0.5, 0.999999]) {
    for (let retryNo = 1; retryNo <= 6; retryNo += 1) {
      const cap = Math.min(1000, 100 * 2 ** (retryNo - 1));
      const d = backoffDelay(retryNo, { ...opts, random: () => r });
      assert.ok(d >= 0 && d < cap, `delay ${d} outside [0, ${cap})`);
      assert.equal(d, Math.floor(r * cap));
    }
  }
  assert.equal(backoffDelay(1, { ...opts, random: () => 1 }) < 100, true, "random()=1 is clamped");
  const { waits, sleep } = recordingSleep();
  await assert.rejects(retry(async () => { throw new Error("x"); },
    { attempts: 3, baseDelayMs: 100, maxDelayMs: 1000, random: () => 0.5, sleep }));
  assert.deepEqual(waits, [50, 100]);
});

test("shouldRetry false stops; delay override is capped", async () => {
  const { waits, sleep } = recordingSleep();
  let calls = 0;
  await assert.rejects(retry(async () => { calls += 1; throw new Error("fatal"); },
    { attempts: 5, baseDelayMs: 1, maxDelayMs: 10, sleep, shouldRetry: () => false }), /fatal/);
  assert.equal(calls, 1);
  calls = 0;
  await assert.rejects(retry(async () => { calls += 1; throw new Error("x"); },
    { attempts: 2, baseDelayMs: 1, maxDelayMs: 10, sleep, shouldRetry: () => ({ delayMs: 99999 }) }));
  assert.deepEqual(waits, [10]);
});

test("abort during a wait stops immediately with no further attempts", async () => {
  const controller = new AbortController();
  let calls = 0;
  const neverSleep = () => new Promise(() => {}); // ignores its signal on purpose
  const pending = retry(async () => { calls += 1; throw new Error("fail"); },
    { attempts: 5, baseDelayMs: 1000, maxDelayMs: 1000, signal: controller.signal, sleep: neverSleep });
  await new Promise(resolve => setImmediate(resolve));
  controller.abort(new Error("stop"));
  await assert.rejects(pending, /stop/);
  assert.equal(calls, 1);
  await assert.rejects(retry(async () => { calls += 1; return 1; },
    { attempts: 2, baseDelayMs: 1, maxDelayMs: 1, signal: controller.signal }), /stop/);
  assert.equal(calls, 1, "pre-aborted signal prevents the first attempt");
});

test("retry validates options", async () => {
  await assert.rejects(retry(async () => 1, { attempts: 0, baseDelayMs: 1, maxDelayMs: 1 }), RangeError);
  await assert.rejects(retry(async () => 1, { attempts: 2, baseDelayMs: 10, maxDelayMs: 1 }), RangeError);
});

test("withTimeout rejects with TimeoutError and aborts the inner signal", async () => {
  let inner;
  await assert.rejects(withTimeout(signal => { inner = signal; return new Promise(() => {}); }, 20),
    error => error.name === "TimeoutError");
  assert.equal(inner.aborted, true);
  assert.equal(await withTimeout(async () => "fast", 1000), "fast");
});

test("withTimeout follows a parent signal and keeps its reason", async () => {
  const parent = new AbortController();
  const pending = withTimeout(() => new Promise(() => {}), 10_000, parent.signal);
  parent.abort(new Error("parent-cancel"));
  await assert.rejects(pending, /parent-cancel/);
});

test("Retry-After parses delta-seconds and HTTP dates", () => {
  const now = Date.parse("Wed, 21 Oct 2026 07:28:00 GMT");
  assert.equal(parseRetryAfter("120", now), 120_000);
  assert.equal(parseRetryAfter(" 0 ", now), 0);
  assert.equal(parseRetryAfter("Wed, 21 Oct 2026 07:28:30 GMT", now), 30_000);
  assert.equal(parseRetryAfter("Wed, 21 Oct 2026 07:00:00 GMT", now), 0, "past dates mean no wait");
  for (const bad of [null, "", "-5", "1.5", "soon", "2026-10-21T07:28:30Z"]) assert.equal(parseRetryAfter(bad, now), undefined);
});

test("fetchWithRetry retries GET on retryable statuses with backoff", async () => {
  const { waits, sleep } = recordingSleep();
  const { calls, fetch } = fakeFetch([new Response("a", { status: 503 }), new Response("b", { status: 502 }), new Response("ok")]);
  const res = await fetchWithRetry(fetch, "https://api.example.test/x", undefined,
    { attempts: 4, baseDelayMs: 100, maxDelayMs: 1000, jitter: "none", sleep });
  assert.equal(await res.text(), "ok");
  assert.equal(calls.length, 3);
  assert.deepEqual(waits, [100, 200]);
});

test("fetchWithRetry returns the last retryable response when attempts run out; 4xx not retried", async () => {
  const { sleep } = recordingSleep();
  let f = fakeFetch([new Response(null, { status: 500 }), new Response(null, { status: 500 })]);
  assert.equal((await fetchWithRetry(f.fetch, "https://x.test", undefined, { attempts: 2, baseDelayMs: 1, maxDelayMs: 1, sleep })).status, 500);
  f = fakeFetch([new Response(null, { status: 404 })]);
  assert.equal((await fetchWithRetry(f.fetch, "https://x.test", undefined, { attempts: 5, baseDelayMs: 1, maxDelayMs: 1, sleep })).status, 404);
  assert.equal(f.calls.length, 1);
});

test("non-idempotent POST is sent once, even on 503 or network error", async () => {
  const { sleep } = recordingSleep();
  let f = fakeFetch([new Response(null, { status: 503 })]);
  const res = await fetchWithRetry(f.fetch, "https://x.test", { method: "POST", body: "{}" }, { attempts: 5, baseDelayMs: 1, maxDelayMs: 1, sleep });
  assert.equal(res.status, 503);
  assert.equal(f.calls.length, 1);
  f = fakeFetch([new TypeError("fetch failed")]);
  await assert.rejects(fetchWithRetry(f.fetch, "https://x.test", { method: "PATCH", body: "{}" }, { attempts: 5, baseDelayMs: 1, maxDelayMs: 1, sleep }), TypeError);
  assert.equal(f.calls.length, 1);
  assert.equal(isRetryableRequest("https://x.test", { method: "post" }), false);
});

test("POST with Idempotency-Key is retried on network errors and 429", async () => {
  const { sleep } = recordingSleep();
  const init = { method: "POST", body: "{}", headers: { "Idempotency-Key": "order-1:v1" } };
  const f = fakeFetch([new TypeError("fetch failed"), new Response(null, { status: 429 }), new Response("done", { status: 201 })]);
  const res = await fetchWithRetry(f.fetch, "https://x.test", init, { attempts: 3, baseDelayMs: 1, maxDelayMs: 1, sleep });
  assert.equal(res.status, 201);
  assert.equal(f.calls.length, 3);
  for (const call of f.calls) assert.equal(new Headers(call.init.headers).get("idempotency-key"), "order-1:v1");
  assert.equal(isRetryableRequest(new Request("https://x.test", { method: "POST", headers: { "Idempotency-Key": "k" } })), true);
});

test("Request input with a body is cloned for each attempt", async () => {
  const { sleep } = recordingSleep();
  const bodies = [];
  const fetch = async input => { bodies.push(await input.text()); return new Response(null, { status: bodies.length < 2 ? 503 : 200 }); };
  const req = new Request("https://x.test", { method: "PUT", body: "payload" });
  const res = await fetchWithRetry(fetch, req, undefined, { attempts: 3, baseDelayMs: 1, maxDelayMs: 1, sleep });
  assert.equal(res.status, 200);
  assert.deepEqual(bodies, ["payload", "payload"]);
});

test("stream request bodies are never replayed", async () => {
  const { sleep } = recordingSleep();
  const f = fakeFetch([new Response(null, { status: 503 })]);
  const body = new ReadableStream({ start(c) { c.enqueue(new TextEncoder().encode("x")); c.close(); } });
  const res = await fetchWithRetry(f.fetch, "https://x.test", { method: "PUT", body, duplex: "half" }, { attempts: 3, baseDelayMs: 1, maxDelayMs: 1, sleep });
  assert.equal(res.status, 503);
  assert.equal(f.calls.length, 1);
});

test("Retry-After seconds and dates are honored and capped by maxDelayMs", async () => {
  const { waits, sleep } = recordingSleep();
  const now = Date.parse("Wed, 21 Oct 2026 07:28:00 GMT");
  const f = fakeFetch([
    new Response(null, { status: 429, headers: { "Retry-After": "2" } }),
    new Response(null, { status: 503, headers: { "Retry-After": "Wed, 21 Oct 2026 07:28:03 GMT" } }),
    new Response(null, { status: 503, headers: { "Retry-After": "3600" } }),
    new Response(null, { status: 503, headers: { "Retry-After": "garbage" } }),
    new Response("ok"),
  ]);
  const res = await fetchWithRetry(f.fetch, "https://x.test", undefined,
    { attempts: 5, baseDelayMs: 100, maxDelayMs: 5000, jitter: "none", sleep, now: () => now });
  assert.equal(res.status, 200);
  assert.deepEqual(waits, [2000, 3000, 5000, 800]);
});

test("unused response bodies are cancelled before retrying", async () => {
  const { sleep } = recordingSleep();
  let cancelled = 0;
  const streaming = () => new Response(new ReadableStream({ pull() {}, cancel() { cancelled += 1; } }), { status: 503 });
  const f = fakeFetch([streaming, streaming, new Response("ok")]);
  await fetchWithRetry(f.fetch, "https://x.test", undefined, { attempts: 3, baseDelayMs: 1, maxDelayMs: 1, sleep });
  assert.equal(cancelled, 2);
});

test("abort during a fetch retry wait stops with no further requests", async () => {
  const controller = new AbortController();
  const f = fakeFetch([new Response(null, { status: 503 })]);
  const pending = fetchWithRetry(f.fetch, "https://x.test", { signal: controller.signal },
    { attempts: 5, baseDelayMs: 60_000, maxDelayMs: 60_000, jitter: "none" });
  await new Promise(resolve => setTimeout(resolve, 5));
  controller.abort(new Error("user-cancel"));
  await assert.rejects(pending, /user-cancel/);
  assert.equal(f.calls.length, 1);
});

test("attemptTimeoutMs times out a hung attempt and retries it", async () => {
  const { sleep } = recordingSleep();
  let calls = 0;
  const fetch = (_input, init) => {
    calls += 1;
    if (calls === 1) return new Promise((_, reject) => init.signal.addEventListener("abort", () => reject(init.signal.reason)));
    return Promise.resolve(new Response("ok"));
  };
  const res = await fetchWithRetry(fetch, "https://x.test", undefined, { attempts: 2, attemptTimeoutMs: 20, baseDelayMs: 1, maxDelayMs: 1, sleep });
  assert.equal(await res.text(), "ok");
  assert.equal(calls, 2);
});

test("circuit breaker transitions closed -> open -> half-open -> closed/open", async () => {
  let now = 1_000;
  const breaker = createCircuitBreaker({ failureThreshold: 2, resetAfterMs: 500, clock: () => now });
  const failing = () => breaker.execute(async () => { throw new Error("down"); });
  assert.equal(breaker.state(), "closed");
  await assert.rejects(failing(), /down/);
  assert.equal(breaker.state(), "closed");
  assert.equal(await breaker.execute(async () => "ok"), "ok", "success resets the consecutive count");
  await assert.rejects(failing(), /down/);
  await assert.rejects(failing(), /down/);
  assert.equal(breaker.state(), "open");
  let ran = false;
  await assert.rejects(breaker.execute(async () => { ran = true; }), error => error instanceof CircuitOpenError && error.retryAfterMs === 500);
  assert.equal(ran, false);
  now += 500;
  assert.equal(breaker.state(), "half-open");
  await assert.rejects(failing(), /down/);
  assert.equal(breaker.state(), "open", "failed trial reopens");
  now += 500;
  let release;
  const trial = breaker.execute(() => new Promise(resolve => { release = resolve; }));
  await assert.rejects(breaker.execute(async () => 1), CircuitOpenError, "only one half-open trial at a time");
  release("recovered");
  assert.equal(await trial, "recovered");
  assert.equal(breaker.state(), "closed");
});

test("circuit breaker ignores errors excluded by isFailure", async () => {
  const breaker = createCircuitBreaker({ failureThreshold: 1, resetAfterMs: 10, clock: () => 0, isFailure: e => e.message !== "invalid" });
  await assert.rejects(breaker.execute(async () => { throw new Error("invalid"); }));
  assert.equal(breaker.state(), "closed");
  assert.throws(() => createCircuitBreaker({ failureThreshold: 0, resetAfterMs: 10 }), RangeError);
});
