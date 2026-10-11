// SPDX-License-Identifier: Apache-2.0
// site-search on real PostgreSQL full-text search (PGlite, Postgres compiled to WASM): schema.sql applies, and the
// SQL store passes query syntax, accent folding, stemming, field weights, filters, facets, keyset paging, tenant
// isolation, visibility, highlight escaping and injection-shaped input. Concurrent upserts of one document leave
// one row holding the newest write.
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { SearchError, createSearch, parseQuery } from "../.build/modules/site-search/files/core.js";
import { buildTsQuery, createSqlSearchStore } from "../.build/modules/site-search/files/sql-store.js";
import { createSearchHandler } from "../.build/modules/site-search/files/http.js";

const schema = readFileSync(new URL("../modules/site-search/files/schema.sql", import.meta.url), "utf8");
async function authorize(actor, action, tenantId) {
  if (actor.userId === "eve") return tenantId === "globex";
  if (tenantId !== "acme") return false;
  if (actor.userId === "reader") return action === "search";
  if (actor.userId === "sam") return action === "search" ? ["staff", "user:sam"] : true;
  return actor.userId === "alice";
}
const alice = { userId: "alice" }, sam = { userId: "sam" }, eve = { userId: "eve" };
const filters = { category: "keyword", price: "number", inStock: "boolean", publishedAt: "date" };
const PRODUCTS = [
  { id: "p1", fields: { title: "Trail running shoes", body: "Lightweight shoes for running on rocky trails." }, attrs: { category: "shoes", price: 120, inStock: true, publishedAt: "2026-01-10" } },
  { id: "p2", fields: { title: "Road running shoes", body: "Cushioned shoes for road races and daily training." }, attrs: { category: ["shoes"], price: 90, inStock: false, publishedAt: "2026-03-01" } },
  { id: "p3", fields: { title: "Waterproof hiking boots", body: "Boots for wet trails and snow." }, attrs: { category: "boots", price: 150, inStock: true } },
  { id: "p4", fields: { title: "Crème brûlée café guide", body: "Where to find the best café near the trail." }, attrs: { category: ["guides", "food"], price: 0, inStock: true } },
  { id: "p5", fields: { title: "Running socks", body: "Merino socks for long runs." }, attrs: { category: "socks", price: 15, inStock: true } },
  { id: "p6", fields: { title: "Internal shoes pricing", body: "Staff only notes about shoes margins." }, attrs: { category: "shoes", price: 1 }, visibility: ["staff"] },
];

async function setup({ fields = { title: "A", body: "C" }, seed = true } = {}) {
  const db = new PGlite();
  await db.exec(schema);
  let now = 1_000_000;
  const store = createSqlSearchStore({ query: (text, params) => db.query(text, params) }, { config: "english" });
  const search = createSearch({ store, authorize, fields, filters, now: () => ++now });
  if (seed) {
    for (const doc of PRODUCTS) await search.index(alice, { tenantId: "acme", ...doc });
    await search.index(eve, { tenantId: "globex", id: "g1", fields: { title: "Running shoes from globex" }, attrs: { category: "shoes" } });
  }
  return { db, store, search };
}
const ids = (result) => result.hits.map((hit) => hit.id);
const sorted = (result) => ids(result).sort();
const code = (expected) => (error) => error instanceof SearchError && error.code === expected;

test("schema applies; documents are stored with weighted tsvectors and normalized attributes", async () => {
  const { db } = await setup();
  const row = (await db.query("SELECT tsv::text AS tsv, attrs, fields, visibility, updated_at FROM search_documents WHERE tenant_id = 'acme' AND id = 'p4'")).rows[0];
  assert.match(row.tsv, /'cafe':3A,\d+C/);
  assert.deepEqual(row.attrs, { category: ["guides", "food"], price: 0, inStock: true });
  assert.equal(row.fields.title, "Crème brûlée café guide", "original text is kept");
  assert.deepEqual((await db.query("SELECT visibility FROM search_documents WHERE id = 'p6'")).rows[0].visibility, ["staff"]);
  const indexes = (await db.query("SELECT indexname FROM pg_indexes WHERE tablename = 'search_documents' ORDER BY 1")).rows.map((r) => r.indexname);
  assert.deepEqual(indexes, ["search_documents_attrs", "search_documents_pkey", "search_documents_tsv"]);
  assert.throws(() => createSqlSearchStore({ query: async () => ({ rows: [] }) }, { config: "english", table: "x; drop table y" }), RangeError);
  assert.throws(() => createSqlSearchStore({ query: async () => ({ rows: [] }) }, { config: "german'" }), RangeError);
});

