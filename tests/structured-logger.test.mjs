// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import test from "node:test";
import { createLogger, DEFAULT_REDACT_KEYS, REDACTED } from "../.build/modules/structured-logger/files/logger.js";
import { withRequest } from "../.build/modules/structured-logger/files/request.js";

const SECRET = "secret-value-DO-NOT-LOG";
const clock = () => new Date("2026-01-02T03:04:05.000Z");

function capture(options = {}) {
  const lines = [];
  const logger = createLogger({ clock, sink: (line, level) => lines.push({ line, level }), ...options });
  return { logger, lines, records: () => lines.map(entry => JSON.parse(entry.line)) };
}

test("writes one JSON line per record with time, level, msg first and filters by level", () => {
  const { logger, lines, records } = capture({ level: "info", base: { service: "api" } });
  logger.debug("hidden");
  logger.info("started", { port: 3000 });
  logger.warn("slow");
  logger.error("failed");
  assert.equal(lines.length, 3);
  assert.ok(lines.every(entry => !entry.line.includes("\n")));
  assert.deepEqual(lines.map(entry => entry.level), ["info", "warn", "error"]);
  assert.equal(lines[0].line, '{"time":"2026-01-02T03:04:05.000Z","level":"info","msg":"started","service":"api","port":3000}');
  assert.deepEqual(records().map(record => record.msg), ["started", "slow", "failed"]);
  assert.equal(logger.isLevelEnabled("debug"), false);
  assert.equal(logger.isLevelEnabled("warn"), true);

  const silent = capture({ level: "silent" });
  silent.logger.error("nothing");
  assert.equal(silent.lines.length, 0);
  assert.throws(() => createLogger({ level: "verbose" }), TypeError);
});

test("reserved keys cannot be overwritten by fields", () => {
  const { logger, records } = capture();
  logger.info("real", { level: "error", msg: "fake", time: "never" });
  assert.deepEqual(records()[0], {
    time: "2026-01-02T03:04:05.000Z", level: "info", msg: "real", _level: "error", _msg: "fake", _time: "never",
  });
});

test("child loggers add bindings without changing the parent and snapshot their bindings", () => {
  const { logger, records } = capture({ base: { service: "api" } });
  const bindings = { tenant: "t1" };
  const child = logger.child(bindings).child({ job: "sync" });
  bindings.tenant = "mutated";
  child.info("child");
  logger.info("parent");
  const [first, second] = records();
  assert.equal(first.service, "api");
  assert.equal(first.tenant, "t1");
  assert.equal(first.job, "sync");
  assert.equal(second.tenant, undefined);
});

test("redacts default and configured keys case-insensitively at any depth", () => {
  const { logger, lines, records } = capture({ redact: ["ssn"], base: { apiKey: SECRET } });
  logger.child({ Authorization: `Bearer ${SECRET}` }).info("request", {
    user: { name: "Ada", PASSWORD: SECRET, profile: { SSN: SECRET, "X-API-Key": SECRET } },
    headers: new Headers({ cookie: `sid=${SECRET}`, accept: "application/json" }),
    list: [{ token: SECRET }, { api_key: SECRET }],
    map: new Map([["client_secret", SECRET]]),
  });
  assert.equal(lines[0].line.includes(SECRET), false);
  const record = records()[0];
  assert.equal(record.apiKey, REDACTED);
  assert.equal(record.Authorization, REDACTED);
  assert.equal(record.user.name, "Ada");
  assert.equal(record.user.PASSWORD, REDACTED);
  assert.equal(record.user.profile.SSN, REDACTED);
  assert.equal(record.user.profile["X-API-Key"], REDACTED);
  assert.deepEqual(record.headers, { accept: "application/json", cookie: REDACTED });
  assert.deepEqual(record.list, [{ token: REDACTED }, { api_key: REDACTED }]);
  assert.deepEqual(record.map, { client_secret: REDACTED });
  for (const key of ["password", "token", "secret", "authorization", "cookie", "apiKey", "api_key"]) {
    assert.ok(DEFAULT_REDACT_KEYS.includes(key), key);
  }
});

test("serializes errors with bounded cause chains and optional stacks", () => {
  const root = new Error("root cause");
  const middle = new Error("middle", { cause: root });
  const top = new TypeError("top", { cause: middle });
  top.code = "E_TOP";
  top.token = SECRET;
  const { logger, lines, records } = capture({ maxCauseDepth: 1 });
  logger.error("failed", { err: top });
  logger.error("direct", top);
  const [record, direct] = records();
  assert.deepEqual(record.err, {
    name: "TypeError", message: "top", code: "E_TOP", token: REDACTED,
    cause: { name: "Error", message: "middle", cause: "[Cause depth exceeded]" },
  });
  assert.equal(direct.err.message, "top");
  assert.equal(lines[0].line.includes(SECRET), false);
  assert.equal("stack" in record.err, false);

  const loop = new Error("loop");
  loop.cause = loop;
  const withStack = capture({ includeStack: true });
  withStack.logger.error("loop", { err: loop });
  const looped = withStack.records()[0].err;
  assert.equal(looped.cause, "[Circular]");
  assert.equal(typeof looped.stack, "string");
});

