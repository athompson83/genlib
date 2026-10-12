// SPDX-License-Identifier: Apache-2.0
// keyset-pagination: signed opaque cursors with key rotation, scope binding, multi-column keyset order, limit
// clamping, next/prev cursors, stability under concurrent writes (in-memory source) and the Fetch list adapter.
import assert from "node:assert/strict";
import test from "node:test";
import {
  createKeysetPager, KeysetError, canonicalJson, compareKeys, formatLinkHeader,
} from "../.build/modules/keyset-pagination/files/core.js";
import { createMemoryKeysetSource } from "../.build/modules/keyset-pagination/files/memory-store.js";
import { createKeysetListHandler } from "../.build/modules/keyset-pagination/files/http.js";

const KEY_A = { id: "k1", secret: new Uint8Array(32).fill(7) };
const KEY_B = { id: "k2", secret: new Uint8Array(32).fill(9) };
const HOUR = 3_600_000;

// Many rows share a score and a createdAt so the unique id tie-breaker matters.
function makeRows(count = 47, tenant = "t1") {
  return Array.from({ length: count }, (_, i) => ({
    id: `${tenant}-${String(i).padStart(3, "0")}`, tenantId: tenant,
    status: i % 3 === 0 ? "archived" : "open",
    score: i % 4, createdAt: 1_000 + Math.floor(i / 5), title: `row ${i}`,
  }));
}

const SORTS = {
  newest: [
    { key: "createdAt", direction: "desc", type: "number", column: "created_at" },
    { key: "id", direction: "desc", type: "string", unique: true },
  ],
  // Mixed directions: score ascending, newest first within a score, id ascending as the tie-breaker.
  score: [
    { key: "score", direction: "asc", type: "number" },
    { key: "createdAt", direction: "desc", type: "number", column: "created_at" },
    { key: "id", direction: "asc", type: "string", unique: true },
  ],
};

function setup(extra = {}) {
  let now = 5_000_000;
  const rows = extra.rows ?? [...makeRows(), ...makeRows(12, "t2")];
  const source = createMemoryKeysetSource({ items: () => rows });
  const pager = createKeysetPager({
    keys: [KEY_A], sorts: SORTS, defaultSort: "newest", source, now: () => now,
    defaultLimit: 10, maxLimit: 25, ...extra.options,
  });
  return { rows, source, pager, advance: (ms) => { now += ms; } };
}

const code = (expected) => (error) => error instanceof KeysetError && error.code === expected;

function sortedLocal(rows, fields) {
  return [...rows].sort((a, b) => compareKeys(fields.map((f) => a[f.key]), fields.map((f) => b[f.key]), fields));
}

async function walk(pager, request) {
  const seen = [];
  let cursor;
  for (let guard = 0; guard < 100; guard++) {
    const page = await pager.page({ ...request, ...(cursor ? { cursor } : {}) });
    seen.push(...page.items);
    if (!page.nextCursor) return seen;
    cursor = page.nextCursor;
  }
  throw new Error("did not terminate");
}

test("cursor is opaque base64url, encodes the last sort keys (not an offset) and is signed with the active key", async () => {
  const { pager } = setup();
  const page = await pager.page({ scope: { tenantId: "t1" }, limit: 5 });
  assert.equal(page.items.length, 5);
  const [kid, body, mac] = page.nextCursor.split(".");
  assert.equal(kid, "k1");
  assert.match(body, /^[A-Za-z0-9_-]+$/);
  assert.match(mac, /^[A-Za-z0-9_-]{43}$/);
  const decoded = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  const last = page.items.at(-1);
  assert.deepEqual(decoded.k, [last.createdAt, last.id], "carries the last row's sort keys");
  assert.equal(decoded.d, "n");
  assert.ok(!("offset" in decoded) && !JSON.stringify(decoded).includes("tenantId"), "no offset and no raw scope");
  const inspected = await pager.inspectCursor(page.nextCursor);
  assert.deepEqual(inspected.values, [last.createdAt, last.id]);
});

