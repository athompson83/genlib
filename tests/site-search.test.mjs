// SPDX-License-Identifier: Apache-2.0
// site-search with the in-memory inverted index: query syntax, tokenizer, BM25, field weights, filters, facets,
// paging, tenant isolation, visibility, highlights, injection-shaped input and the HTTP adapter.
import assert from "node:assert/strict";
import test from "node:test";
import { SearchError, createSearch, parseQuery, tokenize, renderHighlight } from "../.build/modules/site-search/files/core.js";
import { MemorySearchStore, stem } from "../.build/modules/site-search/files/memory-store.js";
import { createSearchHandler } from "../.build/modules/site-search/files/http.js";

// alice and bob index and search acme; sam also sees staff-only documents; reader may only search; eve is globex.
async function authorize(actor, action, tenantId) {
  if (actor.userId === "eve") return tenantId === "globex";
  if (tenantId !== "acme") return false;
  if (actor.userId === "reader") return action === "search";
  if (actor.userId === "sam") return action === "search" ? ["staff", "user:sam"] : true;
  return actor.userId === "alice" || actor.userId === "bob";
}
const alice = { userId: "alice" }, sam = { userId: "sam" }, reader = { userId: "reader" }, eve = { userId: "eve" };
const filters = { category: "keyword", price: "number", inStock: "boolean", publishedAt: "date" };

const PRODUCTS = [
  { id: "p1", fields: { title: "Trail running shoes", body: "Lightweight shoes for running on rocky trails." }, attrs: { category: "shoes", price: 120, inStock: true, publishedAt: "2026-01-10" } },
  { id: "p2", fields: { title: "Road running shoes", body: "Cushioned shoes for road races and daily training." }, attrs: { category: ["shoes"], price: 90, inStock: false, publishedAt: "2026-03-01" } },
  { id: "p3", fields: { title: "Waterproof hiking boots", body: "Boots for wet trails and snow." }, attrs: { category: "boots", price: 150, inStock: true } },
  { id: "p4", fields: { title: "Crème brûlée café guide", body: "Where to find the best café near the trail." }, attrs: { category: ["guides", "food"], price: 0, inStock: true } },
  { id: "p5", fields: { title: "Running socks", body: "Merino socks for long runs." }, attrs: { category: "socks", price: 15, inStock: true } },
  { id: "p6", fields: { title: "Internal shoes pricing", body: "Staff only notes about shoes margins." }, attrs: { category: "shoes", price: 1 }, visibility: ["staff"] },
];

async function setup(extra = {}) {
  let now = 1_000_000;
  const store = new MemorySearchStore();
  const search = createSearch({ store, authorize, fields: { title: "A", body: "C" }, filters, now: () => ++now, ...extra });
  for (const doc of PRODUCTS) await search.index(alice, { tenantId: "acme", ...doc });
  await search.index(eve, { tenantId: "globex", id: "g1", fields: { title: "Running shoes from globex" }, attrs: { category: "shoes" } });
  return { store, search };
}
const ids = (result) => result.hits.map((hit) => hit.id);
const sorted = (result) => ids(result).sort();
const code = (expected) => (error) => error instanceof SearchError && error.code === expected;

test("tokenizer folds accents and case; Porter-lite stems plurals, -ing and -ed", () => {
  assert.deepEqual(tokenize("Crème BRÛLÉE, café!").map((t) => t.text), ["creme", "brulee", "cafe"]);
  assert.deepEqual(tokenize("ﬁle ½").map((t) => t.text), ["file", "1", "2"]);
  const text = "Héllo wörld";
  const [first] = tokenize(text);
  assert.equal(text.slice(first.start, first.end), "Héllo", "offsets point into the original text");
  const cases = { stories: "story", boxes: "box", classes: "class", cats: "cat", status: "status", running: "run", making: "make",
    indexed: "index", searching: "search", falling: "fall", races: "race", need: "need", agreed: "agree", bus: "bus", string: "string" };
  for (const [word, expected] of Object.entries(cases)) assert.equal(stem(word), expected, word);
});

