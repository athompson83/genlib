// SPDX-License-Identifier: Apache-2.0
// nearby-search on real PostgreSQL semantics (PGlite): schema.sql applies, the bounding-box prefilter runs on the
// indexed (tenant_id, lat, lng) columns before the exact haversine check, keyset pagination is stable, and tenant,
// visibility and privacy rules hold in SQL. No PostGIS or earthdistance extension is needed.
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { createNearbySearch, NearbySearchError } from "../.build/modules/nearby-search/files/core.js";
import { createSqlNearbyStore } from "../.build/modules/nearby-search/files/sql-store.js";

const schema = readFileSync(new URL("../modules/nearby-search/files/schema.sql", import.meta.url), "utf8");
const ann = { tenantId: "t1", userId: "ann" };
const bob = { tenantId: "t1", userId: "bob" };
const eve = { tenantId: "t2", userId: "eve" };
const code = (expected) => (error) => error instanceof NearbySearchError && error.code === expected;

async function setup(options = {}) {
  const db = new PGlite();
  await db.exec(schema);
  const queries = [];
  const executor = { query: (text, params) => { queries.push({ text, params }); return db.query(text, params); } };
  const nearby = createNearbySearch({ store: createSqlNearbyStore(executor), ...options });
  return { db, nearby, queries };
}

test("sql: schema applies; radius search is nearest first with meters, across the antimeridian and at the poles", async () => {
  const { nearby } = await setup();
  await nearby.upsert(ann, { id: "far", lat: 0, lng: 0.02 });
  await nearby.upsert(ann, { id: "near", lat: 0, lng: 0.001 });
  await nearby.upsert(ann, { id: "mid", lat: 0.005, lng: 0 });
  await nearby.upsert(ann, { id: "out", lat: 0.05, lng: 0 });
  const page = await nearby.search(bob, { lat: 0, lng: 0, radiusMeters: 3_000 });
  assert.deepEqual(page.results.map((r) => [r.id, r.distanceMeters]), [["near", 111], ["mid", 556], ["far", 2224]]);
  await nearby.upsert(ann, { id: "east-of-line", lat: 0, lng: -179.995 });
  await nearby.upsert(ann, { id: "west-of-line", lat: 0, lng: 179.996 });
  await nearby.upsert(ann, { id: "pole-a", lat: 89.995, lng: 179 });
  await nearby.upsert(ann, { id: "pole-b", lat: 89.996, lng: -1 });
  const line = await nearby.search(bob, { lat: 0, lng: 179.999, radiusMeters: 2_000 });
  assert.deepEqual(line.results.map((r) => r.id), ["west-of-line", "east-of-line"]);
  const north = await nearby.search(bob, { lat: 90, lng: 0, radiusMeters: 1_000 });
  assert.deepEqual(north.results.map((r) => r.id), ["pole-b", "pole-a"]);
});

test("sql: keyset pagination by (distance, id) with ties visits every row once", async () => {
  const { nearby } = await setup();
  for (const id of ["d", "b", "c", "a"]) await nearby.upsert(ann, { id: `tie-${id}`, lat: 0.001, lng: 0 });
  for (let i = 1; i <= 6; i++) await nearby.upsert(ann, { id: `p${i}`, lat: 0, lng: 0.001 * (i + 1) });
  const seen = [];
  let cursor;
  do {
    const page = await nearby.search(bob, { lat: 0, lng: 0, radiusMeters: 5_000, limit: 3, ...(cursor ? { cursor } : {}) });
    seen.push(...page.results.map((r) => r.id));
    cursor = page.nextCursor;
  } while (cursor);
  assert.deepEqual(seen, ["tie-a", "tie-b", "tie-c", "tie-d", "p1", "p2", "p3", "p4", "p5", "p6"]);
});

