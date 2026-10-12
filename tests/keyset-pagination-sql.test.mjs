// SPDX-License-Identifier: Apache-2.0
// keyset-pagination on real PostgreSQL semantics (PGlite): schema.sql applies, the generated SQL is parameterized
// keyset (no OFFSET) and uses the index, multi-column mixed ASC/DESC walks return every row exactly once, cursors
// stay bound to the tenant and filters, and inserts/deletes between pages cause no duplicates or skips.
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { createKeysetPager, KeysetError } from "../.build/modules/keyset-pagination/files/core.js";
import { buildKeysetQuery, createSqlKeysetSource } from "../.build/modules/keyset-pagination/files/sql-store.js";

const schema = readFileSync(new URL("../modules/keyset-pagination/files/schema.sql", import.meta.url), "utf8");
const KEY = { id: "k1", secret: new Uint8Array(32).fill(3) };
const SORTS = {
  newest: [
    { key: "createdAt", column: "created_at", direction: "desc", type: "number" },
    { key: "id", direction: "desc", type: "string", unique: true },
  ],
  score: [
    { key: "score", direction: "asc", type: "number" },
    { key: "createdAt", column: "created_at", direction: "desc", type: "number" },
    { key: "id", direction: "asc", type: "string", unique: true },
  ],
};
const code = (expected) => (error) => error instanceof KeysetError && error.code === expected;

async function setup() {
  const db = new PGlite();
  await db.exec(schema);
  const insert = (row) => db.query(
    "INSERT INTO keyset_example_items (id, tenant_id, status, score, created_at, title) VALUES ($1, $2, $3, $4, $5, $6)",
    [row.id, row.tenantId, row.status, row.score, row.createdAt, row.title],
  );
  for (const tenant of ["t1", "t2"]) {
    for (let i = 0; i < (tenant === "t1" ? 53 : 9); i++) {
      await insert({ id: `${tenant}-${String(i).padStart(3, "0")}`, tenantId: tenant, status: i % 3 ? "open" : "archived", score: i % 4, createdAt: 1000 + Math.floor(i / 6), title: `row ${i}` });
    }
  }
  const statements = [];
  const executor = { query: (text, params) => { statements.push({ text, params }); return db.query(text, params); } };
  const source = createSqlKeysetSource(executor, {
    table: "keyset_example_items", columns: ["id", "tenant_id", "status", "score", "created_at", "title"],
    scopeColumns: { tenantId: "tenant_id" }, filterColumns: { status: "status" },
    toItem: (row) => ({ id: row.id, tenantId: row.tenant_id, status: row.status, score: row.score, createdAt: Number(row.created_at), title: row.title }),
  });
  const pager = createKeysetPager({ keys: [KEY], sorts: SORTS, defaultSort: "newest", source, now: () => 10_000, maxLimit: 50 });
  return { db, insert, pager, statements };
}

async function walk(pager, request) {
  const seen = [];
  let cursor;
  for (let i = 0; i < 200; i++) {
    const page = await pager.page({ ...request, ...(cursor ? { cursor } : {}) });
    seen.push(...page.items);
    if (!page.nextCursor) return seen;
    cursor = page.nextCursor;
  }
  throw new Error("did not terminate");
}