test("query parser: words, phrases, exclusions and a prefix on the last word only", () => {
  assert.deepEqual(parseQuery('shoes "road running" -cheap sho*'), [
    { kind: "word", word: "shoes", prefix: false, exclude: false },
    { kind: "phrase", words: ["road", "running"], exclude: false },
    { kind: "word", word: "cheap", prefix: false, exclude: true },
    { kind: "word", word: "sho", prefix: true, exclude: false },
  ]);
  assert.deepEqual(parseQuery("ab* cd"), [{ kind: "word", word: "ab", prefix: false, exclude: false }, { kind: "word", word: "cd", prefix: false, exclude: false }]);
  assert.deepEqual(parseQuery('-"wet snow" e-mail'), [{ kind: "phrase", words: ["wet", "snow"], exclude: true }, { kind: "phrase", words: ["e", "mail"], exclude: false }]);
  assert.deepEqual(parseQuery("&|!:*() ' \" "), []);
  assert.deepEqual(parseQuery("'); drop table search_documents; --"), [
    { kind: "word", word: "drop", prefix: false, exclude: false },
    { kind: "word", word: "table", prefix: false, exclude: false },
    { kind: "phrase", words: ["search", "documents"], exclude: false },
  ]);
  assert.throws(() => parseQuery("x".repeat(257)), code("invalid-query"));
  assert.throws(() => parseQuery(Array.from({ length: 17 }, (_, i) => `w${i}`).join(" ")), code("invalid-query"));
});

test("AND, phrase, exclusion and prefix", async () => {
  const { search } = await setup();
  assert.deepEqual(sorted(await search.query(alice, { tenantId: "acme", q: "running shoes" })), ["p1", "p2"]);
  assert.deepEqual(ids(await search.query(alice, { tenantId: "acme", q: '"road running"' })), ["p2"]);
  assert.deepEqual(ids(await search.query(alice, { tenantId: "acme", q: '"running road"' })), []);
  assert.deepEqual(ids(await search.query(alice, { tenantId: "acme", q: "shoes -road" })), ["p1"]);
  assert.deepEqual(sorted(await search.query(alice, { tenantId: "acme", q: "-shoes" })), ["p3", "p4", "p5"], "exclusions alone filter");
  assert.deepEqual(sorted(await search.query(alice, { tenantId: "acme", q: 'running -"road races"' })), ["p1", "p5"]);
  assert.deepEqual(ids(await search.query(alice, { tenantId: "acme", q: "boo*" })), ["p3"]);
  assert.deepEqual(ids(await search.query(alice, { tenantId: "acme", q: "wet wat*" })), ["p3"]);
  assert.deepEqual(sorted(await search.query(alice, { tenantId: "acme", q: "sho*" })), ["p1", "p2"]);
  assert.deepEqual(ids(await search.query(alice, { tenantId: "acme", q: "boo" })), [], "without * a partial word does not match");
});

test("accent folding and stemming", async () => {
  const { search } = await setup();
  assert.deepEqual(ids(await search.query(alice, { tenantId: "acme", q: "creme brulee" })), ["p4"]);
  assert.deepEqual(ids(await search.query(alice, { tenantId: "acme", q: "CAFÉ" })), ["p4"]);
  assert.deepEqual(ids(await search.query(alice, { tenantId: "acme", q: "boot" })), ["p3"]);
  assert.deepEqual(ids(await search.query(alice, { tenantId: "acme", q: "train race" })), ["p2"]);
  assert.deepEqual(sorted(await search.query(alice, { tenantId: "acme", q: "trail" })), ["p1", "p3", "p4"]);
});

