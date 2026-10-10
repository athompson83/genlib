// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import test from "node:test";
import { createMemoryStore } from "../.build/modules/rate-limit/files/store.js";
import { createRateLimiter } from "../.build/modules/rate-limit/files/limiter.js";
import { applyRateLimitHeaders, rateLimitResponse } from "../.build/modules/rate-limit/files/headers.js";

function setup(options) {
  const time = { now: 1_000_000 };
  const clock = () => time.now;
  const store = createMemoryStore({ clock, maxKeys: options.maxKeys ?? 100 });
  const limiter = createRateLimiter({ ...options, store, clock });
  return { time, store, limiter };
}

test("token bucket allows capacity, denies the next, and refills over injected time", async () => {
  const { time, limiter } = setup({ algorithm: "token-bucket", limit: 3, refillPerSecond: 1 });
  for (let i = 2; i >= 0; i -= 1) {
    const r = await limiter.consume("a");
    assert.equal(r.allowed, true);
    assert.equal(r.remaining, i);
    assert.equal(r.retryAfterMs, 0);
  }
  const denied = await limiter.consume("a");
  assert.equal(denied.allowed, false);
  assert.equal(denied.remaining, 0);
  assert.equal(denied.retryAfterMs, 1000);
  assert.equal(denied.resetAt, time.now + 3000);
  time.now += 999;
  assert.equal((await limiter.consume("a")).allowed, false);
  time.now += 1;
  const refilled = await limiter.consume("a");
  assert.equal(refilled.allowed, true);
  assert.equal(refilled.remaining, 0);
  time.now += 60_000;
  assert.equal((await limiter.consume("a")).remaining, 2, "refill never exceeds capacity");
});

test("token bucket honors cost and denials consume nothing", async () => {
  const { limiter } = setup({ algorithm: "token-bucket", limit: 5, refillPerSecond: 2 });
  assert.equal((await limiter.consume("k", 4)).remaining, 1);
  const denied = await limiter.consume("k", 3);
  assert.equal(denied.allowed, false);
  assert.equal(denied.retryAfterMs, 1000);
  assert.equal((await limiter.consume("k", 1)).allowed, true);
  await assert.rejects(limiter.consume("k", 6), RangeError);
});

test("fixed window allows limit per window and resets at the boundary", async () => {
  const { time, limiter } = setup({ algorithm: "fixed-window", limit: 2, windowMs: 1000 });
  time.now = 10_250;
  assert.equal((await limiter.consume("a")).remaining, 1);
  assert.equal((await limiter.consume("a")).remaining, 0);
  const denied = await limiter.consume("a");
  assert.equal(denied.allowed, false);
  assert.equal(denied.resetAt, 11_000);
  assert.equal(denied.retryAfterMs, 750);
  time.now = 10_999;
  assert.equal((await limiter.consume("a")).allowed, false);
  time.now = 11_000;
  assert.equal((await limiter.consume("a")).allowed, true);
});

test("sliding window counts the trailing window exactly", async () => {
  const { time, limiter } = setup({ algorithm: "sliding-window", limit: 2, windowMs: 1000 });
  time.now = 0;
  assert.equal((await limiter.consume("a")).allowed, true);
  time.now = 600;
  assert.equal((await limiter.consume("a")).allowed, true);
  time.now = 900;
  const denied = await limiter.consume("a");
  assert.equal(denied.allowed, false);
  assert.equal(denied.retryAfterMs, 100, "first entry expires at 1000");
  assert.equal(denied.resetAt, 1600);
  time.now = 1000;
  const r = await limiter.consume("a");
  assert.equal(r.allowed, true, "the entry from t=0 has left the trailing window");
  assert.equal(r.remaining, 0);
  time.now = 1100;
  assert.equal((await limiter.consume("a")).allowed, false, "no double burst across a window boundary");
  time.now = 1600;
  assert.equal((await limiter.consume("a")).allowed, true);
});

test("keys are isolated", async () => {
  for (const options of [
    { algorithm: "token-bucket", limit: 1, refillPerSecond: 1 },
    { algorithm: "fixed-window", limit: 1, windowMs: 1000 },
    { algorithm: "sliding-window", limit: 1, windowMs: 1000 },
  ]) {
    const { limiter } = setup(options);
    assert.equal((await limiter.consume("user:1")).allowed, true);
    assert.equal((await limiter.consume("user:1")).allowed, false);
    assert.equal((await limiter.consume("user:2")).allowed, true, options.algorithm);
  }
});