test("SQL builder: parameterized keyset WHERE/ORDER BY/LIMIT, row comparison for uniform order, OR chain for mixed, no OFFSET", () => {
  const uniform = buildKeysetQuery({
    table: "items", conditions: [{ column: "tenant_id", value: "t1" }, { column: "status", value: ["open", "new"] }, { column: "deleted_at", value: null }],
    order: SORTS.newest, after: [1005, "t1-030"], limit: 11,
  });
  assert.equal(uniform.text, 'SELECT * FROM "items" WHERE "tenant_id" = $1 AND "status" = ANY($2) AND "deleted_at" IS NULL AND ("created_at", "id") < ($3, $4) ORDER BY "created_at" DESC, "id" DESC LIMIT $5');
  assert.deepEqual(uniform.params, ["t1", ["open", "new"], 1005, "t1-030", 11]);
  const mixed = buildKeysetQuery({ table: "items", order: SORTS.score, after: [2, 1004, "t1-010"], limit: 5 });
  assert.equal(mixed.text, 'SELECT * FROM "items" WHERE "score" >= $1 AND (("score" > $1) OR ("score" = $1 AND "created_at" < $2) OR ("score" = $1 AND "created_at" = $2 AND "id" > $3)) ORDER BY "score" ASC, "created_at" DESC, "id" ASC LIMIT $4');
  assert.deepEqual(mixed.params, [2, 1004, "t1-010", 5]);
  const firstPage = buildKeysetQuery({ table: "items", order: SORTS.newest, after: null, limit: 3, where: (p) => `title <> ${p("x")}` });
  assert.equal(firstPage.text, 'SELECT * FROM "items" WHERE (title <> $1) ORDER BY "created_at" DESC, "id" DESC LIMIT $2');
  for (const text of [uniform.text, mixed.text, firstPage.text]) assert.doesNotMatch(text, /OFFSET/i);
  assert.throws(() => buildKeysetQuery({ table: "items; drop table x", order: SORTS.newest, after: null, limit: 1 }), RangeError);
  assert.throws(() => buildKeysetQuery({ table: "items", conditions: [{ column: "a = 1 or 1", value: 1 }], order: SORTS.newest, after: null, limit: 1 }), RangeError);
});

test("PGlite: schema applies; the newest walk seeks on the index (Index Cond on the cursor keys)", async () => {
  const { db, pager, statements } = await setup();
  const first = await pager.page({ scope: { tenantId: "t1" }, limit: 5 });
  await pager.page({ scope: { tenantId: "t1" }, limit: 5, cursor: first.nextCursor });
  const seek = statements.at(-1);
  assert.match(seek.text, /\("created_at", "id"\) < \(\$2, \$3\)/);
  assert.doesNotMatch(seek.text, /OFFSET/i);
  await db.exec("SET enable_seqscan = off; ANALYZE keyset_example_items;");
  const plan = (await db.query(`EXPLAIN ${seek.text}`, seek.params)).rows.map((r) => r["QUERY PLAN"]).join("\n");
  assert.match(plan, /Index (Only )?Scan using keyset_example_items_newest/, plan);
  assert.match(plan, /Index Cond: .*ROW\(created_at, id\) < ROW/, plan);
});

test("PGlite: every page walk (uniform and mixed ASC/DESC, several limits) returns each tenant row exactly once in order", async () => {
  const { db, pager } = await setup();
  const expected = {
    newest: (await db.query("SELECT id FROM keyset_example_items WHERE tenant_id = 't1' ORDER BY created_at DESC, id DESC")).rows.map((r) => r.id),
    score: (await db.query("SELECT id FROM keyset_example_items WHERE tenant_id = 't1' ORDER BY score ASC, created_at DESC, id ASC")).rows.map((r) => r.id),
  };
  for (const sort of ["newest", "score"]) {
    for (const limit of [1, 6, 13, 50]) {
      const seen = await walk(pager, { scope: { tenantId: "t1" }, sort, limit });
      assert.deepEqual(seen.map((r) => r.id), expected[sort], `${sort} @ ${limit}`);
    }
  }
  // Prev cursors walk back to identical pages on PostgreSQL too.
  const scope = { tenantId: "t1" };
  const p1 = await pager.page({ scope, sort: "score", limit: 8 });
  const p2 = await pager.page({ scope, limit: 8, cursor: p1.nextCursor });
  const back = await pager.page({ scope, limit: 8, cursor: p2.prevCursor });
  assert.deepEqual(back.items.map((r) => r.id), p1.items.map((r) => r.id));
  assert.equal(back.prevCursor, null);
});

test("PGlite: a cursor is bound to tenant and filters; filtered walks never leave the scope", async () => {
  const { pager } = await setup();
  const filters = { status: "open" };
  const page = await pager.page({ scope: { tenantId: "t1" }, filters, limit: 4 });
  await assert.rejects(pager.page({ scope: { tenantId: "t2" }, filters, cursor: page.nextCursor }), code("scope-mismatch"));
  await assert.rejects(pager.page({ scope: { tenantId: "t1" }, filters: { status: "archived" }, cursor: page.nextCursor }), code("scope-mismatch"));
  const seen = await walk(pager, { scope: { tenantId: "t2" }, filters, limit: 2 });
  assert.ok(seen.length > 0 && seen.every((r) => r.tenantId === "t2" && r.status === "open"));
  await assert.rejects(pager.page({ scope: { tenantId: "t1" }, filters: { title: "x" } }), code("invalid-filter"));
  await assert.rejects(pager.page({ scope: {} }), /unscoped/);
  await assert.rejects(pager.page({ scope: { tenantId: "t1", orgId: "o1" } }), /scopeColumns/);
});

