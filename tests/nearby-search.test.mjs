// SPDX-License-Identifier: Apache-2.0
// nearby-search core, in-memory store and Fetch adapter: validated coordinates, haversine meters, poles and the
// antimeridian, nearest-first keyset pagination, the geohash-cell prefilter, tenant/visibility scoping and location
// privacy for approximate and private places.
import assert from "node:assert/strict";
import test from "node:test";
import {
  createNearbySearch, NearbySearchError, haversineMeters, validateCoordinates, boundingBoxes, geohashEncode, snapToCell,
} from "../.build/modules/nearby-search/files/core.js";
import { MemoryNearbyStore } from "../.build/modules/nearby-search/files/memory-store.js";
import { createNearbySearchHandler } from "../.build/modules/nearby-search/files/http.js";

const ann = { tenantId: "t1", userId: "ann" };
const bob = { tenantId: "t1", userId: "bob" };
const eve = { tenantId: "t2", userId: "eve" };
const code = (expected) => (error) => error instanceof NearbySearchError && error.code === expected;

function setup(options = {}) {
  const store = options.store ?? new MemoryNearbyStore();
  const nearby = createNearbySearch({ store, ...options });
  return { store, nearby };
}

// Meters per degree of latitude on the module's sphere.
const M_PER_DEG = (Math.PI / 180) * 6_371_008.8;

test("validateCoordinates rejects out-of-range, non-finite and non-number latitudes and longitudes", () => {
  assert.deepEqual(validateCoordinates({ lat: 90, lng: -180 }), { lat: 90, lng: -180 });
  assert.deepEqual(validateCoordinates({ lat: -90, lng: 180 }), { lat: -90, lng: 180 });
  for (const bad of [
    { lat: 90.0001, lng: 0 }, { lat: -91, lng: 0 }, { lat: 0, lng: 180.5 }, { lat: 0, lng: -181 },
    { lat: Number.NaN, lng: 0 }, { lat: 0, lng: Infinity }, { lat: "10", lng: 0 }, { lat: 0 }, null, "1,2",
  ]) assert.throws(() => validateCoordinates(bad), code("invalid-coordinates"), JSON.stringify(bad));
});

test("haversineMeters returns great-circle meters for known vectors", () => {
  assert.equal(haversineMeters({ lat: 0, lng: 0 }, { lat: 0, lng: 0 }), 0);
  // One degree of latitude on the 6,371,008.8 m sphere.
  assert.ok(Math.abs(haversineMeters({ lat: 0, lng: 0 }, { lat: 1, lng: 0 }) - 111_195.08) < 0.1);
  // Paris -> London is about 343.9 km on the sphere.
  const d = haversineMeters({ lat: 48.8566, lng: 2.3522 }, { lat: 51.5074, lng: -0.1278 });
  assert.ok(Math.abs(d - 343_900) < 1_500, String(d));
  // Antipodes: half the circumference.
  assert.ok(Math.abs(haversineMeters({ lat: 0, lng: 0 }, { lat: 0, lng: 180 }) - Math.PI * 6_371_008.8) < 0.01);
  // Across the antimeridian is short, not the long way round.
  assert.ok(haversineMeters({ lat: 0, lng: 179.999 }, { lat: 0, lng: -179.999 }) < 250);
  assert.throws(() => haversineMeters({ lat: 91, lng: 0 }, { lat: 0, lng: 0 }), code("invalid-coordinates"));
});