test("walking every page returns each scoped item exactly once in declared order, using the unique id tie-breaker", async () => {
  const { pager, rows } = setup();
  for (const sort of ["newest", "score"]) {
    for (const limit of [1, 4, 7, 25]) {
      const seen = await walk(pager, { scope: { tenantId: "t1" }, sort, limit });
      const expected = sortedLocal(rows.filter((r) => r.tenantId === "t1"), SORTS[sort]).map((r) => r.id);
      assert.deepEqual(seen.map((r) => r.id), expected, `${sort} @ ${limit}`);
      assert.equal(new Set(seen.map((r) => r.id)).size, 47);
    }
  }
});

test("mixed ASC/DESC order: score ascending, createdAt descending within a score, id ascending", async () => {
  const { pager } = setup();
  const seen = await walk(pager, { scope: { tenantId: "t1" }, sort: "score", limit: 6 });
  for (let i = 1; i < seen.length; i++) {
    const [a, b] = [seen[i - 1], seen[i]];
    assert.ok(a.score < b.score || (a.score === b.score && (a.createdAt > b.createdAt || (a.createdAt === b.createdAt && a.id < b.id))));
  }
});

test("next and prev cursors walk backward to the same pages; the first page has no prev and the last has no next", async () => {
  const { pager } = setup();
  const scope = { tenantId: "t1" };
  const pages = [await pager.page({ scope, sort: "score", limit: 10 })];
  assert.equal(pages[0].prevCursor, null);
  while (pages.at(-1).nextCursor) pages.push(await pager.page({ scope, cursor: pages.at(-1).nextCursor, limit: 10 }));
  assert.equal(pages.length, 5);
  assert.equal(pages.at(-1).items.length, 7);
  assert.equal(pages.at(-1).nextCursor, null, "end signal: null next cursor");
  // Back from the last page.
  let page = pages.at(-1);
  for (let i = pages.length - 2; i >= 0; i--) {
    page = await pager.page({ scope, cursor: page.prevCursor, limit: 10 });
    assert.deepEqual(page.items.map((r) => r.id), pages[i].items.map((r) => r.id), `page ${i}`);
    assert.ok(page.nextCursor, "a page reached backwards has a next cursor");
  }
  assert.equal(page.prevCursor, null, "backward walk stops at the first page");
});

test("an empty or exactly-full final page ends correctly", async () => {
  const { pager } = setup({ rows: makeRows(10) });
  const page = await pager.page({ scope: { tenantId: "t1" }, limit: 10 });
  assert.equal(page.items.length, 10);
  assert.equal(page.nextCursor, null, "limit+1 probe: no phantom next page");
  const empty = await pager.page({ scope: { tenantId: "nobody" } });
  assert.deepEqual([empty.items, empty.nextCursor, empty.prevCursor], [[], null, null]);
});

test("limit is validated and clamped to the server maximum; default applies when absent", async () => {
  const { pager } = setup();
  const scope = { tenantId: "t1" };
  assert.equal((await pager.page({ scope })).items.length, 10);
  const big = await pager.page({ scope, limit: 1000 });
  assert.equal(big.items.length, 25);
  assert.equal(big.limit, 25);
  assert.equal((await pager.page({ scope, limit: "3" })).items.length, 3);
  assert.equal(pager.parseLimit("999999999999999999999"), 25);
  assert.equal(pager.parseLimit(undefined), 10);
  assert.equal(pager.parseLimit(""), 10);
  for (const bad of [0, -1, 2.5, "abc", "1e3", " 5", "-3", Number.NaN, null]) {
    await assert.rejects(pager.page({ scope, limit: bad }), code("invalid-limit"), String(bad));
  }
});

