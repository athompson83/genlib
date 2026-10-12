# Nearby search by distance · 0.1.0

## What installs

Five original Apache-2.0 files under `nearby-search/`:

- `core.ts`: `createNearbySearch` (`search`, `upsert`, `remove`), `NearbySearchError`, the `NearbyStore` interface, and the helpers `validateCoordinates`, `haversineMeters`, `boundingBoxes`, `geohashEncode`, `geohashBounds` and `snapToCell`.
- `memory-store.ts`: `MemoryNearbyStore`, a per-process store with a geohash-cell index, for tests, prototypes and small datasets.
- `http.ts`: `createNearbySearchHandler`, an optional server-only Fetch `Request`/`Response` adapter.
- `schema.sql` and `sql-store.ts`: the `nearby_places` table and `createSqlNearbyStore(executor, { table? })`, for any `query(text, params)` executor with `$1` placeholders (node-postgres, Neon, PGlite, or postgres.js through a small wrapper). Plain PostgreSQL; no PostGIS or extension.

There is no hidden database, session or rate limiter. The application supplies the store, the signed-in viewer and the limiter.

## When to use it

Use it for "near me" features: store or venue locators, nearby listings, people or drivers nearby, within one tenant of your app. It answers "which places are within R meters of this point, nearest first", with pages. Do not use it for routing, travel time, geocoding addresses or polygons (delivery zones); those need a routing engine, a geocoder or PostGIS.

## Integration points

| Point | What the application supplies |
| --- | --- |
| `store` | On PostgreSQL, apply `schema.sql` and call `createSqlNearbyStore(db)`. Elsewhere, implement `NearbyStore`: an atomic owner-checked upsert, a bounding-box prefilter on the shared `lat`/`lng`, the exact distance, and order by distance then id (byte order). |
| viewer `{tenantId, userId}` | From your verified session. The tenant never comes from the request. |
| place `visibility` | `public` (everyone in the tenant sees the exact point), `approximate` (others see only a snapped cell and a rounded distance) or `private` (owner only). |
| `privacy` | `precisionMeters` (default 1,000; minimum cell side), `distanceStepMeters` (default the precision), `approximateCoordinates` (`"cell"` or `"none"`). |
| limits | `maxRadiusMeters` (default 50,000), `defaultLimit` (20), `maxLimit` (100). |
| HTTP `authenticate`, `allowedOrigins`, `rateLimit`, `routes`, `statusFor` | Your session lookup, exact origins for cookie-authenticated writes, your limiter (see the `rate-limit` module), and path or status overrides. |

```ts
import { createNearbySearch } from "./genlib/nearby-search/core.js";
import { createSqlNearbyStore } from "./genlib/nearby-search/sql-store.js";
import { createNearbySearchHandler } from "./genlib/nearby-search/http.js";

const nearby = createNearbySearch({ store: createSqlNearbyStore(db), privacy: { precisionMeters: 1_000 } });
await nearby.upsert({ tenantId, userId }, { id: "store-42", lat: 51.5074, lng: -0.1278, label: "Soho" });
const page = await nearby.search({ tenantId, userId }, { lat: 51.51, lng: -0.13, radiusMeters: 5_000, limit: 20 });

export const handler = createNearbySearchHandler({
  nearby, prefix: "/api/nearby", allowedOrigins: [APP_ORIGIN],
  authenticate: async (request) => sessionViewer(request), rateLimit: (key) => limiter.allow(key),
  routes: { search: "/search", place: "/places/:id" }, statusFor: { forbidden: 409 },
});
```

## Behavior

- **Coordinates.** Latitude must be a finite number in [-90, 90] and longitude in [-180, 180]. Anything else, including strings and `NaN`, fails with `invalid-coordinates`.
- **Distance.** Haversine on a sphere with the mean Earth radius (6,371,008.8 m), in meters. Results report whole meters.
- **Prefilter.** `boundingBoxes(center, radius)` returns one box, or two when the circle crosses the antimeridian. When the circle reaches a pole, the box covers every longitude. The longitude half-width is the exact spherical-cap extent, `asin(sin(r)/cos(lat))`. Stores filter on these boxes first, then check the exact distance.
- **Spatial index.** The memory store buckets places by geohash cell (length 5 by default) and visits only the cells that cover the boxes; past `maxCells` (1,024) it scans the tenant. The SQL store filters with `lat BETWEEN ... AND lng BETWEEN ...` on the `(tenant_id, lat, lng)` B-tree index, then computes the haversine distance in SQL.
- **Order and pages.** Results are nearest first, ties broken by id. Pages use a keyset `(distance, id)` cursor, so inserts between pages neither repeat nor skip rows. A cursor is bound to the exact center and radius; reusing it with another query fails with `invalid-cursor`. The radius must be greater than 0 and at most `maxRadiusMeters`.
- **Tenants and visibility.** A search only sees the viewer's tenant. Private places are returned only to their owner. Only the owner can update or delete a place: the SQL upsert is one `INSERT ... ON CONFLICT ... DO UPDATE ... WHERE owner_id = EXCLUDED.owner_id`, so two users cannot both claim an id. `PUT` on another user's id is `forbidden`; `DELETE` on a missing or foreign id is `not-found`. The core also drops any row a store returns for another tenant or a private place of someone else.
- **Location privacy.** An `approximate` place is snapped when written to the centre of the longest geohash cell whose sides are both at least `precisionMeters` at its latitude (cells get coarser near the poles). Only that cell centre is used for filtering, ordering and distance. Other viewers get `precision: "approximate"`, the cell centre (or no coordinates with `approximateCoordinates: "none"`), `precisionMeters`, and a distance rounded up to `distanceStepMeters` (never below one step). Exact coordinates of approximate and private places are returned only to the owner. Moving within a cell changes nothing other viewers can see.