test("BM25 order and scores on a small known corpus", async () => {
  const store = new MemorySearchStore();
  const search = createSearch({ store, authorize, fields: { body: "A" }, now: () => 1 });
  const corpus = { d1: "apple banana", d2: "apple apple cherry", d3: "banana cherry date egg" };
  for (const [id, body] of Object.entries(corpus)) await search.index(alice, { tenantId: "acme", id, fields: { body } });
  const bm25 = (tf, dl, n, N, avg) => Math.log(1 + (N - n + 0.5) / (n + 0.5)) * (tf * 2.2) / (tf + 1.2 * (0.25 + 0.75 * dl / avg));
  const apple = await search.query(alice, { tenantId: "acme", q: "apple" });
  assert.deepEqual(ids(apple), ["d2", "d1"], "two occurrences beat one");
  assert.ok(Math.abs(apple.hits[0].score - bm25(2, 3, 2, 3, 3)) < 1e-12);
  assert.ok(Math.abs(apple.hits[1].score - bm25(1, 2, 2, 3, 3)) < 1e-12);
  const banana = await search.query(alice, { tenantId: "acme", q: "banana" });
  assert.deepEqual(ids(banana), ["d1", "d3"], "the shorter document ranks first at equal frequency");
  const both = await search.query(alice, { tenantId: "acme", q: "cherry egg" });
  assert.ok(Math.abs(both.hits[0].score - (bm25(1, 4, 2, 3, 3) + bm25(1, 4, 1, 3, 3))) < 1e-12, "rarer terms add more");
});

test("field weights change the order", async () => {
  for (const [weights, expected] of [[{ title: "A", body: "C" }, ["w1", "w2"]], [{ title: "D", body: "A" }, ["w2", "w1"]]]) {
    const search = createSearch({ store: new MemorySearchStore(), authorize, fields: weights });
    await search.index(alice, { tenantId: "acme", id: "w1", fields: { title: "apple", body: "banana" } });
    await search.index(alice, { tenantId: "acme", id: "w2", fields: { title: "banana", body: "apple" } });
    assert.deepEqual(ids(await search.query(alice, { tenantId: "acme", q: "apple" })), expected);
  }
});

test("keyword, range, date and boolean filters; undeclared filters and attributes are rejected", async () => {
  const { search } = await setup();
  const q = (filters, extra = {}) => search.query(alice, { tenantId: "acme", filters, ...extra }).then(sorted);
  assert.deepEqual(await q({ category: ["boots", "socks"] }), ["p3", "p5"]);
  assert.deepEqual(await q({ category: "food" }), ["p4"]);
  assert.deepEqual(await q({ price: { gte: 50, lte: 130 } }), ["p1", "p2"]);
  assert.deepEqual(await q({ price: { gt: 90 } }), ["p1", "p3"]);
  assert.deepEqual(await q({ inStock: false }), ["p2"]);
  assert.deepEqual(await q({ publishedAt: { gte: "2026-02-01" } }), ["p2"]);
  assert.deepEqual(await q({ category: "shoes", inStock: true }, { q: "running" }), ["p1"]);
  await assert.rejects(q({ color: "red" }), code("invalid-filter"));
  await assert.rejects(q({ "category') OR 1=1 --": "x" }), code("invalid-filter"));
  await assert.rejects(q({ price: "cheap" }), code("invalid-filter"));
  await assert.rejects(q({ price: { gte: "lots" } }), code("invalid-filter"));
  await assert.rejects(q({ inStock: "yes" }), code("invalid-filter"));
  await assert.rejects(search.index(alice, { tenantId: "acme", id: "x", fields: { title: "x" }, attrs: { color: "red" } }), code("invalid-attr"));
  await assert.rejects(search.index(alice, { tenantId: "acme", id: "x", fields: { summary: "x" } }), code("invalid-field"));
  await assert.rejects(search.index(alice, { tenantId: "acme", id: "x", fields: { title: "x" }, attrs: { price: "free" } }), code("invalid-attr"));
});