test("sql: the bounding-box prefilter uses the (tenant_id, lat, lng) index and parameters, then checks exact distance", async () => {
  const { db, nearby, queries } = await setup();
  const values = [];
  for (let i = 0; i < 2_000; i++) values.push(`('t1', 'g${i}', 'ann', 'public', ${(i % 50) * 0.1}, ${Math.floor(i / 50) * 0.1}, ${(i % 50) * 0.1}, ${Math.floor(i / 50) * 0.1}, NULL, NULL)`);
  await db.exec(`INSERT INTO nearby_places (tenant_id, id, owner_id, visibility, lat, lng, exact_lat, exact_lng, precision_m, label) VALUES ${values.join(",")}; ANALYZE nearby_places;`);
  const page = await nearby.search(bob, { lat: 1.0, lng: 1.0, radiusMeters: 10_000 });
  assert.deepEqual(page.results.map((r) => r.id), ["g510"]);
  const search = queries.at(-1);
  assert.match(search.text, /lat BETWEEN \$\d+ AND \$\d+ AND lng BETWEEN \$\d+ AND \$\d+/);
  assert.ok(!search.text.includes("'t1'") && search.params.includes("t1") && search.params.includes(1), "inputs are parameters, not SQL text");
  const plan = (await db.query(`EXPLAIN ${search.text}`, search.params)).rows.map((row) => Object.values(row)[0]).join("\n");
  assert.match(plan, /nearby_places_tenant_lat_lng/, plan);
  // The box corner (inside the box, outside the circle) is excluded by the exact distance check.
  await nearby.upsert(ann, { id: "corner", lat: 1.07, lng: 1.07 });
  const again = await nearby.search(bob, { lat: 1.0, lng: 1.0, radiusMeters: 10_000 });
  assert.deepEqual(again.results.map((r) => r.id), ["g510"]);
});

test("sql: tenant and visibility scoping, owner-only writes and an atomic owner check on conflicting upserts", async () => {
  const { nearby } = await setup();
  assert.deepEqual(await nearby.upsert(ann, { id: "shop", lat: 0, lng: 0.01 }), { id: "shop", created: true });
  assert.deepEqual(await nearby.upsert(ann, { id: "shop", lat: 0, lng: 0.001 }), { id: "shop", created: false });
  await nearby.upsert(ann, { id: "home", lat: 0, lng: 0.002, visibility: "private" });
  await nearby.upsert(eve, { id: "shop", lat: 0, lng: 0.001 }); // same id, other tenant: separate row
  assert.deepEqual((await nearby.search(bob, { lat: 0, lng: 0, radiusMeters: 1_000 })).results.map((r) => r.id), ["shop"]);
  assert.deepEqual((await nearby.search(ann, { lat: 0, lng: 0, radiusMeters: 1_000 })).results.map((r) => r.id), ["shop", "home"]);
  assert.deepEqual((await nearby.search(eve, { lat: 0, lng: 0, radiusMeters: 1_000 })).results.map((r) => [r.id, r.ownedByViewer]), [["shop", true]]);
  await assert.rejects(nearby.upsert(bob, { id: "shop", lat: 5, lng: 5 }), code("forbidden"));
  await assert.rejects(nearby.remove(bob, "home"), code("not-found"));
  const results = await Promise.allSettled([nearby.upsert(ann, { id: "race", lat: 0, lng: 0 }), nearby.upsert(bob, { id: "race", lat: 1, lng: 1 })]);
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  assert.ok(results.some((r) => r.status === "rejected" && r.reason.code === "forbidden"));
  await nearby.remove(ann, "home");
  assert.deepEqual((await nearby.search(ann, { lat: 0, lng: 0, radiusMeters: 1_000 })).results.map((r) => r.id).filter((id) => id !== "race"), ["shop"]);
});

test("sql: approximate places are stored, filtered and returned by their snapped cell; exact coordinates reach only the owner", async () => {
  const { db, nearby } = await setup({ privacy: { precisionMeters: 1_000, distanceStepMeters: 500 } });
  await nearby.upsert(ann, { id: "ann-now", lat: 40.712_345, lng: -74.006_789, visibility: "approximate" });
  const row = (await db.query("SELECT lat, lng, exact_lat, exact_lng, precision_m FROM nearby_places WHERE id = 'ann-now'")).rows[0];
  assert.notEqual(row.lat, 40.712_345);
  assert.equal(row.exact_lat, 40.712_345);
  assert.ok(row.precision_m >= 1_000);
  const forBob = await nearby.search(bob, { lat: 40.70, lng: -74.0, radiusMeters: 10_000 });
  assert.deepEqual(forBob.results[0].location, { lat: row.lat, lng: row.lng });
  assert.equal(forBob.results[0].precision, "approximate");
  assert.equal(forBob.results[0].distanceMeters % 500, 0);
  assert.ok(!JSON.stringify(forBob).includes("40.712"));
  const forAnn = await nearby.search(ann, { lat: 40.70, lng: -74.0, radiusMeters: 10_000 });
  assert.deepEqual(forAnn.results[0].location, { lat: 40.712_345, lng: -74.006_789 });
});
