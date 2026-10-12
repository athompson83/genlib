// SPDX-License-Identifier: Apache-2.0
// NearbyStore on PostgreSQL through any `query(text, params)` executor that uses $1 placeholders and returns
// { rows } (node-postgres Pool or Client, postgres.js via a thin wrapper, Neon serverless, PGlite). Apply schema.sql
// first. Searches use a bounding-box prefilter on the indexed (tenant_id, lat, lng) columns, then the exact haversine
// distance, keyset pagination on (distance, id COLLATE "C"), and visibility in the WHERE clause. Upsert is one
// INSERT ... ON CONFLICT ... DO UPDATE ... WHERE owner_id matches, so a place cannot change owner under concurrency.
import type { NearbyStore, StoredPlace, StoreHit, Visibility } from "./core.js";
import { EARTH_RADIUS_M } from "./core.js";

export interface SqlExecutor {
  query(text: string, params?: readonly unknown[]): Promise<{ rows: Record<string, unknown>[] }>;
}

export interface SqlNearbyStoreOptions {
  /** Table name (default nearby_places). Lowercase letters, digits and underscores only. */
  readonly table?: string;
}

const COLUMNS = "tenant_id, id, owner_id, visibility, lat, lng, exact_lat, exact_lng, precision_m, label";

function toPlace(row: Record<string, unknown>): StoredPlace {
  return {
    tenantId: String(row.tenant_id), id: String(row.id), ownerId: String(row.owner_id),
    visibility: String(row.visibility) as Visibility,
    lat: Number(row.lat), lng: Number(row.lng), exactLat: Number(row.exact_lat), exactLng: Number(row.exact_lng),
    ...(row.precision_m == null ? {} : { precisionMeters: Number(row.precision_m) }),
    ...(row.label == null ? {} : { label: String(row.label) }),
  };
}

export function createSqlNearbyStore(db: SqlExecutor, options: SqlNearbyStoreOptions = {}): NearbyStore {
  const table = options.table ?? "nearby_places";
  if (!/^[a-z_][a-z0-9_]{0,62}$/.test(table)) throw new RangeError("Invalid table name");

  return {
    async upsert(place) {
      const { rows } = await db.query(
        `INSERT INTO ${table} AS t (${COLUMNS}) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         ON CONFLICT (tenant_id, id) DO UPDATE SET visibility = EXCLUDED.visibility, lat = EXCLUDED.lat, lng = EXCLUDED.lng,
           exact_lat = EXCLUDED.exact_lat, exact_lng = EXCLUDED.exact_lng, precision_m = EXCLUDED.precision_m, label = EXCLUDED.label
         WHERE t.owner_id = EXCLUDED.owner_id
         RETURNING (t.xmax::text = '0') AS created`,
        [place.tenantId, place.id, place.ownerId, place.visibility, place.lat, place.lng, place.exactLat, place.exactLng,
          place.precisionMeters ?? null, place.label ?? null],
      );
      const row = rows[0];
      if (!row) return "forbidden";
      return row.created === true || row.created === "t" ? "created" : "updated";
    },

    async remove(tenantId, id, ownerId) {
      const { rows } = await db.query(`DELETE FROM ${table} WHERE tenant_id = $1 AND id = $2 AND owner_id = $3 RETURNING id`, [tenantId, id, ownerId]);
      return rows.length === 1;
    },

    async search(query) {
      const params: unknown[] = [query.tenantId, query.viewerId, query.center.lat, query.center.lng, query.radiusMeters];
      const p = (value: unknown): string => { params.push(value); return `$${params.length}`; };
      if (query.boxes.length === 0) return [];
      const boxSql = query.boxes
        .map((b) => `(lat BETWEEN ${p(b.minLat)} AND ${p(b.maxLat)} AND lng BETWEEN ${p(b.minLng)} AND ${p(b.maxLng)})`)
        .join(" OR ");
      const distance = `2 * ${EARTH_RADIUS_M} * asin(least(1, sqrt(power(sin(radians(lat - $3::float8) / 2), 2)`
        + ` + cos(radians($3::float8)) * cos(radians(lat)) * power(sin(radians(lng - $4::float8) / 2), 2))))`;
      const keyset = query.after
        ? ` AND (distance_m > ${p(query.after.distanceMeters)}::float8 OR (distance_m = $${params.length}::float8 AND id COLLATE "C" > ${p(query.after.id)}))`
        : "";
      const limit = p(query.limit);
      const { rows } = await db.query(
        `WITH candidates AS (
           SELECT ${COLUMNS}, ${distance} AS distance_m FROM ${table}
           WHERE tenant_id = $1 AND (visibility <> 'private' OR owner_id = $2) AND (${boxSql})
         )
         SELECT * FROM candidates WHERE distance_m <= $5::float8${keyset}
         ORDER BY distance_m, id COLLATE "C" LIMIT ${limit}`,
        params,
      );
      return rows.map((row): StoreHit => ({ place: toPlace(row), distanceMeters: Number(row.distance_m) }));
    },
  };
}