test("tampered, malformed, expired and wrong-key cursors are rejected with distinguishable errors", async () => {
  const { pager, advance } = setup({ options: { ttlMs: HOUR } });
  const scope = { tenantId: "t1" };
  const { nextCursor } = await pager.page({ scope, limit: 5 });
  const [kid, body, mac] = nextCursor.split(".");
  // Tampered body: change the sort keys and re-encode.
  const forged = JSON.parse(Buffer.from(body, "base64url").toString());
  forged.k = [0, "t1-000"];
  const forgedBody = Buffer.from(JSON.stringify(forged)).toString("base64url");
  await assert.rejects(pager.page({ scope, cursor: `${kid}.${forgedBody}.${mac}` }), code("invalid-signature"));
  const flipped = mac.slice(0, -2) + (mac.at(-2) === "A" ? "B" : "A") + mac.at(-1);
  await assert.rejects(pager.page({ scope, cursor: `${kid}.${body}.${flipped}` }), code("invalid-signature"));
  await assert.rejects(pager.page({ scope, cursor: `nope.${body}.${mac}` }), code("invalid-signature"), "unknown key id");
  for (const bad of ["", "abc", "a.b", "k1..x", "k1.!!.x", `${kid}.${body}.${mac}.x`, "x".repeat(5000), `bad kid!.${body}.${mac}`]) {
    await assert.rejects(pager.page({ scope, cursor: bad }), code("malformed-cursor"), bad.slice(0, 30));
  }
  await assert.rejects(pager.page({ scope, cursor: 42 }), code("malformed-cursor"));
  advance(HOUR - 1);
  await pager.page({ scope, cursor: nextCursor });
  advance(1);
  await assert.rejects(pager.page({ scope, cursor: nextCursor }), code("expired-cursor"));
});

test("key rotation: cursors signed by a retired-but-listed key still verify; new cursors use the first key; removed keys fail", async () => {
  const rows = makeRows();
  const source = createMemoryKeysetSource({ items: () => rows });
  const options = { sorts: SORTS, defaultSort: "newest", source, now: () => 1 };
  const old = createKeysetPager({ ...options, keys: [KEY_A] });
  const rotated = createKeysetPager({ ...options, keys: [KEY_B, KEY_A] });
  const retired = createKeysetPager({ ...options, keys: [KEY_B] });
  const scope = { tenantId: "t1" };
  const first = await old.page({ scope, limit: 5 });
  const second = await rotated.page({ scope, limit: 5, cursor: first.nextCursor });
  assert.equal(second.items[0].id, (await old.page({ scope, limit: 5, cursor: first.nextCursor })).items[0].id);
  assert.ok(second.nextCursor.startsWith("k2."), "rotated pager signs with its first key");
  await retired.page({ scope, limit: 5, cursor: second.nextCursor });
  await assert.rejects(retired.page({ scope, limit: 5, cursor: first.nextCursor }), code("invalid-signature"));
  assert.throws(() => createKeysetPager({ ...options, keys: [] }), RangeError);
  assert.throws(() => createKeysetPager({ ...options, keys: [{ id: "k", secret: new Uint8Array(16) }] }), RangeError);
  assert.throws(() => createKeysetPager({ ...options, keys: [KEY_A, { ...KEY_B, id: "k1" }] }), RangeError);
});