test("tsquery text is built from escaped lexemes only", () => {
  assert.equal(buildTsQuery(parseQuery('shoes "road running" -cheap sho*')), "'shoes' & ('road' <-> 'running') & !'cheap' & 'sho':*");
  assert.equal(buildTsQuery([{ kind: "word", word: "it's\\", prefix: false, exclude: false }]), "'it''s\\\\'");
  assert.equal(buildTsQuery(parseQuery("&|!:*()")), "");
});

test("AND, phrase, exclusion and prefix", async () => {
  const { search } = await setup();
  const q = (text) => search.query(alice, { tenantId: "acme", q: text });
  assert.deepEqual(sorted(await q("running shoes")), ["p1", "p2"]);
  assert.deepEqual(ids(await q('"road running"')), ["p2"]);
  assert.deepEqual(ids(await q('"running road"')), []);
  assert.deepEqual(ids(await q("shoes -road")), ["p1"]);
  assert.deepEqual(sorted(await q("-shoes")), ["p3", "p4", "p5"], "exclusions alone filter");
  assert.deepEqual(sorted(await q('running -"road races"')), ["p1", "p5"]);
  assert.deepEqual(ids(await q("boo*")), ["p3"]);
  assert.deepEqual(ids(await q("wet wat*")), ["p3"]);
  assert.deepEqual(sorted(await q("sho*")), ["p1", "p2"]);
  assert.deepEqual(ids(await q("boo")), []);
});

test("accent folding and stemming", async () => {
  const { search } = await setup();
  const q = (text) => search.query(alice, { tenantId: "acme", q: text });
  assert.deepEqual(ids(await q("creme brulee")), ["p4"]);
  assert.deepEqual(ids(await q("CAFÉ")), ["p4"]);
  assert.deepEqual(ids(await q("boot")), ["p3"]);
  assert.deepEqual(ids(await q("train race")), ["p2"]);
  assert.deepEqual(sorted(await q("trail")), ["p1", "p3", "p4"]);
});

test("field weights change the order (ts_rank_cd)", async () => {
  for (const [fields, expected] of [[{ title: "A", body: "C" }, ["w1", "w2"]], [{ title: "D", body: "A" }, ["w2", "w1"]]]) {
    const { search } = await setup({ fields, seed: false });
    await search.index(alice, { tenantId: "acme", id: "w1", fields: { title: "apple", body: "banana" } });
    await search.index(alice, { tenantId: "acme", id: "w2", fields: { title: "banana", body: "apple" } });
    const result = await search.query(alice, { tenantId: "acme", q: "apple" });
    assert.deepEqual(ids(result), expected);
    assert.ok(result.hits[0].score > result.hits[1].score);
  }
});

test("keyword, range, date and boolean filters with containment and bound parameters", async () => {
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
  assert.deepEqual(await q({ category: "shoes\"]}' OR '1'='1" }), []);
});

test("facet counts are grouped counts over the filtered set", async () => {
  const { search } = await setup();
  const all = await search.query(alice, { tenantId: "acme", facets: ["category", "inStock"] });
  assert.equal(all.total, 5);
  assert.deepEqual(all.facets.category, [
    { value: "shoes", count: 2 }, { value: "boots", count: 1 }, { value: "food", count: 1 }, { value: "guides", count: 1 }, { value: "socks", count: 1 },
  ]);
  assert.deepEqual(all.facets.inStock, [{ value: true, count: 4 }, { value: false, count: 1 }]);
  const running = await search.query(alice, { tenantId: "acme", q: "running", facets: ["category"] });
  assert.deepEqual(running.facets.category, [{ value: "shoes", count: 2 }, { value: "socks", count: 1 }]);
  assert.equal((await search.query(sam, { tenantId: "acme", facets: ["category"] })).facets.category[0].count, 3);
});

