// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import test from "node:test";
import { createHealthHandler } from "../.build/modules/health-checks/files/health.js";

const get = (path, method = "GET") => new Request("https://app.test" + path, { method });
const fixedClock = () => Date.UTC(2026, 9, 10, 12, 0, 0);
const secretMessage = "password=hunter2 at db.internal:5432";

test("liveness is 200, no-store JSON, and runs no checks", async () => {
  let ran = false;
  const health = createHealthHandler({ checks: { db: async () => { ran = true; } }, clock: fixedClock, version: "1.4.2" });
  const response = health.liveness(get("/healthz"));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.match(response.headers.get("content-type"), /^application\/json/);
  assert.deepEqual(await response.json(), { status: "ok", checkedAt: "2026-10-10T12:00:00.000Z", version: "1.4.2" });
  assert.equal(ran, false);
});

test("readiness passes with per-check status, duration, and detail", async () => {
  const health = createHealthHandler({
    checks: { db: async () => {}, cache: async () => ({ detail: "3 nodes" }) },
    clock: fixedClock,
  });
  const response = await health.readiness(get("/readyz"));
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.status, "ok");
  assert.deepEqual(body.checks.db, { status: "pass", critical: true, durationMs: 0 });
  assert.deepEqual(body.checks.cache, { status: "pass", critical: true, durationMs: 0, detail: "3 nodes" });
});

test("critical failure gives 503 without leaking the error message", async () => {
  const health = createHealthHandler({
    checks: { db: async () => { throw new Error(secretMessage); }, queue: async () => {} },
  });
  const response = await health.readiness(get("/readyz"));
  assert.equal(response.status, 503);
  const text = await response.text();
  assert.ok(!text.includes("hunter2"));
  const body = JSON.parse(text);
  assert.equal(body.status, "fail");
  assert.equal(body.checks.db.status, "fail");
  assert.equal(body.checks.db.error, undefined);
  assert.equal(body.checks.queue.status, "pass");
});

test("non-critical failure only degrades; synchronous throws are caught", async () => {
  const health = createHealthHandler({
    checks: {
      db: async () => {},
      search: { check: () => { throw new Error("boom"); }, critical: false },
    },
  });
  const response = await health.readiness(get("/readyz"));
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.status, "degraded");
  assert.deepEqual([body.checks.search.status, body.checks.search.critical], ["fail", false]);
});

test("checks run concurrently and time out individually with an abort signal", async () => {
  let aborted = false;
  const started = Date.now();
  const health = createHealthHandler({
    timeoutMs: 1000,
    checks: {
      slow: { check: signal => new Promise(() => { signal.addEventListener("abort", () => { aborted = true; }); }), timeoutMs: 30 },
      a: () => new Promise(resolve => setTimeout(resolve, 60)),
      b: () => new Promise(resolve => setTimeout(resolve, 60)),
    },
  });
  const response = await health.readiness(get("/readyz"));
  const elapsed = Date.now() - started;
  assert.equal(response.status, 503);
  const body = await response.json();
  assert.equal(body.checks.slow.status, "timeout");
  assert.equal(body.checks.a.status, "pass");
  assert.equal(aborted, true);
  assert.ok(elapsed < 115, `concurrent run took ${elapsed}ms`);
});

test("non-critical timeout degrades instead of failing", async () => {
  const health = createHealthHandler({
    checks: { flaky: { check: () => new Promise(() => {}), critical: false, timeoutMs: 10 } },
  });
  const response = await health.readiness(get("/readyz"));
  assert.equal(response.status, 200);
  assert.equal((await response.json()).checks.flaky.status, "timeout");
});

test("exposeErrors opts into truncated messages", async () => {
  const health = createHealthHandler({
    exposeErrors: true,
    checks: { db: async () => { throw new Error("x".repeat(1000)); }, t: { check: () => new Promise(() => {}), timeoutMs: 5 } },
  });
  const body = await (await health.readiness(get("/readyz"))).json();
  assert.equal(body.checks.db.error.length, 256);
  assert.equal(body.checks.t.error, "Check exceeded its time limit.");
});

test("HEAD has status and headers but no body; other methods get 405 with Allow", async () => {
  const health = createHealthHandler({ checks: { db: async () => { throw new Error("down"); } } });
  const head = await health.readiness(get("/readyz", "HEAD"));
  assert.equal(head.status, 503);
  assert.equal(head.body, null);
  assert.equal(head.headers.get("cache-control"), "no-store");
  assert.equal(health.liveness(get("/healthz", "HEAD")).body, null);
  for (const method of ["POST", "PUT", "DELETE", "OPTIONS"]) {
    const response = await health.readiness(get("/readyz", method));
    assert.equal(response.status, 405);
    assert.equal(response.headers.get("allow"), "GET, HEAD");
    assert.equal(health.liveness(get("/healthz", method)).status, 405);
  }
});

test("handle routes health paths and falls through otherwise", async () => {
  const health = createHealthHandler({ checks: { db: async () => {} }, readinessPath: "/ready" });
  assert.equal((await health.handle(get("/healthz"))).status, 200);
  assert.equal((await health.handle(get("/ready"))).status, 200);
  assert.equal(await health.handle(get("/readyz")), null);
  assert.equal(await health.handle(get("/api/users")), null);
});

test("unsafe check names and invalid configuration are rejected; __proto__ is a plain key", async () => {
  assert.throws(() => createHealthHandler({ checks: { "bad name": async () => {} } }), TypeError);
  assert.throws(() => createHealthHandler({ timeoutMs: 0 }), TypeError);
  assert.throws(() => createHealthHandler({ checks: { db: { check: 1 } } }), TypeError);
  assert.throws(() => createHealthHandler({ livenessPath: "/x", readinessPath: "/x" }), TypeError);
  const checks = Object.defineProperty({}, "__proto__", { value: async () => {}, enumerable: true });
  const body = await (await createHealthHandler({ checks }).readiness(get("/readyz"))).json();
  assert.equal(body.checks.__proto__.status, "pass");
});