test("scope binding: a cursor reused by another tenant, with other filters or with another sort is rejected", async () => {
  const { pager } = setup();
  const scope = { tenantId: "t1" };
  const filters = { status: "open" };
  const page = await pager.page({ scope, filters, sort: "score", limit: 4 });
  assert.ok(page.items.every((r) => r.status === "open" && r.tenantId === "t1"));
  // Same request continues.
  const next = await pager.page({ scope, filters, limit: 4, cursor: page.nextCursor });
  assert.ok(next.items.length > 0);
  await assert.rejects(pager.page({ scope: { tenantId: "t2" }, filters, cursor: page.nextCursor }), code("scope-mismatch"));
  await assert.rejects(pager.page({ scope: { tenantId: "t1", userId: "u9" }, filters, cursor: page.nextCursor }), code("scope-mismatch"));
  await assert.rejects(pager.page({ scope, filters: { status: "archived" }, cursor: page.nextCursor }), code("scope-mismatch"));
  await assert.rejects(pager.page({ scope, cursor: page.nextCursor }), code("scope-mismatch"), "dropping a filter");
  await assert.rejects(pager.page({ scope, filters, sort: "newest", cursor: page.nextCursor }), code("scope-mismatch"));
  // Filter key order does not matter; values do.
  const two = await pager.page({ scope, filters: { status: "open", score: 1 }, limit: 2 });
  await pager.page({ scope, filters: { score: 1, status: "open" }, limit: 2, cursor: two.nextCursor });
  // Changing the declared sort definition invalidates outstanding cursors.
  const changed = createKeysetPager({
    keys: [KEY_A], defaultSort: "newest", source: createMemoryKeysetSource({ items: () => makeRows() }), now: () => 5_000_000,
    sorts: { ...SORTS, score: [SORTS.score[0], { ...SORTS.score[1], direction: "asc" }, SORTS.score[2]] },
  });
  await assert.rejects(changed.page({ scope, filters, cursor: page.nextCursor }), code("scope-mismatch"));
});

test("sort declarations must end with a unique tie-breaker; unknown sorts and invalid filters are refused", async () => {
  const source = createMemoryKeysetSource({ items: () => [] });
  const base = { keys: [KEY_A], source, defaultSort: "a" };
  assert.throws(() => createKeysetPager({ ...base, sorts: { a: [{ key: "createdAt", direction: "desc", type: "number" }] } }), /unique/);
  assert.throws(() => createKeysetPager({ ...base, sorts: { a: [] } }), RangeError);
  assert.throws(() => createKeysetPager({ ...base, sorts: { a: [{ key: "id", direction: "up", type: "string", unique: true }] } }), RangeError);
  assert.throws(() => createKeysetPager({ ...base, sorts: { a: [{ key: "id", direction: "asc", type: "string", unique: true, column: "id; drop table x" }] } }), RangeError);
  assert.throws(() => createKeysetPager({ ...base, sorts: { b: SORTS.newest } }), /defaultSort/);
  const { pager } = setup();
  await assert.rejects(pager.page({ scope: { tenantId: "t1" }, sort: "nope" }), code("invalid-sort"));
  await assert.rejects(pager.page({ scope: { tenantId: "t1" }, sort: "__proto__" }), code("invalid-sort"));
  await assert.rejects(pager.page({ scope: { tenantId: "t1" }, filters: { status: { $ne: 1 } } }), code("invalid-filter"));
  await assert.rejects(pager.page({ scope: "t1" }), TypeError);
});

test("stable under concurrent inserts and deletes between pages: no duplicates and no skips (memory source)", async () => {
  const { pager, rows } = setup({ rows: makeRows(40) });
  const scope = { tenantId: "t1" };
  const original = new Set(rows.map((r) => r.id));
  const deleted = new Set();
  const inserted = [];
  const seen = [];
  let cursor;
  let step = 0;
  for (;;) {
    const page = await pager.page({ scope, limit: 6, ...(cursor ? { cursor } : {}) });
    seen.push(...page.items.map((r) => r.id));
    if (!page.nextCursor) break;
    cursor = page.nextCursor;
    step++;
    // Insert one row ahead of the cursor (older createdAt) and one behind it (newest), and delete rows on both sides.
    const ahead = { id: `t1-new-a${step}`, tenantId: "t1", status: "open", score: 0, createdAt: 900 + step, title: "ahead" };
    const behind = { id: `t1-new-b${step}`, tenantId: "t1", status: "open", score: 0, createdAt: 9_000 + step, title: "behind" };
    rows.push(ahead, behind);
    inserted.push(ahead.id);
    // Delete the last row already returned (the cursor row itself) and the next unseen row.
    const unseen = sortedLocal(rows.filter((r) => !seen.includes(r.id) && !r.id.includes("new-b")), SORTS.newest)[0];
    for (const id of [seen.at(-1), unseen.id]) {
      const index = rows.findIndex((r) => r.id === id);
      rows.splice(index, 1);
      deleted.add(id);
    }
  }
  assert.equal(new Set(seen).size, seen.length, "no duplicates");
  for (const id of deleted) {
    // A row deleted before the walk reached it is never returned.
    if (!seen.includes(id)) assert.ok(!rows.some((r) => r.id === id));
  }
  assert.ok([...deleted].some((id) => !seen.includes(id)), "the walk deleted rows it had not reached yet");
  const survivors = [...original].filter((id) => !deleted.has(id));
  for (const id of survivors) assert.ok(seen.includes(id), `skipped ${id}`);
  for (const id of inserted.filter((id) => !deleted.has(id))) assert.ok(seen.includes(id), `row inserted ahead of the cursor is reached: ${id}`);
  assert.ok(inserted.filter((id) => seen.includes(id)).length >= 3, "several inserted rows were reached");
  assert.ok(!seen.some((id) => id.includes("new-b")), "rows inserted behind the cursor are not replayed");
});