test("keyset paging on (score, id) and (attribute, id) returns every hit once", async () => {
  const { search } = await setup();
  for (let i = 0; i < 12; i++) {
    await search.index(alice, { tenantId: "acme", id: `t${String(i).padStart(2, "0")}`, fields: { title: i % 3 === 0 ? "tent tent" : "tent", body: "camping" } });
  }
  const collect = async (input) => {
    const seen = [];
    let cursor = null;
    do {
      const page = await search.query(alice, { tenantId: "acme", limit: 5, ...input, cursor });
      seen.push(...ids(page));
      cursor = page.cursor;
    } while (cursor);
    return seen;
  };
  const tents = await collect({ q: "tent" });
  assert.equal(tents.length, 12);
  assert.equal(new Set(tents).size, 12, "no duplicates across pages with tied scores");
  assert.deepEqual(tents, ids(await search.query(alice, { tenantId: "acme", q: "tent", limit: 50 })));
  assert.deepEqual(tents.slice(0, 4), ["t00", "t03", "t06", "t09"], "higher scores first, ties by id");
  const browse = await collect({ filters: { price: { gte: 0 } }, sort: "price" });
  assert.deepEqual(browse, ["p4", "p5", "p2", "p1", "p3"]);
  assert.deepEqual(await collect({ sort: "-publishedAt", q: "running" }), ["p2", "p1", "p5"], "missing values come last");
  const everything = await collect({ sort: "-price" });
  assert.equal(everything.length, 17);
  assert.deepEqual(everything.slice(0, 5), ["p3", "p1", "p2", "p5", "p4"]);
});

test("tenant isolation and per-document visibility", async () => {
  const { search } = await setup();
  assert.deepEqual(ids(await search.query(eve, { tenantId: "globex", q: "running" })), ["g1"]);
  assert.deepEqual(ids(await search.query(alice, { tenantId: "acme", q: "globex" })), []);
  await assert.rejects(search.query(eve, { tenantId: "acme", q: "shoes" }), code("forbidden"));
  assert.deepEqual(sorted(await search.query(alice, { tenantId: "acme", q: "shoes" })), ["p1", "p2"]);
  assert.deepEqual(sorted(await search.query(sam, { tenantId: "acme", q: "shoes" })), ["p1", "p2", "p6"]);
  await assert.rejects(search.remove(eve, "acme", "p1"), code("forbidden"));
  await search.remove(alice, "acme", "p1");
  await assert.rejects(search.remove(alice, "acme", "p1"), code("not-found"));
  await assert.rejects(search.remove(eve, "globex", "p2"), code("not-found"), "ids are per tenant");
  await search.index(alice, { tenantId: "acme", id: "p2", fields: { title: "Renamed item" } });
  assert.deepEqual(ids(await search.query(alice, { tenantId: "acme", q: "road" })), []);
  assert.deepEqual(ids(await search.query(alice, { tenantId: "acme", q: "renamed" })), ["p2"]);
});

test("ts_headline highlights use caller markers and escaped text", async () => {
  const { search } = await setup();
  await search.index(alice, { tenantId: "acme", id: "x1", fields: { title: 'a < b & "x" > alert shoes & socks' } });
  const [hit] = (await search.query(alice, { tenantId: "acme", q: "alert" })).hits;
  assert.equal(hit.highlights.title, 'a &lt; b &amp; &quot;x&quot; &gt; <mark>alert</mark> shoes &amp; socks');
  assert.equal(hit.highlights.body, undefined);
  const raw = (await search.query(alice, { tenantId: "acme", q: "socks alert", highlight: { pre: "[[", post: "]]", raw: true } })).hits[0];
  assert.equal(raw.highlights.title, 'a < b & "x" > [[alert]] shoes & [[socks]]');
  // Markup-like text is indexed and highlighted as text (PostgreSQL would otherwise skip tags and <script> bodies).
  await search.index(alice, { tenantId: "acme", id: "x2", fields: { title: '<script>beacon("x")</script> \uE000' } });
  const tagged = (await search.query(alice, { tenantId: "acme", q: "beacon" })).hits[0].highlights.title;
  assert.equal(tagged, '&lt;script&gt;<mark>beacon</mark>(&quot;x&quot;)&lt;/script&gt;  ');
  const accent = (await search.query(alice, { tenantId: "acme", q: "café" })).hits[0];
  assert.equal(accent.highlights.title, "Creme brulee <mark>cafe</mark> guide", "PostgreSQL highlights the accent-folded text");
  const prefix = (await search.query(alice, { tenantId: "acme", q: "wat*" })).hits[0];
  assert.equal(prefix.highlights.title, "<mark>Waterproof</mark> hiking boots");
});