test("boundingBoxes splits at the antimeridian and opens to every longitude at the poles", () => {
  const plain = boundingBoxes({ lat: 10, lng: 20 }, 10_000);
  assert.equal(plain.length, 1);
  assert.ok(plain[0].minLng > 19.8 && plain[0].maxLng < 20.2 && plain[0].minLat < 10 && plain[0].maxLat > 10);
  const wrap = boundingBoxes({ lat: 0, lng: 179.99 }, 5_000);
  assert.equal(wrap.length, 2);
  assert.ok(wrap.some((b) => b.maxLng === 180 && b.minLng < 179.99));
  assert.ok(wrap.some((b) => b.minLng === -180 && b.maxLng > -180 && b.maxLng < -179.9));
  const pole = boundingBoxes({ lat: 89.99, lng: 0 }, 5_000);
  assert.deepEqual(pole.map((b) => [b.minLng, b.maxLng, b.maxLat]), [[-180, 180, 90]]);
  assert.throws(() => boundingBoxes({ lat: 0, lng: 0 }, -1), code("invalid-radius"));
  // Deterministic fuzz: every point on the circle (all bearings) lies inside one of the boxes.
  const R = 6_371_008.8, rad = (d) => (d * Math.PI) / 180, deg = (r) => (r * 180) / Math.PI;
  const destination = (lat, lng, bearing, meters) => {
    const a = meters / R, p = rad(lat), t = rad(bearing);
    const p2 = Math.asin(Math.sin(p) * Math.cos(a) + Math.cos(p) * Math.sin(a) * Math.cos(t));
    const l2 = rad(lng) + Math.atan2(Math.sin(t) * Math.sin(a) * Math.cos(p), Math.cos(a) - Math.sin(p) * Math.sin(p2));
    return [deg(p2), ((deg(l2) + 540) % 360) - 180];
  };
  let seed = 7;
  const random = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  let outside = 0;
  for (let i = 0; i < 400; i++) {
    const lat = random() * 178 - 89, lng = random() * 360 - 180, r = random() * 2e6 + 1;
    const boxes = boundingBoxes({ lat, lng }, r);
    for (let b = 0; b < 360; b += 2) {
      const [pLat, pLng] = destination(lat, lng, b, r * 0.999999);
      if (!boxes.some((x) => pLat >= x.minLat && pLat <= x.maxLat && pLng >= x.minLng && pLng <= x.maxLng)) outside++;
    }
  }
  assert.equal(outside, 0);
});

test("radius search returns places nearest first with distances in meters and excludes places beyond the radius", async () => {
  const { nearby } = setup();
  await nearby.upsert(ann, { id: "far", lat: 0, lng: 0.02 }); // ~2.2 km
  await nearby.upsert(ann, { id: "near", lat: 0, lng: 0.001 }); // ~111 m
  await nearby.upsert(ann, { id: "mid", lat: 0.005, lng: 0 }); // ~556 m
  await nearby.upsert(ann, { id: "out", lat: 0.05, lng: 0 }); // ~5.6 km
  const page = await nearby.search(bob, { lat: 0, lng: 0, radiusMeters: 3_000 });
  assert.deepEqual(page.results.map((r) => r.id), ["near", "mid", "far"]);
  assert.deepEqual(page.results.map((r) => r.distanceMeters), [111, 556, 2224]);
  assert.ok(page.results.every((r) => r.precision === "exact" && r.location && r.ownedByViewer === false));
  assert.deepEqual(page.results[0].location, { lat: 0, lng: 0.001 });
  assert.equal(page.nextCursor, null);
  await assert.rejects(nearby.search(bob, { lat: 0, lng: 0, radiusMeters: 0 }), code("invalid-radius"));
  await assert.rejects(nearby.search(bob, { lat: 0, lng: 0, radiusMeters: 60_000 }), code("invalid-radius"));
  await assert.rejects(nearby.search(bob, { lat: 95, lng: 0, radiusMeters: 100 }), code("invalid-coordinates"));
  await assert.rejects(nearby.upsert(ann, { id: "x", lat: 0, lng: 200 }), code("invalid-coordinates"));
});