test("a source that returns rows out of order or behind the cursor is caught instead of corrupting pages", async () => {
  const rows = makeRows(10);
  const pager = createKeysetPager({
    keys: [KEY_A], sorts: SORTS, defaultSort: "newest", now: () => 1,
    source: { fetch: async () => [rows[0], rows[5], rows[2]] },
  });
  await assert.rejects(pager.page({ scope: { tenantId: "t1" } }), /order/);
  const unchecked = createKeysetPager({
    keys: [KEY_A], sorts: SORTS, defaultSort: "newest", now: () => 1, checkOrder: false,
    source: { fetch: async () => [rows[0], rows[5], rows[2]] },
  });
  assert.equal((await unchecked.page({ scope: {} })).items.length, 3, "checkOrder: false trusts the database collation");
  const nulls = createKeysetPager({
    keys: [KEY_A], sorts: SORTS, defaultSort: "newest", now: () => 1,
    source: { fetch: async () => [{ id: "x", createdAt: null }, { id: "y", createdAt: null }] },
  });
  await assert.rejects(nulls.page({ scope: {}, limit: 1 }), TypeError);
});

test("compareKeys orders strings by code point like COLLATE \"C\", and timestamp keys need canonical microsecond strings", async () => {
  const asc = [{ key: "s", direction: "asc", type: "string", unique: true }];
  assert.ok(compareKeys(["\uFF21"], ["\u{1F600}"], asc) < 0, "U+FF21 before U+1F600");
  assert.ok(compareKeys(["\u{1F600}"], ["\uFFFF"], asc) > 0);
  assert.ok(compareKeys(["ab"], ["abc"], asc) < 0);
  assert.equal(compareKeys(["\u{1F600}x"], ["\u{1F600}x"], asc), 0);
  const rows = [
    { id: "a", at: "2026-01-01T00:00:00.123900Z" }, { id: "b", at: "2026-01-01T00:00:00.123500Z" },
    { id: "c", at: new Date("2026-01-01T00:00:00.123Z") }, { id: "d", at: "2026-01-01T00:00:00.122000Z" },
  ];
  const pager = createKeysetPager({
    keys: [KEY_A], defaultSort: "t", now: () => 1, source: createMemoryKeysetSource({ items: () => rows, getValue: (r, k) => (r[k] instanceof Date ? r[k].toISOString().replace("Z", "000Z") : r[k]) }),
    sorts: { t: [{ key: "at", direction: "desc", type: "timestamp" }, { key: "id", direction: "desc", type: "string", unique: true }] },
  });
  assert.deepEqual((await walk(pager, { scope: {}, limit: 1 })).map((r) => r.id), ["a", "b", "c", "d"]);
  const bad = createKeysetPager({
    keys: [KEY_A], defaultSort: "t", now: () => 1, source: createMemoryKeysetSource({ items: () => [{ id: "x", at: "2026-01-01" }, { id: "y", at: "2026-01-02" }] }),
    sorts: { t: [{ key: "at", direction: "desc", type: "timestamp" }, { key: "id", direction: "desc", type: "string", unique: true }] },
  });
  await assert.rejects(bad.page({ scope: {}, limit: 1 }), TypeError);
});