test("facet counts over the filtered set", async () => {
  const { search } = await setup();
  const all = await search.query(alice, { tenantId: "acme", facets: ["category", "inStock"] });
  assert.equal(all.total, 5);
  assert.deepEqual(all.facets.category, [
    { value: "shoes", count: 2 }, { value: "boots", count: 1 }, { value: "food", count: 1 }, { value: "guides", count: 1 }, { value: "socks", count: 1 },
  ]);
  assert.deepEqual(all.facets.inStock, [{ value: true, count: 4 }, { value: false, count: 1 }]);
  const running = await search.query(alice, { tenantId: "acme", q: "running", facets: ["category"] });
  assert.deepEqual(running.facets.category, [{ value: "shoes", count: 2 }, { value: "socks", count: 1 }]);
  await assert.rejects(search.query(alice, { tenantId: "acme", facets: ["price"] }), code("invalid-facet"));
  await assert.rejects(search.query(alice, { tenantId: "acme", facets: ["nope"] }), code("invalid-facet"));
});

test("cursor paging returns every hit once, by relevance and by attribute", async () => {
  const { search } = await setup();
  const collect = async (input) => {
    const seen = [];
    let cursor = null;
    do {
      const page = await search.query(alice, { tenantId: "acme", limit: 2, ...input, cursor });
      assert.ok(page.hits.length <= 2);
      seen.push(...ids(page));
      cursor = page.cursor;
    } while (cursor);
    return seen;
  };
  const browse = await collect({});
  assert.deepEqual([...browse].sort(), ["p1", "p2", "p3", "p4", "p5"]);
  assert.equal(new Set(browse).size, browse.length);
  const relevance = await collect({ q: "trail*" });
  const full = ids(await search.query(alice, { tenantId: "acme", q: "trail*", limit: 50 }));
  assert.deepEqual(relevance, full);
  assert.deepEqual(await collect({ sort: "price" }), ["p4", "p5", "p2", "p1", "p3"]);
  assert.deepEqual(await collect({ sort: "-price" }), ["p3", "p1", "p2", "p5", "p4"]);
  assert.deepEqual(await collect({ sort: "-publishedAt" }), ["p2", "p1", "p3", "p4", "p5"], "documents without the attribute come last");
  const first = await search.query(alice, { tenantId: "acme", limit: 2, sort: "price" });
  await assert.rejects(search.query(alice, { tenantId: "acme", sort: "-price", cursor: first.cursor }), code("invalid-cursor"));
  await assert.rejects(search.query(alice, { tenantId: "acme", cursor: "not a cursor!" }), code("invalid-cursor"));
  await assert.rejects(search.query(alice, { tenantId: "acme", cursor: btoa('{"k":"r","v":null,"id":"x"}') }), code("invalid-cursor"));
  await assert.rejects(search.query(alice, { tenantId: "acme", sort: "category" }), code("invalid-sort"));
  await assert.rejects(search.query(alice, { tenantId: "acme", limit: 51 }), code("invalid-limit"));
});

test("tenant isolation and per-document visibility", async () => {
  const { search } = await setup();
  assert.deepEqual(ids(await search.query(eve, { tenantId: "globex", q: "running" })), ["g1"]);
  assert.ok(!ids(await search.query(alice, { tenantId: "acme", q: "globex" })).includes("g1"));
  await assert.rejects(search.query(eve, { tenantId: "acme", q: "shoes" }), code("forbidden"));
  await assert.rejects(search.index(reader, { tenantId: "acme", id: "r1", fields: { title: "x" } }), code("forbidden"));
  await assert.rejects(search.remove(eve, "acme", "p1"), code("forbidden"));
  assert.deepEqual(sorted(await search.query(alice, { tenantId: "acme", q: "shoes" })), ["p1", "p2"]);
  assert.deepEqual(sorted(await search.query(sam, { tenantId: "acme", q: "shoes" })), ["p1", "p2", "p6"]);
  assert.equal((await search.query(sam, { tenantId: "acme", facets: ["category"] })).facets.category[0].count, 3);
  await assert.rejects(search.query(alice, { tenantId: "../acme" }), code("invalid-tenant"));
  await search.remove(alice, "acme", "p1");
  assert.deepEqual(ids(await search.query(alice, { tenantId: "acme", q: "trail running" })), []);
  await assert.rejects(search.remove(alice, "acme", "p1"), code("not-found"));
  await search.index(alice, { tenantId: "acme", id: "p2", fields: { title: "Renamed item" } });
  assert.deepEqual(ids(await search.query(alice, { tenantId: "acme", q: "road" })), [], "re-indexing replaces the old text");
  assert.deepEqual(ids(await search.query(alice, { tenantId: "acme", q: "renamed" })), ["p2"]);
});