test("keyset pagination by (distance, id) visits every place once, breaks distance ties by id and binds the cursor to the query", async () => {
  const { nearby } = setup();
  // Four places at the same distance (ties) plus six at increasing distances.
  for (const id of ["d", "b", "c", "a"]) await nearby.upsert(ann, { id: `tie-${id}`, lat: 0.001, lng: 0 });
  for (let i = 1; i <= 6; i++) await nearby.upsert(ann, { id: `p${i}`, lat: 0, lng: 0.001 * (i + 1) });
  const seen = [];
  let cursor;
  let pages = 0;
  do {
    const page = await nearby.search(bob, { lat: 0, lng: 0, radiusMeters: 5_000, limit: 3, ...(cursor ? { cursor } : {}) });
    seen.push(...page.results.map((r) => r.id));
    cursor = page.nextCursor;
    pages++;
  } while (cursor);
  assert.equal(pages, 4);
  assert.deepEqual(seen.slice(0, 4), ["tie-a", "tie-b", "tie-c", "tie-d"]);
  assert.deepEqual(seen.slice(4), ["p1", "p2", "p3", "p4", "p5", "p6"]);
  // Insert a nearer place mid-way: later pages neither repeat nor skip the remaining ones.
  const first = await nearby.search(bob, { lat: 0, lng: 0, radiusMeters: 5_000, limit: 5 });
  await nearby.upsert(ann, { id: "new-near", lat: 0, lng: 0.0001 });
  const second = await nearby.search(bob, { lat: 0, lng: 0, radiusMeters: 5_000, limit: 10, cursor: first.nextCursor });
  assert.deepEqual(second.results.map((r) => r.id), ["p2", "p3", "p4", "p5", "p6"]);
  // A cursor only works for the query that produced it.
  await assert.rejects(nearby.search(bob, { lat: 0, lng: 0.1, radiusMeters: 5_000, cursor: first.nextCursor }), code("invalid-cursor"));
  await assert.rejects(nearby.search(bob, { lat: 0, lng: 0, radiusMeters: 4_000, cursor: first.nextCursor }), code("invalid-cursor"));
  await assert.rejects(nearby.search(bob, { lat: 0, lng: 0, radiusMeters: 5_000, cursor: "garbage!!" }), code("invalid-cursor"));
  await assert.rejects(nearby.search(bob, { lat: 0, lng: 0, radiusMeters: 5_000, limit: 101 }), code("invalid-input"));
});

test("searches near the antimeridian and the poles find neighbours on the other side", async () => {
  const { nearby } = setup();
  await nearby.upsert(ann, { id: "east-of-line", lat: 0, lng: -179.995 });
  await nearby.upsert(ann, { id: "west-of-line", lat: 0, lng: 179.996 });
  await nearby.upsert(ann, { id: "greenwich", lat: 0, lng: 0 });
  await nearby.upsert(ann, { id: "pole-a", lat: 89.995, lng: 179 });
  await nearby.upsert(ann, { id: "pole-b", lat: 89.996, lng: -1 });
  await nearby.upsert(ann, { id: "south-pole", lat: -90, lng: 0 });
  const line = await nearby.search(bob, { lat: 0, lng: 179.999, radiusMeters: 2_000 });
  assert.deepEqual(line.results.map((r) => r.id), ["west-of-line", "east-of-line"]);
  assert.ok(line.results[1].distanceMeters < 1_000);
  const north = await nearby.search(bob, { lat: 90, lng: 0, radiusMeters: 1_000 });
  assert.deepEqual(north.results.map((r) => r.id).sort(), ["pole-a", "pole-b"]);
  const south = await nearby.search(bob, { lat: -89.999, lng: 123, radiusMeters: 500 });
  assert.deepEqual(south.results.map((r) => r.id), ["south-pole"]);
});

test("the memory store prefilters by geohash cells and bounding box instead of distance-checking every place", async () => {
  const store = new MemoryNearbyStore({ cellLength: 5 });
  const { nearby } = setup({ store });
  // 400 places spread over a wide grid; only a handful are near the origin.
  let n = 0;
  for (let i = -10; i < 10; i++) for (let j = -10; j < 10; j++) await nearby.upsert(ann, { id: `g${n++}`, lat: i * 0.5, lng: j * 0.5 });
  const page = await nearby.search(bob, { lat: 0.01, lng: 0.01, radiusMeters: 5_000 });
  assert.deepEqual(page.results.map((r) => r.id), ["g210"]);
  assert.ok(store.lastScan.cells > 0, "used the cell index");
  assert.ok(store.lastScan.examined < 10, `examined ${store.lastScan.examined} of 400`);
  assert.equal(geohashEncode(57.64911, 10.40744, 11), "u4pruydqqvj");
});