test("long string sort values: cursors up to the decode limit round-trip, larger ones fail clearly at encode", async () => {
  const make = (n) => [1, 2, 3].map((i) => ({ id: String(i), title: "\u6A19".repeat(n) + i }));
  const options = (items) => ({
    keys: [KEY_A], defaultSort: "title", now: () => 1, source: createMemoryKeysetSource({ items: () => items }),
    sorts: { title: [{ key: "title", type: "string", direction: "asc" }, { key: "id", type: "string", direction: "asc", unique: true }] },
  });
  const pager = createKeysetPager(options(make(501)));
  const p1 = await pager.page({ scope: {}, limit: 1 });
  assert.ok(p1.nextCursor.length > 2048);
  assert.equal((await pager.page({ scope: {}, limit: 1, cursor: p1.nextCursor })).items[0].id, "2");
  const huge = createKeysetPager(options(make(1500)));
  await assert.rejects(huge.page({ scope: {}, limit: 1 }), (error) => error instanceof RangeError && /too long/.test(error.message));
  await assert.rejects(pager.page({ scope: {}, cursor: "k1." + "A".repeat(5000) + ".x" }), code("malformed-cursor"));
});

test("canonicalJson sorts object keys and Link header formatting follows RFC 8288", () => {
  assert.equal(canonicalJson({ b: 1, a: [true, null, "x"] }), '{"a":[true,null,"x"],"b":1}');
  assert.equal(formatLinkHeader({ next: "https://api.example.com/items?cursor=a", prev: null }), '<https://api.example.com/items?cursor=a>; rel="next"');
  assert.equal(formatLinkHeader({}), null);
  assert.throws(() => formatLinkHeader({ next: "https://x/>; rel=evil" }), RangeError);
});

// ---------- HTTP adapter ----------

function httpSetup(options = {}) {
  const { pager, rows } = setup();
  const handler = createKeysetListHandler({
    pager, prefix: "/api/items",
    scope: (request) => {
      const tenant = request.headers.get("x-test-tenant");
      return tenant ? { tenantId: tenant } : null;
    },
    filters: { status: { type: "string", values: ["open", "archived"] }, score: { type: "number" } },
    serialize: (row) => ({ id: row.id, title: row.title }),
    ...options,
  });
  const get = (path, tenant = "t1", init = {}) => handler(new Request(`https://api.example.com${path}`, {
    ...init, headers: { ...(tenant ? { "x-test-tenant": tenant } : {}), ...init.headers },
  }));
  return { handler, get, rows };
}

test("HTTP: parses query, emits items, cursors and an RFC 8288 Link header that keeps filters", async () => {
  const { get } = httpSetup();
  const first = await get("/api/items?status=open&limit=3&sort=score");
  assert.equal(first.status, 200);
  assert.equal(first.headers.get("cache-control"), "private, no-store");
  const body = await first.json();
  assert.equal(body.items.length, 3);
  assert.deepEqual(Object.keys(body.items[0]), ["id", "title"]);
  assert.equal(body.limit, 3);
  assert.equal(body.prevCursor, null);
  const link = first.headers.get("link");
  const match = /^<([^>]+)>; rel="next"$/.exec(link);
  assert.ok(match, link);
  const nextUrl = new URL(match[1]);
  assert.equal(nextUrl.searchParams.get("status"), "open");
  assert.equal(nextUrl.searchParams.get("limit"), "3");
  assert.equal(nextUrl.searchParams.get("cursor"), body.nextCursor);
  const second = await get(nextUrl.pathname + nextUrl.search);
  assert.equal(second.status, 200);
  assert.match(second.headers.get("link"), /rel="next".*rel="prev"/);
  // Walk with Link headers only until there is no rel="next".
  let url = "/api/items?status=open&limit=7";
  const ids = [];
  for (let i = 0; i < 20 && url; i++) {
    const response = await get(url);
    ids.push(...(await response.json()).items.map((r) => r.id));
    const next = /<([^>]+)>; rel="next"/.exec(response.headers.get("link") ?? "");
    url = next ? new URL(next[1]).pathname + new URL(next[1]).search : null;
  }
  assert.equal(ids.length, new Set(ids).size);
  assert.equal(ids.length, makeRows().filter((r) => r.status === "open").length);
  const clamped = await (await get("/api/items?limit=500")).json();
  assert.equal(clamped.limit, 25);
});