test("highlights wrap matches in caller markers and escape HTML unless raw", async () => {
  const { search } = await setup();
  await search.index(alice, { tenantId: "acme", id: "x1", fields: { title: '<script>alert("x")</script> shoes & socks', body: "Plain \u0002 text" } });
  const [hit] = (await search.query(alice, { tenantId: "acme", q: "alert" })).hits;
  assert.equal(hit.highlights.title, '&lt;script&gt;<mark>alert</mark>(&quot;x&quot;)&lt;/script&gt; shoes &amp; socks');
  assert.equal(hit.highlights.body, undefined, "fields without a match have no highlight");
  const raw = (await search.query(alice, { tenantId: "acme", q: "socks alert", highlight: { pre: "[[", post: "]]", raw: true } })).hits[0];
  assert.equal(raw.highlights.title, '<script>[[alert]]("x")</script> shoes & [[socks]]');
  const accent = (await search.query(alice, { tenantId: "acme", q: "cafe" })).hits[0];
  assert.equal(accent.highlights.title, "Crème brûlée <mark>café</mark> guide");
  const prefix = (await search.query(alice, { tenantId: "acme", q: "wat*" })).hits[0];
  assert.equal(prefix.highlights.title, "<mark>Waterproof</mark> hiking boots");
  const long = "intro ".repeat(60) + "needle " + "outro ".repeat(60);
  await search.index(alice, { tenantId: "acme", id: "x2", fields: { body: long } });
  const fragment = (await search.query(alice, { tenantId: "acme", q: "needle" })).hits[0].highlights.body;
  assert.ok(fragment.startsWith("…") && fragment.endsWith("…") && fragment.length < 260 && fragment.includes("<mark>needle</mark>"));
  assert.equal(renderHighlight("a \u0002b"), "a <mark>b</mark>", "an unclosed marker is closed");
  await assert.rejects(search.query(alice, { tenantId: "acme", q: "x", highlight: { pre: 1 } }), code("invalid-highlight"));
});

test("injection-shaped input is treated as text", async () => {
  const { search } = await setup();
  const empty = await search.query(alice, { tenantId: "acme", q: "&|!:*()", facets: ["category"] });
  assert.deepEqual(empty, { hits: [], total: 0, cursor: null, facets: { category: [] } });
  assert.deepEqual(ids(await search.query(alice, { tenantId: "acme", q: "'); drop table search_documents; --" })), []);
  assert.deepEqual(ids(await search.query(alice, { tenantId: "acme", q: "shoes')|(!road" })), [], "one bare word is a phrase, not operators");
  assert.deepEqual(ids(await search.query(alice, { tenantId: "acme", filters: { category: "shoes\"]}' OR '1'='1" } })), []);
  await search.index(alice, { tenantId: "acme", id: "inj", fields: { title: "'); DROP TABLE x; -- &|!:*()" } });
  assert.deepEqual(ids(await search.query(alice, { tenantId: "acme", q: "drop" })), ["inj"]);
});