test("memory store is bounded with LRU eviction and expires state", async () => {
  const time = { now: 0 };
  const store = createMemoryStore({ maxKeys: 3, clock: () => time.now });
  const put = (key, value, ttlMs = 1000) => store.update(key, current => ({ next: value, ttlMs, result: current }));
  await put("a", 1); await put("b", 2); await put("c", 3);
  assert.equal(await put("a", 11), 1, "touch a so b becomes least recently used");
  await put("d", 4);
  assert.equal(store.size(), 3);
  assert.equal(await put("b", 22), undefined, "b was evicted");
  assert.equal(await put("a", 111), 11);
  time.now = 1000;
  assert.equal(await put("a", 1), undefined, "expired state reads as undefined");
  assert.throws(() => createMemoryStore({ maxKeys: 0 }), RangeError);
});

test("limiter state respects the store bound under many keys", async () => {
  const { store, limiter } = setup({ algorithm: "fixed-window", limit: 1, windowMs: 1000, maxKeys: 10 });
  for (let i = 0; i < 50; i += 1) await limiter.consume("ip:" + i);
  assert.equal(store.size(), 10);
});

test("concurrent requests on the memory store never exceed the limit", async () => {
  for (const options of [
    { algorithm: "token-bucket", limit: 7, refillPerSecond: 0.001 },
    { algorithm: "fixed-window", limit: 7, windowMs: 60_000 },
    { algorithm: "sliding-window", limit: 7, windowMs: 60_000 },
  ]) {
    const { limiter } = setup(options);
    const results = await Promise.all(Array.from({ length: 50 }, () => limiter.consume("hot")));
    assert.equal(results.filter(r => r.allowed).length, 7, options.algorithm);
    assert.deepEqual(results.filter(r => r.allowed).map(r => r.remaining).sort((a, b) => b - a), [6, 5, 4, 3, 2, 1, 0]);
  }
});

test("rateLimitResponse builds a 429 with Retry-After and RateLimit headers", async () => {
  const { limiter } = setup({ algorithm: "fixed-window", limit: 1, windowMs: 60_000 });
  await limiter.consume("a");
  const denied = await limiter.consume("a");
  const res = rateLimitResponse(denied, { headers: { "Access-Control-Allow-Origin": "https://app.example.test" } });
  assert.equal(res.status, 429);
  assert.equal(res.headers.get("RateLimit-Limit"), "1");
  assert.equal(res.headers.get("RateLimit-Remaining"), "0");
  assert.equal(res.headers.get("RateLimit-Reset"), String(Math.ceil(denied.resetAfterMs / 1000)));
  assert.equal(res.headers.get("Retry-After"), String(Math.ceil(denied.retryAfterMs / 1000)));
  assert.equal(res.headers.get("Cache-Control"), "no-store");
  assert.equal(res.headers.get("Access-Control-Allow-Origin"), "https://app.example.test");
  assert.deepEqual(await res.json(), { error: "rate_limited" });
});

test("applyRateLimitHeaders rounds up and only sets Retry-After on denial", () => {
  const allowed = applyRateLimitHeaders(new Headers(), { allowed: true, limit: 10, remaining: 9, resetAt: 0, resetAfterMs: 1500, retryAfterMs: 0 });
  assert.equal(allowed.get("RateLimit-Reset"), "2");
  assert.equal(allowed.get("RateLimit-Remaining"), "9");
  assert.equal(allowed.has("Retry-After"), false);
  const denied = applyRateLimitHeaders(new Headers(), { allowed: false, limit: 10, remaining: 0, resetAt: 0, resetAfterMs: 1, retryAfterMs: 1 });
  assert.equal(denied.get("Retry-After"), "1");
});

test("limiter validates configuration and keys", async () => {
  const store = createMemoryStore();
  assert.throws(() => createRateLimiter({ algorithm: "fixed-window", limit: 0, windowMs: 1000, store }), RangeError);
  assert.throws(() => createRateLimiter({ algorithm: "token-bucket", limit: 1, refillPerSecond: 0, store }), RangeError);
  assert.throws(() => createRateLimiter({ algorithm: "sliding-window", limit: 20_000, windowMs: 1000, store }), RangeError);
  const limiter = createRateLimiter({ algorithm: "fixed-window", limit: 1, windowMs: 1000, store });
  await assert.rejects(limiter.consume(""), RangeError);
});
