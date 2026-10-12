// SPDX-License-Identifier: Apache-2.0
// url-slugs on real PostgreSQL semantics (PGlite, Postgres compiled to WASM): schema.sql applies, the (scope, slug)
// primary key plus ON CONFLICT retry gives concurrent creates distinct slugs, and the partial unique index keeps one
// current slug per entity.
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { createUrlSlugs } from "../.build/modules/url-slugs/files/core.js";
import { createSqlSlugStore } from "../.build/modules/url-slugs/files/sql-store.js";

const schema = readFileSync(new URL("../modules/url-slugs/files/schema.sql", import.meta.url), "utf8");

function executor(db) {
  const wrap = (q) => ({ query: (text, params) => q.query(text, params) });
  return { ...wrap(db), transaction: (work) => db.transaction((tx) => work(wrap(tx))) };
}

async function setup(options = {}) {
  const db = new PGlite();
  await db.exec(schema);
  let now = 1_000_000;
  const store = createSqlSlugStore(executor(db));
  const slugs = createUrlSlugs({ store, now: () => now, ...options });
  return { db, store, slugs, advance: (ms) => { now += ms; } };
}

test("PGlite: schema applies; ten concurrent creates of one title get distinct slugs via the unique key and retry", async () => {
  const { db, slugs } = await setup();
  const results = await Promise.all(Array.from({ length: 10 }, (_, i) => slugs.create("t1:posts", `e${i}`, "Hello World")));
  const values = results.map((r) => r.slug);
  assert.equal(new Set(values).size, 10);
  assert.deepEqual([...values].sort(), ["hello-world", ...Array.from({ length: 9 }, (_, i) => `hello-world-${i + 2}`)].sort());
  assert.equal((await db.query("SELECT count(*)::int AS n FROM url_slugs")).rows[0].n, 10);
  // The same title in another tenant scope starts again at the bare slug.
  assert.equal((await slugs.create("t2:posts", "e0", "Hello World")).slug, "hello-world");
});

test("PGlite: the unique constraint refuses a duplicate (scope, slug) and a second current slug for an entity", async () => {
  const { db, store, slugs } = await setup();
  await slugs.create("t1:posts", "p1", "Post");
  assert.equal(await store.insert({ scope: "t1:posts", slug: "post", entityId: "p2", createdAt: 1 }), "slug-taken");
  assert.equal(await store.insert({ scope: "t1:posts", slug: "other", entityId: "p1", createdAt: 1 }), "entity-exists");
  await assert.rejects(db.query("INSERT INTO url_slugs (scope, slug, entity_id, created_at) VALUES ('t1:posts', 'post', 'p3', 1)"), { code: "23505" });
  await assert.rejects(slugs.create("t1:posts", "p1", "Again"), { code: "entity-exists" });
  assert.equal((await slugs.create("t1:posts", "p2", "Post")).slug, "post-2");
});

test("PGlite: reserved words, rename history, collapsed redirects and reclaiming an old slug", async () => {
  const { slugs, advance } = await setup();
  await assert.rejects(slugs.create("t1:posts", "p1", "admin", { exact: true }), { code: "reserved-slug" });
  assert.equal((await slugs.create("t1:posts", "p1", "New")).slug, "new-2");
  advance(1000);
  await slugs.rename("t1:posts", "p1", "Second");
  advance(1000);
  await slugs.rename("t1:posts", "p1", "Third");
  assert.deepEqual(await slugs.resolve("t1:posts", "new-2"), { status: "redirect", entityId: "p1", slug: "third", from: "new-2" });
  assert.deepEqual(await slugs.resolve("t1:posts", "second"), { status: "redirect", entityId: "p1", slug: "third", from: "second" });
  assert.deepEqual(await slugs.resolve("t1:posts", "third"), { status: "ok", entityId: "p1", slug: "third" });
  assert.equal((await slugs.rename("t1:posts", "p1", "Second")).slug, "second", "reclaims its own old slug");
  assert.equal((await slugs.resolve("t1:posts", "second")).status, "ok");
  assert.equal((await slugs.resolve("t1:posts", "third")).slug, "second");
  assert.deepEqual((await slugs.history("t1:posts", "p1")).map((h) => [h.slug, h.retiredAt === undefined]), [["new-2", false], ["second", true], ["third", false]]);
  // Another entity cannot take an old slug, and the other tenant cannot see any of them.
  assert.equal((await slugs.create("t1:posts", "p2", "Third")).slug, "third-2");
  assert.equal((await slugs.resolve("t2:posts", "second")).status, "not-found");
  await assert.rejects(slugs.rename("t1:posts", "missing", "x"), { code: "not-found" });
  assert.equal(await slugs.remove("t1:posts", "p1"), 3);
  assert.equal((await slugs.resolve("t1:posts", "third")).status, "not-found");
});

test("PGlite: concurrent renames of one entity leave exactly one current slug", async () => {
  const { db, slugs } = await setup();
  await slugs.create("t1:posts", "p1", "start");
  await Promise.all(["one", "two", "three", "four"].map((title) => slugs.rename("t1:posts", "p1", title)));
  const current = (await db.query("SELECT slug FROM url_slugs WHERE entity_id = 'p1' AND retired_at IS NULL")).rows;
  assert.equal(current.length, 1);
  for (const old of ["start", "one", "two", "three", "four"]) assert.equal((await slugs.resolve("t1:posts", old)).slug, current[0].slug);
});

test("PGlite: a keyword table name and a schema-qualified name are quoted safely", async () => {
  const db = new PGlite();
  const keyword = schema.replace("TABLE IF NOT EXISTS url_slugs", 'TABLE IF NOT EXISTS "order"').replaceAll("ON url_slugs ", 'ON "order" ');
  await db.exec(keyword);
  await db.exec('CREATE SCHEMA "user"; ' + schema.replace("TABLE IF NOT EXISTS url_slugs", 'TABLE IF NOT EXISTS "user"."select"').replaceAll("ON url_slugs ", 'ON "user"."select" ').replaceAll("IF NOT EXISTS url_slugs_", "IF NOT EXISTS sel_"));
  for (const table of ["order", "user.select"]) {
    const slugs = createUrlSlugs({ store: createSqlSlugStore(executor(db), { table }), now: () => 1 });
    assert.equal((await slugs.create("t1:posts", "p1", "Hello")).slug, "hello");
    assert.equal((await slugs.create("t1:posts", "p2", "Hello")).slug, "hello-2");
    await slugs.rename("t1:posts", "p1", "Bye");
    assert.equal((await slugs.resolve("t1:posts", "hello")).slug, "bye");
    assert.equal((await slugs.history("t1:posts", "p1")).length, 2);
    assert.equal(await slugs.remove("t1:posts", "p2"), 1);
  }
  assert.equal((await db.query('SELECT count(*)::int AS n FROM "order"')).rows[0].n, 2);
  assert.equal((await db.query('SELECT count(*)::int AS n FROM "user"."select"')).rows[0].n, 2);
  for (const bad of ["Order", "a.b.c", "x;drop", '"q"', ".x", "x."]) assert.throws(() => createSqlSlugStore(executor(db), { table: bad }), RangeError, bad);
});