test("PGlite: inserts and deletes between pages produce no duplicates and no skips", async () => {
  const { db, insert, pager } = await setup();
  const scope = { tenantId: "t1" };
  const original = (await db.query("SELECT id FROM keyset_example_items WHERE tenant_id = 't1'")).rows.map((r) => r.id);
  const seen = [];
  const deleted = new Set();
  const inserted = [];
  let cursor;
  for (let step = 1; step < 100; step++) {
    const page = await pager.page({ scope, sort: "score", limit: 7, ...(cursor ? { cursor } : {}) });
    seen.push(...page.items.map((r) => r.id));
    if (!page.nextCursor) break;
    cursor = page.nextCursor;
    const last = page.items.at(-1);
    // Concurrent writer: a row sorting right after the cursor (same score, older), one before it (lower score),
    // the cursor row itself deleted, and the next unseen row deleted.
    const ahead = { id: `t1-ins-a${step}`, tenantId: "t1", status: "open", score: last.score, createdAt: last.createdAt - 1, title: "ahead" };
    const behind = { id: `t1-ins-b${step}`, tenantId: "t1", status: "open", score: -1, createdAt: 5000, title: "behind" };
    await insert(ahead);
    await insert(behind);
    inserted.push(ahead.id);
    await db.query("DELETE FROM keyset_example_items WHERE id = $1", [last.id]);
    deleted.add(last.id);
    const next = (await db.query(
      "SELECT id FROM keyset_example_items WHERE tenant_id = 't1' AND id <> ALL($1) AND id <> $2 AND score >= 0 ORDER BY score ASC, created_at DESC, id ASC LIMIT 1 OFFSET 1",
      [seen, ahead.id],
    )).rows[0];
    if (next) { await db.query("DELETE FROM keyset_example_items WHERE id = $1", [next.id]); deleted.add(next.id); }
  }
  assert.equal(new Set(seen).size, seen.length, "no duplicates");
  for (const id of original) if (!deleted.has(id)) assert.ok(seen.includes(id), `skipped ${id}`);
  assert.ok([...deleted].some((id) => !seen.includes(id)), "some rows were deleted before the walk reached them");
  for (const id of inserted) if (!deleted.has(id)) assert.ok(seen.includes(id), `inserted ahead of the cursor but skipped: ${id}`);
  assert.ok(inserted.filter((id) => seen.includes(id)).length >= 3, "several inserted rows were reached");
  assert.ok(!seen.some((id) => id.includes("ins-b")), "rows inserted behind the cursor are not replayed");
});