test("tenant and visibility scoping: other tenants never see places; private places are visible only to their owner", async () => {
  const { nearby } = setup();
  await nearby.upsert(ann, { id: "shop", lat: 0, lng: 0.001, label: "Ann's shop" });
  await nearby.upsert(ann, { id: "home", lat: 0, lng: 0.002, visibility: "private" });
  await nearby.upsert(eve, { id: "eve-shop", lat: 0, lng: 0.001 });
  const forBob = await nearby.search(bob, { lat: 0, lng: 0, radiusMeters: 1_000 });
  assert.deepEqual(forBob.results.map((r) => r.id), ["shop"]);
  assert.equal(forBob.results[0].label, "Ann's shop");
  const forAnn = await nearby.search(ann, { lat: 0, lng: 0, radiusMeters: 1_000 });
  assert.deepEqual(forAnn.results.map((r) => [r.id, r.ownedByViewer]), [["shop", true], ["home", true]]);
  assert.deepEqual(forAnn.results[1].location, { lat: 0, lng: 0.002 });
  const forEve = await nearby.search(eve, { lat: 0, lng: 0, radiusMeters: 1_000 });
  assert.deepEqual(forEve.results.map((r) => r.id), ["eve-shop"]);
  // Only the owner can move or delete a place; a missing or foreign place is not-found on remove.
  await assert.rejects(nearby.upsert(bob, { id: "shop", lat: 1, lng: 1 }), code("forbidden"));
  await assert.rejects(nearby.remove(bob, "shop"), code("not-found"));
  await assert.rejects(nearby.remove(eve, "shop"), code("not-found"));
  assert.deepEqual(await nearby.upsert(ann, { id: "shop", lat: 0, lng: 0.003 }), { id: "shop", created: false });
  await nearby.remove(ann, "shop");
  assert.deepEqual((await nearby.search(bob, { lat: 0, lng: 0, radiusMeters: 1_000 })).results, []);
  await assert.rejects(nearby.search({ tenantId: "", userId: "x" }, { lat: 0, lng: 0, radiusMeters: 10 }), code("invalid-input"));
  await assert.rejects(nearby.upsert(ann, { id: "bad id!", lat: 0, lng: 0 }), code("invalid-input"));
  await assert.rejects(nearby.upsert(ann, { id: "v", lat: 0, lng: 0, visibility: "secret" }), code("invalid-input"));
});

test("location privacy: approximate places expose only a snapped cell and a rounded distance, never exact coordinates", async () => {
  const { nearby, store } = setup({ privacy: { precisionMeters: 1_000, distanceStepMeters: 500 } });
  const exact = { lat: 40.712_345, lng: -74.006_789 };
  await nearby.upsert(ann, { id: "ann-now", ...exact, visibility: "approximate" });
  const page = await nearby.search(bob, { lat: 40.70, lng: -74.0, radiusMeters: 10_000 });
  assert.equal(page.results.length, 1);
  const hit = page.results[0];
  assert.equal(hit.precision, "approximate");
  assert.notDeepEqual(hit.location, exact);
  assert.ok(hit.precisionMeters >= 1_000);
  assert.equal(hit.distanceMeters % 500, 0, "distance rounded to the step");
  // The shared point is the fixed grid cell centre, so moving inside the cell changes nothing others can see.
  const cell = snapToCell(exact, 1_000);
  assert.deepEqual(hit.location, { lat: cell.lat, lng: cell.lng });
  await nearby.upsert(ann, { id: "ann-now", lat: exact.lat + 0.000_5, lng: exact.lng + 0.000_5, visibility: "approximate" });
  const again = await nearby.search(bob, { lat: 40.70, lng: -74.0, radiusMeters: 10_000 });
  assert.deepEqual(again.results[0], hit);
  // Nothing in the response or the cursor carries the exact coordinates.
  const serialized = JSON.stringify(again);
  assert.ok(!serialized.includes("40.712") && !serialized.includes("74.006"), serialized);
  // The owner still sees the exact point.
  const own = await nearby.search(ann, { lat: 40.70, lng: -74.0, radiusMeters: 10_000 });
  assert.deepEqual(own.results[0].location, { lat: exact.lat + 0.000_5, lng: exact.lng + 0.000_5 });
  assert.equal(own.results[0].ownedByViewer, true);
  // Coordinates can be withheld entirely, leaving only the rounded distance.
  const hidden = createNearbySearch({ store, privacy: { precisionMeters: 1_000, approximateCoordinates: "none" } });
  const none = await hidden.search(bob, { lat: 40.70, lng: -74.0, radiusMeters: 10_000 });
  assert.equal(none.results[0].location, undefined);
  assert.equal(none.results[0].distanceMeters % 1_000, 0, "step defaults to the precision");
  assert.ok(none.results[0].distanceMeters >= 1_000);
  // The radius filter uses the shared cell too, so probing radii cannot pinpoint the exact location.
  const atCell = await nearby.search(bob, { lat: cell.lat, lng: cell.lng, radiusMeters: 1 });
  assert.deepEqual(atCell.results.map((r) => r.id), ["ann-now"]);
  assert.throws(() => createNearbySearch({ store, privacy: { precisionMeters: 10 } }), RangeError);
});