test("is cycle-safe and bounds depth, arrays, keys, strings, and line size", () => {
  const { logger, records } = capture({ maxKeys: 2 });
  const cyclic = { name: "a" };
  cyclic.self = cyclic;
  const shared = { v: 1 };
  logger.info("bounds", { cyclic, pair: [shared, shared], dropped: true });
  const record = records()[0];
  // maxKeys applies to the fields object too; only the first two fields remain.
  assert.deepEqual(Object.keys(record).slice(3), ["cyclic", "pair", "…"]);
  // Shared (non-cyclic) references are serialized in full, not marked circular.
  assert.deepEqual(record.cyclic, { name: "a", self: "[Circular]" });
  assert.deepEqual(record.pair, [{ v: 1 }, { v: 1 }]);

  const wide = capture({ maxDepth: 2, maxArrayLength: 2, maxStringLength: 5 });
  wide.logger.info("bounds", { deep: { a: { b: { c: 1 } } }, arr: [1, 2, 3, 4], long: "abcdefghij" });
  const w = wide.records()[0];
  assert.deepEqual(w.deep, { a: "[Object]" });
  assert.deepEqual(w.arr, [1, 2, "[… 2 more]"]);
  assert.equal(w.long, "abcde…[truncated 5 chars]");

  const small = capture({ maxLineBytes: 200 });
  small.logger.info("big", { blob: "x".repeat(1000) });
  const truncated = small.records()[0];
  assert.equal(truncated.truncated, true);
  assert.ok(truncated.originalBytes > 1000);
  assert.ok(small.lines[0].line.length <= 200);
});

test("handles awkward values without throwing", () => {
  const { logger, records } = capture();
  const hostile = {};
  Object.defineProperty(hostile, "boom", { enumerable: true, get() { throw new Error(SECRET); } });
  logger.info("values", {
    big: 10n, nan: Number.NaN, inf: Infinity, fn: function named() {}, sym: Symbol("s"), undef: undefined,
    date: new Date(0), bytes: new Uint8Array(4), set: new Set([1, 2]), arr: [undefined], hostile,
  });
  const record = records()[0];
  assert.equal(record.big, "10");
  assert.equal(record.nan, "NaN");
  assert.equal(record.inf, "Infinity");
  assert.equal(record.fn, "[Function named]");
  assert.equal(record.sym, "Symbol(s)");
  assert.equal("undef" in record, false);
  assert.equal(record.date, "1970-01-01T00:00:00.000Z");
  assert.equal(record.bytes, "[Uint8Array byteLength=4]");
  assert.deepEqual(record.set, [1, 2]);
  assert.deepEqual(record.arr, [null]);
  assert.deepEqual(record.hostile, { boom: "[Unserializable]" });
});

test("sink failures are swallowed and the default sink routes by level", () => {
  const logger = createLogger({ clock, sink: () => { throw new Error("sink down"); } });
  assert.doesNotThrow(() => logger.error("still fine"));

  const original = { log: console.log, error: console.error };
  const seen = [];
  console.log = line => seen.push(["log", line]);
  console.error = line => seen.push(["error", line]);
  try {
    const plain = createLogger({ clock });
    plain.info("i");
    plain.warn("w");
    plain.error("e");
  } finally {
    console.log = original.log;
    console.error = original.error;
  }
  assert.deepEqual(seen.map(([stream, line]) => [stream, JSON.parse(line).msg]), [["log", "i"], ["error", "w"], ["error", "e"]]);
});

test("withRequest reuses a well-formed x-request-id and binds it to a child logger", () => {
  const { logger, records } = capture();
  const request = new Request("https://app.example/path?token=abc", { headers: { "x-request-id": "req-123" } });
  const result = withRequest(logger, request);
  assert.equal(result.requestId, "req-123");
  result.logger.info("handled");
  assert.equal(records()[0].requestId, "req-123");
  assert.ok(Object.isFrozen(result));
});

test("withRequest generates an ID when missing, malformed, or untrusted", () => {
  const { logger } = capture();
  const generated = withRequest(logger, new Request("https://app.example/"));
  assert.match(generated.requestId, /^[0-9a-f-]{36}$/);

  const injected = withRequest(logger, new Request("https://app.example/", { headers: { "x-request-id": "bad id\"}" } }),
    { generate: () => "fresh-1" });
  assert.equal(injected.requestId, "fresh-1");

  const untrusted = withRequest(logger, new Request("https://app.example/", { headers: { "x-request-id": "req-123" } }),
    { trustIncoming: false, generate: () => "fresh-2" });
  assert.equal(untrusted.requestId, "fresh-2");

  const custom = withRequest(logger, new Request("https://app.example/", { headers: { "x-correlation-id": "c-9" } }),
    { header: "x-correlation-id" });
  assert.equal(custom.requestId, "c-9");

  assert.throws(() => withRequest(logger, new Request("https://app.example/"), { generate: () => "has space" }), TypeError);
});