test("injection-shaped input is treated as text", async () => {
  const { db, search } = await setup();
  const before = (await db.query("SELECT count(*)::int AS n FROM search_documents")).rows[0].n;
  for (const q of ["'); drop table search_documents; --", "&|!:*()", "a:* | b & !c", "\\' OR 1=1 --", "x'::tsquery", "((", "!!"]) {
    const result = await search.query(alice, { tenantId: "acme", q, facets: ["category"], sort: "-price" });
    assert.ok(Array.isArray(result.hits), q);
  }
  assert.deepEqual(await search.query(alice, { tenantId: "acme", q: "&|!:*()" }), { hits: [], total: 0, cursor: null, facets: {} });
  await search.index(alice, { tenantId: "acme", id: "inj", fields: { title: "'); DROP TABLE x; -- &|!:*()" }, attrs: { category: "'); drop table search_documents; --" } });
  assert.deepEqual(ids(await search.query(alice, { tenantId: "acme", q: "drop" })), ["inj"]);
  assert.deepEqual(ids(await search.query(alice, { tenantId: "acme", filters: { category: "'); drop table search_documents; --" } })), ["inj"]);
  assert.equal((await db.query("SELECT count(*)::int AS n FROM search_documents")).rows[0].n, before + 1, "the table is intact");
});

test("concurrent upserts of one document leave one row with the newest write; stale writes are ignored", async () => {
  const { db, store, search } = await setup({ seed: false });
  const results = await Promise.all(Array.from({ length: 20 }, (_, i) =>
    search.index(alice, { tenantId: "acme", id: "same", fields: { title: `version ${i}` } })));
  const newest = Math.max(...results.map((r) => r.updatedAt));
  const rows = (await db.query("SELECT updated_at, fields FROM search_documents WHERE id = 'same'")).rows;
  assert.equal(rows.length, 1);
  assert.equal(Number(rows[0].updated_at), newest);
  await store.upsert({ tenantId: "acme", id: "same", fields: { title: "stale" }, attrs: {}, visibility: [], updatedAt: 5 }, search.schema);
  assert.notEqual((await db.query("SELECT fields FROM search_documents WHERE id = 'same'")).rows[0].fields.title, "stale");
});

test("HTTP adapter over the SQL store", async () => {
  const { search } = await setup();
  const handler = createSearchHandler({ search, prefix: "/api/search", allowedOrigins: ["https://app.example"], authenticate: async () => alice });
  const response = await handler(new Request("https://app.example/api/search?tenantId=acme&q=sho*&f.price=..100&facets=category"));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  const body = await response.json();
  assert.deepEqual(body.hits.map((hit) => hit.id), ["p2"]);
  assert.deepEqual(body.facets.category, [{ value: "shoes", count: 1 }]);
  const put = await handler(new Request("https://app.example/api/search/n1", {
    method: "PUT", headers: { origin: "https://app.example", "content-type": "application/json" },
    body: JSON.stringify({ tenantId: "acme", fields: { title: "Trail map" }, attrs: { price: 5 } }),
  }));
  assert.equal(put.status, 200);
  const del = await handler(new Request("https://app.example/api/search/n1?tenantId=acme", { method: "DELETE", headers: { origin: "https://app.example" } }));
  assert.equal(del.status, 200);
});