test("snapToCell precision is configurable and coarser cells are chosen near the poles", () => {
  const p = { lat: 51.5, lng: -0.12 };
  const fine = snapToCell(p, 200);
  const coarse = snapToCell(p, 5_000);
  assert.ok(fine.cellMeters >= 200 && coarse.cellMeters >= 5_000 && coarse.cellMeters > fine.cellMeters);
  assert.ok(haversineMeters(p, fine) < fine.cellMeters * 1.5, "snapped point stays inside the fine cell");
  assert.deepEqual(snapToCell({ lat: 51.5001, lng: -0.1201 }, 5_000), coarse, "nearby points share the fixed cell");
  const polar = snapToCell({ lat: 89.9, lng: 10 }, 1_000);
  assert.ok(polar.cellMeters >= 1_000 && polar.geohash.length < snapToCell({ lat: 0, lng: 10 }, 1_000).geohash.length);
});

test("concurrent upserts of one id by two owners leave exactly one owner", async () => {
  const { nearby } = setup();
  const results = await Promise.allSettled([nearby.upsert(ann, { id: "spot", lat: 0, lng: 0 }), nearby.upsert(bob, { id: "spot", lat: 1, lng: 1 })]);
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  assert.ok(results.some((r) => r.status === "rejected" && r.reason.code === "forbidden"));
});

// ---------------------------------------------------------------------------------------------------------------
// HTTP adapter

function http(extra = {}) {
  const { nearby } = setup();
  const limited = [];
  const handler = createNearbySearchHandler({
    nearby, prefix: "/api/nearby", allowedOrigins: ["https://app.example.com"],
    authenticate: async (request) => {
      const user = request.headers.get("x-user");
      return user ? { tenantId: request.headers.get("x-tenant") ?? "t1", userId: user } : null;
    },
    rateLimit: (key) => { limited.push(key); return !key.endsWith(":spammer"); },
    ...extra,
  });
  const call = (method, path, { user = "ann", body, origin = "https://app.example.com", headers = {} } = {}) => handler(new Request(`https://app.example.com${path}`, {
    method,
    headers: { ...(user ? { "x-user": user } : {}), ...(origin ? { origin } : {}), ...(body === undefined ? {} : { "content-type": "application/json" }), ...headers },
    ...(body === undefined ? {} : { body: typeof body === "string" ? body : JSON.stringify(body) }),
  }));
  return { nearby, handler, call, limited };
}

