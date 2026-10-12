// SPDX-License-Identifier: Apache-2.0
// Nearby search by distance, framework-neutral. Validated coordinates, haversine meters on a sphere, a bounding-box
// prefilter that splits at the antimeridian and opens at the poles, nearest-first results with keyset pagination on
// (distance, id), tenant and visibility scoping, and location privacy: "approximate" places are stored, filtered,
// ordered and returned by a fixed geohash cell centre, so other viewers never receive (or can probe for) the exact
// point. The application supplies persistence (memory-store.ts, sql-store.ts or its own NearbyStore) and the
// authenticated viewer.

export const EARTH_RADIUS_M = 6_371_008.8;
const BASE32 = "0123456789bcdefghjkmnpqrstuvwxyz";
const M_PER_DEG = (Math.PI / 180) * EARTH_RADIUS_M;
const rad = (degrees: number): number => (degrees * Math.PI) / 180;
const deg = (radians: number): number => (radians * 180) / Math.PI;

export type NearbyErrorCode =
  | "invalid-coordinates" | "invalid-radius" | "invalid-cursor" | "invalid-input" | "forbidden" | "not-found";

export class NearbySearchError extends Error {
  readonly code: NearbyErrorCode;
  constructor(code: NearbyErrorCode, message: string) {
    super(message);
    this.name = "NearbySearchError";
    this.code = code;
  }
}

export interface Coordinates { readonly lat: number; readonly lng: number }

/** Returns `{lat, lng}` when both are finite numbers in [-90, 90] and [-180, 180]; otherwise invalid-coordinates. */
export function validateCoordinates(input: unknown): Coordinates {
  const value = input as { lat?: unknown; lng?: unknown } | null;
  const lat = value && typeof value === "object" ? value.lat : undefined;
  const lng = value && typeof value === "object" ? value.lng : undefined;
  if (typeof lat !== "number" || !Number.isFinite(lat) || lat < -90 || lat > 90) {
    throw new NearbySearchError("invalid-coordinates", "Latitude must be a number from -90 to 90");
  }
  if (typeof lng !== "number" || !Number.isFinite(lng) || lng < -180 || lng > 180) {
    throw new NearbySearchError("invalid-coordinates", "Longitude must be a number from -180 to 180");
  }
  return { lat, lng };
}

/** Great-circle distance in meters on the mean-radius sphere (within about 0.5% of WGS 84). */
export function haversineMeters(a: Coordinates, b: Coordinates): number {
  const p = validateCoordinates(a);
  const q = validateCoordinates(b);
  return haversineUnchecked(p.lat, p.lng, q.lat, q.lng);
}