## HTTP routes

| Route (default) | Body | Result |
| --- | --- | --- |
| `GET {prefix}/search?lat=&lng=&radius=&limit=&cursor=` | none | `200 {results, nextCursor}` |
| `PUT {prefix}/places/:id` | `{lat, lng, visibility?, label?}` | `201 {id, created: true}` or `200 {id, created: false}` |
| `DELETE {prefix}/places/:id` | none | `204` |

`routes: { search, place }` changes the paths (`place` must contain one `:id`). `statusFor` maps error codes to statuses over these defaults:

- 400 for `invalid-coordinates`, `invalid-radius`, `invalid-cursor`, `invalid-input`, `bad-request` (non-JSON or a body over `maxRequestBytes`, default 4,096) and `invalid-json`
- 401 `unauthenticated` when `authenticate` returns null
- 403 `forbidden` (another user's place) and `forbidden-origin` (write without an allowed `Origin`, when `allowedOrigins` is set)
- 404 `not-found` (place) and `no-route` (path outside the routes)
- 405 `method-not-allowed`, 429 `rate-limited` (`rateLimit` called with `search:<tenant>:<user>` or `write:<tenant>:<user>`)

Query numbers must be plain decimals (`1e1` is refused). Every response carries `cache-control: no-store`.

## Verify

`npm run build && node --test tests/nearby-search.test.mjs tests/nearby-search-sql.test.mjs` covers these cases:

- coordinate validation and haversine vectors, including antipodes and the antimeridian
- bounding boxes at the antimeridian and poles, plus a deterministic fuzz that every circle point is inside a box
- nearest-first radius search with meters, radius and limit validation
- keyset pagination with ties, inserts between pages, and cursor binding
- antimeridian and polar searches (memory and PGlite)
- the memory cell index examining a handful of 400 places, and the PostgreSQL plan using `nearby_places_tenant_lat_lng`
- tenant and visibility scoping, owner-only writes, and concurrent upserts with one owner (memory and PGlite)
- approximate places: snapped cell, rounded distance, no exact coordinates in responses, owner sees exact
- HTTP statuses and headers, and `routes`/`statusFor` overrides

In the receiving app, run the same cases against your real store, then `EXPLAIN` the search query on production-sized data.

## If something fails

- **Places near the date line or a pole are missing:** your own store is probably filtering one box with `minLng <= lng <= maxLng`. Apply every box in `query.boxes` (OR them).
- **Pages repeat or skip rows:** your store must order by `(distance, id)` with a byte-order id comparison (`COLLATE "C"`) and apply `after` with the same distance expression it orders by.
- **The plan scans the whole table:** check the `(tenant_id, lat, lng)` index exists and run `ANALYZE`. For dense global data, add PostGIS (`geography` column, GiST index, `ST_DWithin`) or earthdistance (`CREATE EXTENSION cube; CREATE EXTENSION earthdistance;`, a GiST index on `ll_to_earth(lat, lng)`, `earth_box(ll_to_earth($lat, $lng), $r) @> ll_to_earth(lat, lng)`), keeping the same result contract.

## Limits

- **Accuracy.** The sphere is within about 0.5% of WGS 84 geodesic distances.
- **Approximate filtering.** Filtering uses the cell centre, so a place just inside the radius by its exact point can be left out, and the reverse. Repeated radius probes can locate the cell but not the point inside it. Cursors carry the unrounded distance to the cell centre.
- **Mixed rounding.** Rounded approximate distances can appear out of numeric order next to exact ones.
- **Precision changes.** A new `precisionMeters` applies to places written afterwards.
- **Testing scope.** PGlite runs as a single connection, so the concurrency test checks the conditional statement, not real multi-connection contention.

Authentication, rate-limit storage, production query plans at your scale and consuming-application acceptance remain project responsibilities.