test("HTTP adapter: search, index and delete routes, origin check, 401 and no-store", async () => {
  const { search } = await setup();
  const users = { "t-alice": alice, "t-reader": reader };
  const handler = createSearchHandler({
    search, prefix: "/api/search", allowedOrigins: ["https://app.example"],
    authenticate: async (request) => users[(request.headers.get("authorization") ?? "").replace("Bearer ", "")] ?? null,
  });
  const call = (method, path, { token = "t-alice", origin = "https://app.example", body } = {}) => handler(new Request(`https://app.example${path}`, {
    method,
    headers: { authorization: `Bearer ${token}`, origin, ...(body === undefined ? {} : { "content-type": "application/json" }) },
    ...(body === undefined ? {} : { body: typeof body === "string" ? body : JSON.stringify(body) }),
  }));

  const get = await call("GET", "/api/search?tenantId=acme&q=running&f.category=shoes&f.category=socks&f.price=10..100&facets=category,inStock&limit=5");
  assert.equal(get.status, 200);
  assert.equal(get.headers.get("cache-control"), "no-store");
  const body = await get.json();
  assert.deepEqual(body.hits.map((hit) => hit.id).sort(), ["p2", "p5"]);
  assert.equal(body.total, 2);
  assert.deepEqual(body.facets.inStock, [{ value: false, count: 1 }, { value: true, count: 1 }]);
  assert.match(body.hits.find((hit) => hit.id === "p5").highlights.title, /<mark>Running<\/mark> socks/);
  const ranges = await (await call("GET", "/api/search?tenantId=acme&f.price=100..&f.inStock=true&sort=-price")).json();
  assert.deepEqual(ranges.hits.map((hit) => hit.id), ["p3", "p1"]);
  const dated = await (await call("GET", "/api/search?tenantId=acme&f.publishedAt=..2026-02-01")).json();
  assert.deepEqual(dated.hits.map((hit) => hit.id), ["p1"]);
  const paged = await (await call("GET", "/api/search?tenantId=acme&limit=2&sort=price")).json();
  const next = await (await call("GET", `/api/search?tenantId=acme&limit=2&sort=price&cursor=${paged.cursor}`)).json();
  assert.deepEqual(next.hits.map((hit) => hit.id), ["p2", "p1"]);
  assert.equal((await call("GET", "/api/search?tenantId=acme&f.color=red")).status, 400);
  assert.deepEqual(await (await call("GET", "/api/search?tenantId=acme&f.color=red")).json(), { error: "invalid-filter", message: "Undeclared filter color" });
  assert.equal((await call("GET", "/api/search?tenantId=acme&limit=abc")).status, 400);
  assert.equal((await call("GET", "/api/search?tenantId=acme", { token: "nobody" })).status, 401);
  assert.equal((await call("GET", "/api/search?tenantId=globex")).status, 403);

  const put = await call("PUT", "/api/search/n1", { body: { tenantId: "acme", fields: { title: "New trail map" }, attrs: { category: "maps" } } });
  assert.equal(put.status, 200);
  assert.equal((await put.json()).id, "n1");
  assert.deepEqual((await (await call("GET", "/api/search?tenantId=acme&q=map")).json()).hits.map((hit) => hit.id), ["n1"]);
  assert.equal((await call("PUT", "/api/search/n1", { origin: "https://evil.example", body: { tenantId: "acme", fields: {} } })).status, 403);
  assert.equal((await call("PUT", "/api/search/n1", { token: "t-reader", body: { tenantId: "acme", fields: { title: "x" } } })).status, 403);
  assert.equal((await call("PUT", "/api/search/n1", { body: "{not json" })).status, 400);
  assert.equal((await call("PUT", "/api/search/n1", { body: { tenantId: "acme", fields: { title: "x".repeat(300_000) } } })).status, 400);
  assert.equal((await call("PUT", "/api/search/bad%20id", { body: { tenantId: "acme", fields: {} } })).status, 404);
  assert.equal((await call("POST", "/api/search", { body: {} })).status, 405);
  assert.equal((await call("DELETE", "/api/search/n1?tenantId=acme", { origin: "" })).status, 403);
  const del = await call("DELETE", "/api/search/n1?tenantId=acme");
  assert.equal(del.status, 200);
  assert.deepEqual(await del.json(), { removed: true });
  assert.equal((await call("DELETE", "/api/search/n1?tenantId=acme")).status, 404);
  assert.equal((await call("GET", "/api/other")).status, 404);
});