export function haversineUnchecked(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const h = Math.sin(rad(lat2 - lat1) / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(rad(lng2 - lng1) / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

export interface BoundingBox { readonly minLat: number; readonly maxLat: number; readonly minLng: number; readonly maxLng: number }

const PAD = 1e-9;

/**
 * One or two boxes that together contain every point within radiusMeters. A box that would cross the antimeridian is
 * split into two; a circle that reaches a pole gets the full longitude range. Use them as an indexed prefilter, then
 * check the exact distance.
 */
export function boundingBoxes(center: Coordinates, radiusMeters: number): BoundingBox[] {
  const { lat, lng } = validateCoordinates(center);
  if (typeof radiusMeters !== "number" || !Number.isFinite(radiusMeters) || radiusMeters < 0) {
    throw new NearbySearchError("invalid-radius", "Radius must be a non-negative number of meters");
  }
  const angular = radiusMeters / EARTH_RADIUS_M;
  const minLat = lat - deg(angular) - PAD;
  const maxLat = lat + deg(angular) + PAD;
  const full: BoundingBox = { minLat: Math.max(-90, minLat), maxLat: Math.min(90, maxLat), minLng: -180, maxLng: 180 };
  if (minLat <= -90 || maxLat >= 90) return [full];
  // Widest longitude offset of a spherical cap: asin(sin(r) / cos(lat)).
  const s = Math.sin(angular) / Math.cos(rad(lat));
  if (s >= 1) return [full];
  const dLng = deg(Math.asin(s)) + PAD;
  if (dLng >= 180) return [full];
  const west = lng - dLng;
  const east = lng + dLng;
  if (west < -180) {
    return [{ minLat, maxLat, minLng: west + 360, maxLng: 180 }, { minLat, maxLat, minLng: -180, maxLng: east }];
  }
  if (east > 180) {
    return [{ minLat, maxLat, minLng: west, maxLng: 180 }, { minLat, maxLat, minLng: -180, maxLng: east - 360 }];
  }
  return [{ minLat, maxLat, minLng: west, maxLng: east }];
}

/** Standard geohash (longitude bit first) of 1 to 12 characters. */
export function geohashEncode(lat: number, lng: number, length: number): string {
  validateCoordinates({ lat, lng });
  if (!Number.isInteger(length) || length < 1 || length > 12) throw new RangeError("geohash length must be 1 to 12");
  let latLo = -90, latHi = 90, lngLo = -180, lngHi = 180;
  let out = "";
  let even = true;
  let bits = 0;
  let value = 0;
  while (out.length < length) {
    if (even) {
      const mid = (lngLo + lngHi) / 2;
      value = value * 2 + (lng >= mid ? 1 : 0);
      if (lng >= mid) lngLo = mid; else lngHi = mid;
    } else {
      const mid = (latLo + latHi) / 2;
      value = value * 2 + (lat >= mid ? 1 : 0);
      if (lat >= mid) latLo = mid; else latHi = mid;
    }
    even = !even;
    if (++bits === 5) { out += BASE32[value]; bits = 0; value = 0; }
  }
  return out;
}

/** Cell bounds of a geohash. */
export function geohashBounds(hash: string): BoundingBox {
  let latLo = -90, latHi = 90, lngLo = -180, lngHi = 180;
  let even = true;
  for (const ch of hash) {
    const value = BASE32.indexOf(ch);
    if (value < 0) throw new RangeError("invalid geohash character");
    for (let bit = 4; bit >= 0; bit--) {
      const on = Math.floor(value / 2 ** bit) % 2 === 1;
      if (even) { const mid = (lngLo + lngHi) / 2; if (on) lngLo = mid; else lngHi = mid; }
      else { const mid = (latLo + latHi) / 2; if (on) latLo = mid; else latHi = mid; }
      even = !even;
    }
  }
  return { minLat: latLo, maxLat: latHi, minLng: lngLo, maxLng: lngHi };
}

/** Height and width of a geohash cell of `length` characters, in degrees. */
export function geohashCellDegrees(length: number): { lat: number; lng: number } {
  return { lat: 180 / 2 ** Math.floor((5 * length) / 2), lng: 360 / 2 ** Math.ceil((5 * length) / 2) };
}

export interface SnappedCell extends Coordinates {
  readonly geohash: string;
  /** The cell's smaller side in meters at this latitude (at least the requested precision away from the poles). */
  readonly cellMeters: number;
}

/**
 * Snaps a point to the centre of the longest geohash cell whose sides are both at least precisionMeters at the
 * point's latitude. The grid is fixed, so every point inside a cell maps to the same shared location. Cells get
 * coarser toward the poles; the result can be up to about eight times the requested precision in area.
 */
export function snapToCell(point: Coordinates, precisionMeters: number): SnappedCell {
  const { lat, lng } = validateCoordinates(point);
  if (!Number.isFinite(precisionMeters) || precisionMeters <= 0) throw new RangeError("precisionMeters must be positive");
  const cosLat = Math.cos(rad(lat));
  const sides = (length: number) => {
    const cell = geohashCellDegrees(length);
    return { height: cell.lat * M_PER_DEG, width: cell.lng * M_PER_DEG * Math.max(0, cosLat) };
  };
  let length = 1;
  for (let n = 2; n <= 12; n++) {
    const { height, width } = sides(n);
    if (Math.min(height, width) < precisionMeters) break;
    length = n;
  }
  const geohash = geohashEncode(lat, lng, length);
  const box = geohashBounds(geohash);
  const { height, width } = sides(length);
  const fits = Math.min(height, width) >= precisionMeters;
  return {
    lat: (box.minLat + box.maxLat) / 2, lng: (box.minLng + box.maxLng) / 2, geohash,
    cellMeters: Math.round(fits ? Math.min(height, width) : height),
  };
}

export type Visibility = "public" | "approximate" | "private";

/** What a store persists. `lat`/`lng` is the shared location used for filtering, ordering and distances. */
export interface StoredPlace {
  readonly tenantId: string;
  readonly id: string;
  readonly ownerId: string;
  readonly visibility: Visibility;
  /** Exact for public and private places; the snapped cell centre for approximate places. */
  readonly lat: number;
  readonly lng: number;
  /** Returned only to the owner. */
  readonly exactLat: number;
  readonly exactLng: number;
  /** Cell size of an approximate place. */
  readonly precisionMeters?: number;
  readonly label?: string;
}

export interface StoreSearch {
  readonly tenantId: string;
  /** Private places are included only when ownerId equals this. */
  readonly viewerId: string;
  readonly center: Coordinates;
  readonly radiusMeters: number;
  /** Prefilter boxes on the shared lat/lng (one, or two at the antimeridian). */
  readonly boxes: readonly BoundingBox[];
  /** Keyset position: return only rows ordered after (distanceMeters, id). */
  readonly after?: { readonly distanceMeters: number; readonly id: string };
  readonly limit: number;
}

export interface StoreHit { readonly place: StoredPlace; readonly distanceMeters: number }

export interface NearbyStore {
  /**
   * Inserts or updates the place keyed by (tenantId, id). Returns "forbidden" without changing anything when the
   * existing row has another ownerId. Must be one atomic statement (or equivalent) so two owners cannot both win.
   */
  upsert(place: StoredPlace): Promise<"created" | "updated" | "forbidden">;
  /** Deletes the place only if ownerId matches; returns whether a row was deleted. */
  remove(tenantId: string, id: string, ownerId: string): Promise<boolean>;
  /**
   * Places of the tenant visible to the viewer whose shared location is within radiusMeters of center, ordered by
   * (distance, id) with ids compared by code unit / byte, after the keyset position, at most `limit` rows.
   */
  search(query: StoreSearch): Promise<StoreHit[]>;
}

export interface Viewer { readonly tenantId: string; readonly userId: string }

export interface PlaceInput {
  readonly id: string;
  readonly lat: number;
  readonly lng: number;
  /** Default "public". "approximate": others see only a snapped cell and a rounded distance. "private": owner only. */
  readonly visibility?: Visibility;
  /** Shown to everyone who can see the place. At most 200 characters. */
  readonly label?: string;
}

export interface SearchInput {
  readonly lat: number;
  readonly lng: number;
  readonly radiusMeters: number;
  readonly limit?: number;
  readonly cursor?: string;
}

export interface NearbyResult {
  readonly id: string;
  /** Meters to the shared location: rounded to 1 m, or up to the privacy step for others' approximate places. */
  readonly distanceMeters: number;
  readonly precision: "exact" | "approximate";
  /** Exact for public and owned places; the cell centre (or absent) for others' approximate places. */
  readonly location?: Coordinates;
  readonly precisionMeters?: number;
  readonly ownedByViewer: boolean;
  readonly label?: string;
}

export interface SearchPage { readonly results: NearbyResult[]; readonly nextCursor: string | null }

export interface PrivacyOptions {
  /** Minimum cell side for approximate places, in meters (100 to 2,500,000; default 1,000). */
  readonly precisionMeters?: number;
  /** Rounding step for others' approximate distances (default precisionMeters). Distances round up, minimum one step. */
  readonly distanceStepMeters?: number;
  /** "cell" (default) returns the cell centre for others' approximate places; "none" returns no coordinates. */
  readonly approximateCoordinates?: "cell" | "none";
}

export interface NearbySearchOptions {
  readonly store: NearbyStore;
  /** Largest accepted search radius (default 50,000 m, at most 20,000,000). */
  readonly maxRadiusMeters?: number;
  readonly defaultLimit?: number;
  /** Largest page size (default 100). */
  readonly maxLimit?: number;
  readonly privacy?: PrivacyOptions;
}

export interface NearbySearch {
  search(viewer: Viewer, input: SearchInput): Promise<SearchPage>;
  upsert(actor: Viewer, input: PlaceInput): Promise<{ id: string; created: boolean }>;
  remove(actor: Viewer, id: string): Promise<void>;
}

const ID = /^[A-Za-z0-9_.:-]{1,128}$/;

function checkViewer(viewer: unknown): Viewer {
  const v = viewer as { tenantId?: unknown; userId?: unknown } | null;
  const ok = (s: unknown) => typeof s === "string" && s.length > 0 && s.length <= 256;
  if (!v || typeof v !== "object" || !ok(v.tenantId) || !ok(v.userId)) throw new NearbySearchError("invalid-input", "Invalid viewer");
  return { tenantId: v.tenantId as string, userId: v.userId as string };
}

function encodeCursor(parts: readonly unknown[]): string {
  return btoa(JSON.stringify(parts)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function decodeCursor(cursor: string, query: readonly number[]): { distanceMeters: number; id: string } {
  const bad = () => new NearbySearchError("invalid-cursor", "Invalid or mismatched cursor");
  if (typeof cursor !== "string" || cursor.length > 1024 || !/^[A-Za-z0-9_-]+$/.test(cursor)) throw bad();
  let parts: unknown;
  try {
    parts = JSON.parse(atob(cursor.replace(/-/g, "+").replace(/_/g, "/")));
  } catch {
    throw bad();
  }
  if (!Array.isArray(parts) || parts.length !== 6 || parts[0] !== 1) throw bad();
  const [, lat, lng, radius, distance, id] = parts as unknown[];
  if (lat !== query[0] || lng !== query[1] || radius !== query[2]) throw bad();
  if (typeof distance !== "number" || !Number.isFinite(distance) || distance < 0 || typeof id !== "string" || !ID.test(id)) throw bad();
  return { distanceMeters: distance, id };
}

export function createNearbySearch(options: NearbySearchOptions): NearbySearch {
  const { store } = options;
  const maxRadius = options.maxRadiusMeters ?? 50_000;
  if (!(maxRadius > 0 && maxRadius <= 20_000_000)) throw new RangeError("maxRadiusMeters must be in (0, 20,000,000]");
  const maxLimit = options.maxLimit ?? 100;
  const defaultLimit = options.defaultLimit ?? Math.min(20, maxLimit);
  if (!Number.isInteger(maxLimit) || maxLimit < 1 || maxLimit > 1000) throw new RangeError("maxLimit must be 1 to 1000");
  if (!Number.isInteger(defaultLimit) || defaultLimit < 1 || defaultLimit > maxLimit) throw new RangeError("defaultLimit must be 1 to maxLimit");
  const precision = options.privacy?.precisionMeters ?? 1_000;
  if (!(precision >= 100 && precision <= 2_500_000)) throw new RangeError("privacy.precisionMeters must be 100 to 2,500,000");
  const step = options.privacy?.distanceStepMeters ?? precision;
  if (!(step >= 1 && step <= 2_500_000)) throw new RangeError("privacy.distanceStepMeters must be 1 to 2,500,000");
  const coordinatesMode = options.privacy?.approximateCoordinates ?? "cell";
  if (coordinatesMode !== "cell" && coordinatesMode !== "none") throw new RangeError("privacy.approximateCoordinates must be cell or none");

  function visibleTo(place: StoredPlace, viewer: Viewer): boolean {
    return place.tenantId === viewer.tenantId && (place.visibility !== "private" || place.ownerId === viewer.userId);
  }

  function present(hit: StoreHit, viewer: Viewer): NearbyResult {
    const { place } = hit;
    const owned = place.ownerId === viewer.userId;
    const label = place.label === undefined ? {} : { label: place.label };
    if (place.visibility === "approximate" && !owned) {
      return {
        id: place.id,
        distanceMeters: Math.max(step, Math.ceil(hit.distanceMeters / step) * step),
        precision: "approximate",
        ...(coordinatesMode === "cell" ? { location: { lat: place.lat, lng: place.lng } } : {}),
        ...(place.precisionMeters === undefined ? {} : { precisionMeters: place.precisionMeters }),
        ownedByViewer: false,
        ...label,
      };
    }
    return {
      id: place.id,
      distanceMeters: Math.round(hit.distanceMeters),
      precision: "exact",
      location: owned ? { lat: place.exactLat, lng: place.exactLng } : { lat: place.lat, lng: place.lng },
      ownedByViewer: owned,
      ...label,
    };
  }

  return {
    async search(viewerInput, input) {
      const viewer = checkViewer(viewerInput);
      const center = validateCoordinates(input);
      const radius = input.radiusMeters;
      if (typeof radius !== "number" || !Number.isFinite(radius) || radius <= 0 || radius > maxRadius) {
        throw new NearbySearchError("invalid-radius", `Radius must be greater than 0 and at most ${maxRadius} meters`);
      }
      const limit = input.limit ?? defaultLimit;
      if (!Number.isInteger(limit) || limit < 1 || limit > maxLimit) throw new NearbySearchError("invalid-input", `Limit must be 1 to ${maxLimit}`);
      const after = input.cursor === undefined ? undefined : decodeCursor(input.cursor, [center.lat, center.lng, radius]);
      const hits = await store.search({
        tenantId: viewer.tenantId, viewerId: viewer.userId, center, radiusMeters: radius,
        boxes: boundingBoxes(center, radius), limit: limit + 1, ...(after ? { after } : {}),
      });
      const page = hits.slice(0, limit);
      // Defense in depth: never present a row the store should not have returned.
      const results = page.filter((hit) => visibleTo(hit.place, viewer) && hit.distanceMeters <= radius).map((hit) => present(hit, viewer));
      const last = page.at(-1);
      const nextCursor = hits.length > limit && last ? encodeCursor([1, center.lat, center.lng, radius, last.distanceMeters, last.place.id]) : null;
      return { results, nextCursor };
    },

    async upsert(actorInput, input) {
      const actor = checkViewer(actorInput);
      if (!input || typeof input !== "object" || typeof input.id !== "string" || !ID.test(input.id)) {
        throw new NearbySearchError("invalid-input", "Place id must be 1 to 128 letters, digits or _ . : -");
      }
      const exact = validateCoordinates(input);
      const visibility = input.visibility ?? "public";
      if (visibility !== "public" && visibility !== "approximate" && visibility !== "private") {
        throw new NearbySearchError("invalid-input", "Visibility must be public, approximate or private");
      }
      if (input.label !== undefined && (typeof input.label !== "string" || input.label.length > 200)) {
        throw new NearbySearchError("invalid-input", "Label must be a string of at most 200 characters");
      }
      const cell = visibility === "approximate" ? snapToCell(exact, precision) : undefined;
      const outcome = await store.upsert({
        tenantId: actor.tenantId, id: input.id, ownerId: actor.userId, visibility,
        lat: cell ? cell.lat : exact.lat, lng: cell ? cell.lng : exact.lng, exactLat: exact.lat, exactLng: exact.lng,
        ...(cell ? { precisionMeters: cell.cellMeters } : {}),
        ...(input.label === undefined ? {} : { label: input.label }),
      });
      if (outcome === "forbidden") throw new NearbySearchError("forbidden", "This place belongs to another user");
      return { id: input.id, created: outcome === "created" };
    },

    async remove(actorInput, id) {
      const actor = checkViewer(actorInput);
      if (typeof id !== "string" || !ID.test(id)) throw new NearbySearchError("not-found", "Place not found");
      if (!(await store.remove(actor.tenantId, id, actor.userId))) throw new NearbySearchError("not-found", "Place not found");
    },
  };
}