test("HTTP: cursor errors, cross-tenant reuse, bad limits and bad filters map to statuses; 401 without scope", async () => {
  const { get } = httpSetup();
  const body = await (await get("/api/items?status=open&limit=2")).json();
  const cross = await get(`/api/items?status=open&cursor=${body.nextCursor}`, "t2");
  assert.equal(cross.status, 400);
  assert.equal((await cross.json()).error, "scope-mismatch");
  const otherFilter = await get(`/api/items?status=archived&cursor=${body.nextCursor}`);
  assert.equal((await otherFilter.json()).error, "scope-mismatch");
  assert.equal((await (await get("/api/items?cursor=garbage")).json()).error, "malformed-cursor");
  assert.equal((await get("/api/items?limit=abc")).status, 400);
  assert.equal((await (await get("/api/items?status=deleted")).json()).error, "invalid-filter");
  assert.equal((await (await get("/api/items?score=high")).json()).error, "invalid-filter");
  assert.equal((await (await get("/api/items?status=open&status=archived")).json()).error, "invalid-filter", "repeated single-value filter");
  assert.equal((await get("/api/items", null)).status, 401);
  assert.equal((await get("/api/items", "t1", { method: "POST" })).status, 405);
  assert.equal((await get("/api/other")).status, 404);
  assert.equal((await get("/api/itemsx")).status, 404);
  // Unknown query parameters are ignored, not bound.
  assert.equal((await get("/api/items?_=123")).status, 200);
});

test("HTTP: routes, statusFor, parameter names, linkHeader and publicOrigin can be overridden", async () => {
  const { get } = httpSetup({
    prefix: "/v2/", routes: { list: "/widgets" }, statusFor: { "expired-cursor": 410, "scope-mismatch": 403 },
    params: { cursor: "page_token", limit: "page_size" }, publicOrigin: "https://public.example.com",
    pager: setup({ options: { ttlMs: 1000 } }).pager,
  });
  assert.equal((await get("/api/items")).status, 404);
  const first = await get("/v2/widgets?page_size=2");
  assert.equal(first.status, 200);
  const body = await first.json();
  assert.equal(body.items.length, 2);
  const link = first.headers.get("link");
  assert.ok(link.startsWith("<https://public.example.com/v2/widgets?page_size=2&page_token="), link);
  const cross = await get(`/v2/widgets?page_token=${body.nextCursor}`, "t2");
  assert.equal(cross.status, 403);

  const expiring = setup({ options: { ttlMs: 1000 } });
  const handler = createKeysetListHandler({
    pager: expiring.pager, prefix: "/v2", routes: { list: "/widgets" }, statusFor: { "expired-cursor": 410 },
    scope: () => ({ tenantId: "t1" }), linkHeader: false,
  });
  const page = await handler(new Request("https://api.example.com/v2/widgets?limit=2"));
  assert.equal(page.headers.get("link"), null);
  const { nextCursor } = await page.json();
  expiring.advance(1000);
  const expired = await handler(new Request(`https://api.example.com/v2/widgets?cursor=${nextCursor}`));
  assert.equal(expired.status, 410);
  assert.equal((await expired.json()).error, "expired-cursor");
  // Defaults when nothing is overridden.
  const defaults = createKeysetListHandler({ pager: expiring.pager, scope: () => ({ tenantId: "t1" }) });
  assert.equal((await defaults(new Request("https://api.example.com/"))).status, 200);
});