test("HTTP adapter: PUT place, GET search with cursor, DELETE place, statuses and no-store headers", async () => {
  const { call, limited } = http();
  let res = await call("PUT", "/api/nearby/places/cafe", { body: { lat: 0, lng: 0.001, label: "Cafe" } });
  assert.equal(res.status, 201);
  assert.equal(res.headers.get("cache-control"), "no-store");
  assert.deepEqual(await res.json(), { id: "cafe", created: true });
  assert.equal((await call("PUT", "/api/nearby/places/cafe", { body: { lat: 0, lng: 0.0011 } })).status, 200);
  await call("PUT", "/api/nearby/places/bar", { body: { lat: 0, lng: 0.002 } });
  res = await call("GET", "/api/nearby/search?lat=0&lng=0&radius=1000&limit=1", { user: "bob", origin: null });
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("cache-control"), "no-store");
  const first = await res.json();
  assert.deepEqual(first.results.map((r) => r.id), ["cafe"]);
  res = await call("GET", `/api/nearby/search?lat=0&lng=0&radius=1000&limit=1&cursor=${encodeURIComponent(first.nextCursor)}`, { user: "bob", origin: null });
  assert.deepEqual((await res.json()).results.map((r) => r.id), ["bar"]);
  assert.ok(limited.includes("search:t1:bob"));
  assert.equal((await call("DELETE", "/api/nearby/places/bar", { user: "bob" })).status, 404);
  assert.equal((await call("DELETE", "/api/nearby/places/bar")).status, 204);
  assert.equal((await call("PUT", "/api/nearby/places/cafe", { user: "bob", body: { lat: 0, lng: 0 } })).status, 403);
  assert.equal((await call("GET", "/api/nearby/search?lat=91&lng=0&radius=10")).status, 400);
  assert.equal((await (await call("GET", "/api/nearby/search?lat=1e1&lng=0&radius=10")).json()).error, "invalid-coordinates");
  assert.equal((await call("GET", "/api/nearby/search?lat=0&lng=0&radius=10", { user: null })).status, 401);
  assert.equal((await call("GET", "/api/nearby/search?lat=0&lng=0&radius=10", { user: "spammer" })).status, 429);
  assert.equal((await call("PUT", "/api/nearby/places/x", { body: { lat: 0, lng: 0 }, origin: "https://evil.example" })).status, 403);
  assert.equal((await call("PUT", "/api/nearby/places/x", { body: "{nope" })).status, 400);
  assert.equal((await call("PUT", "/api/nearby/places/x", { body: "x".repeat(5000) })).status, 400);
  assert.equal((await call("POST", "/api/nearby/search")).status, 405);
  assert.equal((await call("GET", "/api/other")).status, 404);
  assert.equal((await call("GET", "/api/nearby/nope")).status, 404);
});

test("HTTP adapter: routes and statusFor overrides change paths and error statuses", async () => {
  const { call } = http({
    prefix: "/v2/geo/",
    routes: { search: "/near", place: "/spots/:id" },
    statusFor: { forbidden: 409, "invalid-coordinates": 422, "not-found": 410 },
  });
  assert.equal((await call("PUT", "/v2/geo/spots/s1", { body: { lat: 0, lng: 0 } })).status, 201);
  assert.equal((await call("PUT", "/v2/geo/spots/s1", { user: "bob", body: { lat: 0, lng: 0 } })).status, 409);
  assert.equal((await call("GET", "/v2/geo/near?lat=100&lng=0&radius=5")).status, 422);
  assert.equal((await call("DELETE", "/v2/geo/spots/missing")).status, 410);
  const res = await call("GET", "/v2/geo/near?lat=0&lng=0&radius=5", { user: "bob" });
  assert.deepEqual((await res.json()).results.map((r) => r.id), ["s1"]);
  // Default paths are gone; unmapped codes keep their defaults.
  assert.equal((await call("GET", "/v2/geo/search?lat=0&lng=0&radius=5")).status, 404);
  assert.equal((await call("GET", "/v2/geo/near?lat=0&lng=0&radius=5", { user: null })).status, 401);
  assert.throws(() => createNearbySearchHandler({ nearby: setup().nearby, prefix: "/x", authenticate: async () => null, routes: { place: "/spots" } }), RangeError);
});