test("PGlite: timestamp keys keep microseconds exact, so sub-millisecond rows are never skipped or misordered", async () => {
  const db = new PGlite();
  await db.exec(`CREATE TABLE ev (id text PRIMARY KEY, tenant_id text NOT NULL, created_at timestamptz NOT NULL);
    INSERT INTO ev VALUES
      ('a', 't', '2026-01-01 00:00:00.123900+00'), ('b', 't', '2026-01-01 00:00:00.123500+00'),
      ('c', 't', '2026-01-01 00:00:00.123100+00'), ('d', 't', '2026-01-01 00:00:00.122000+00'),
      ('e', 't', '2026-01-01 00:00:00.122000+00'), ('f', 't', '2025-12-31 23:59:59.999999+00');`);
  const statements = [];
  const source = createSqlKeysetSource({ query: (text, params) => { statements.push(text); return db.query(text, params); } }, {
    table: "ev", scopeColumns: { tenantId: "tenant_id" },
    toItem: (row) => ({ id: row.id, createdAt: row.created_at }),
  });
  for (const checkOrder of [true, false]) {
    for (const direction of ["desc", "asc"]) {
      const pager = createKeysetPager({
        keys: [KEY], defaultSort: "time", source, now: () => 1, checkOrder,
        sorts: { time: [{ key: "createdAt", column: "created_at", direction, type: "timestamp" }, { key: "id", direction, type: "string", unique: true }] },
      });
      const ids = (await walk(pager, { scope: { tenantId: "t" }, limit: 1 })).map((r) => r.id);
      const expected = direction === "desc" ? ["a", "b", "c", "e", "d", "f"] : ["f", "d", "e", "c", "b", "a"];
      assert.deepEqual(ids, expected, `checkOrder ${checkOrder} ${direction}`);
      const first = await pager.page({ scope: { tenantId: "t" }, limit: 1 });
      assert.deepEqual((await pager.inspectCursor(first.nextCursor)).values[0], direction === "desc" ? "2026-01-01T00:00:00.123900Z" : "2025-12-31T23:59:59.999999Z");
    }
  }
  assert.ok(statements.some((text) => /\("created_at", "id"\) [<>] \(\$2::timestamptz, \$3\)/.test(text)), "timestamp bound as exact text");
  // Declaring the timestamptz column as a number or string is refused with a pointer to the timestamp type.
  const wrong = createKeysetPager({
    keys: [KEY], defaultSort: "time", source, now: () => 1,
    sorts: { time: [{ key: "createdAt", column: "created_at", direction: "desc", type: "number" }, { key: "id", direction: "desc", type: "string", unique: true }] },
  });
  await assert.rejects(wrong.page({ scope: { tenantId: "t" }, limit: 1 }), /type "timestamp"/);
  // Mixed directions with a timestamp key on the same table.
  const mixed = createKeysetPager({
    keys: [KEY], defaultSort: "m", source, now: () => 1,
    sorts: { m: [{ key: "createdAt", column: "created_at", direction: "desc", type: "timestamp" }, { key: "id", direction: "asc", type: "string", unique: true }] },
  });
  assert.deepEqual((await walk(mixed, { scope: { tenantId: "t" }, limit: 2 })).map((r) => r.id), ["a", "b", "c", "d", "e", "f"]);
});

test("PGlite: identifiers are quoted, so keyword column names such as order work", async () => {
  const db = new PGlite();
  await db.exec(`CREATE TABLE "select" (id text PRIMARY KEY, "user" text NOT NULL, "order" integer NOT NULL);
    INSERT INTO "select" SELECT 'r' || g, 'u1', g % 3 FROM generate_series(1, 10) g;`);
  const pager = createKeysetPager({
    keys: [KEY], defaultSort: "o", now: () => 1,
    sorts: { o: [{ key: "order", direction: "asc", type: "number" }, { key: "id", direction: "asc", type: "string", unique: true }] },
    source: createSqlKeysetSource({ query: (t, p) => db.query(t, p) }, { table: "select", scopeColumns: { user: "user" } }),
  });
  const ids = (await walk(pager, { scope: { user: "u1" }, limit: 3 })).map((r) => r.id);
  const expected = (await db.query(`SELECT id FROM "select" ORDER BY "order", id`)).rows.map((r) => r.id);
  assert.deepEqual(ids, expected);
  assert.match(buildKeysetQuery({ table: "public.order", order: [{ key: "id", direction: "asc", type: "string", unique: true }], after: null, limit: 1 }).text, /FROM "public"\."order"/);
});

test("PGlite: COLLATE \"C\" code-point order matches the pager's string comparison (U+FF21 before U+1F600)", async () => {
  const db = new PGlite();
  await db.exec(`CREATE TABLE nm (id text PRIMARY KEY, tenant_id text NOT NULL, name text COLLATE "C" NOT NULL);
    INSERT INTO nm VALUES ('1', 't', E'\\uFF21'), ('2', 't', E'\\U0001F600'), ('3', 't', 'z'), ('4', 't', E'\\uFF21');`);
  const pager = createKeysetPager({
    keys: [KEY], defaultSort: "name", now: () => 1,
    sorts: { name: [{ key: "name", direction: "asc", type: "string" }, { key: "id", direction: "asc", type: "string", unique: true }] },
    source: createSqlKeysetSource({ query: (t, p) => db.query(t, p) }, { table: "nm", scopeColumns: { tenantId: "tenant_id" } }),
  });
  assert.deepEqual((await pager.page({ scope: { tenantId: "t" }, limit: 10 })).items.map((r) => r.id), ["3", "1", "4", "2"]);
  assert.deepEqual((await walk(pager, { scope: { tenantId: "t" }, limit: 1 })).map((r) => r.id), ["3", "1", "4", "2"]);
});
