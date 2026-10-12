// SPDX-License-Identifier: Apache-2.0
// In-memory NearbyStore for tests, prototypes and small per-process datasets. Places are bucketed by geohash cell
// (per tenant); a search visits only the cells that cover its bounding boxes, then checks the box and the exact
// distance. When the boxes would need more than `maxCells` cells (huge radii, polar caps) it scans the tenant's
// places instead. Lost on restart; production needs a database (see schema.sql and sql-store.ts).
import { geohashCellDegrees, geohashEncode, haversineUnchecked } from "./core.js";
import type { BoundingBox, NearbyStore, StoredPlace, StoreHit, StoreSearch } from "./core.js";

export interface MemoryNearbyStoreOptions {
  /** Geohash length of the index cells (1 to 9, default 5: about 4.9 km cells at the equator). */
  readonly cellLength?: number;
  /** Most cells a search may visit before falling back to a tenant scan (default 1,024). */
  readonly maxCells?: number;
}

const key = (tenantId: string, id: string): string => `${tenantId}\u0000${id}`;

export class MemoryNearbyStore implements NearbyStore {
  readonly #places = new Map<string, StoredPlace>();
  readonly #cells = new Map<string, Set<string>>();
  readonly #cellLength: number;
  readonly #maxCells: number;
  /** What the last search visited: index cells (0 for a tenant scan) and candidate rows examined. */
  lastScan = { cells: 0, examined: 0 };

  constructor(options: MemoryNearbyStoreOptions = {}) {
    this.#cellLength = options.cellLength ?? 5;
    this.#maxCells = options.maxCells ?? 1024;
    if (!Number.isInteger(this.#cellLength) || this.#cellLength < 1 || this.#cellLength > 9) throw new RangeError("cellLength must be 1 to 9");
    if (!Number.isInteger(this.#maxCells) || this.#maxCells < 1) throw new RangeError("maxCells must be a positive integer");
  }

  /** Copies of every stored row (for tests that check what is persisted). */
  dump(): StoredPlace[] {
    return [...this.#places.values()].map((place) => ({ ...place }));
  }

  #cellKey(tenantId: string, lat: number, lng: number): string {
    return key(tenantId, geohashEncode(lat, lng, this.#cellLength));
  }

  #unindex(place: StoredPlace): void {
    const cell = this.#cellKey(place.tenantId, place.lat, place.lng);
    const bucket = this.#cells.get(cell);
    bucket?.delete(key(place.tenantId, place.id));
    if (bucket && bucket.size === 0) this.#cells.delete(cell);
  }

  async upsert(place: StoredPlace): Promise<"created" | "updated" | "forbidden"> {
    const k = key(place.tenantId, place.id);
    const existing = this.#places.get(k);
    if (existing && existing.ownerId !== place.ownerId) return "forbidden";
    if (existing) this.#unindex(existing);
    this.#places.set(k, { ...place });
    const cell = this.#cellKey(place.tenantId, place.lat, place.lng);
    let bucket = this.#cells.get(cell);
    if (!bucket) { bucket = new Set(); this.#cells.set(cell, bucket); }
    bucket.add(k);
    return existing ? "updated" : "created";
  }

  async remove(tenantId: string, id: string, ownerId: string): Promise<boolean> {
    const k = key(tenantId, id);
    const existing = this.#places.get(k);
    if (!existing || existing.ownerId !== ownerId) return false;
    this.#unindex(existing);
    this.#places.delete(k);
    return true;
  }

  /** Geohash cells covering the boxes, or null when more than maxCells would be needed. */
  #coveringCells(boxes: readonly BoundingBox[]): Set<string> | null {
    const size = geohashCellDegrees(this.#cellLength);
    const cells = new Set<string>();
    for (const box of boxes) {
      const rows = Math.ceil((box.maxLat - box.minLat) / size.lat) + 1;
      const cols = Math.ceil((box.maxLng - box.minLng) / size.lng) + 1;
      if (rows * cols + cells.size > this.#maxCells) return null;
      // Samples at most one cell apart, plus both edges, touch every cell the box intersects.
      const samples = (lo: number, hi: number, stepSize: number): number[] => {
        const out: number[] = [];
        for (let v = lo; v < hi; v += stepSize) out.push(v);
        out.push(hi);
        return out;
      };
      for (const lat of samples(box.minLat, box.maxLat, size.lat)) {
        for (const lng of samples(box.minLng, box.maxLng, size.lng)) cells.add(geohashEncode(lat, lng, this.#cellLength));
      }
    }
    return cells;
  }

  async search(query: StoreSearch): Promise<StoreHit[]> {
    const { tenantId, viewerId, center, radiusMeters, boxes, after, limit } = query;
    const cells = this.#coveringCells(boxes);
    let candidates: Iterable<string>;
    if (cells) {
      const keys: string[] = [];
      for (const cell of cells) for (const k of this.#cells.get(key(tenantId, cell)) ?? []) keys.push(k);
      candidates = keys;
    } else {
      const prefix = key(tenantId, "");
      candidates = [...this.#places.keys()].filter((k) => k.startsWith(prefix));
    }
    let examined = 0;
    const hits: StoreHit[] = [];
    for (const k of candidates) {
      const place = this.#places.get(k);
      if (!place) continue;
      examined++;
      if (place.tenantId !== tenantId) continue;
      if (place.visibility === "private" && place.ownerId !== viewerId) continue;
      if (!boxes.some((b) => place.lat >= b.minLat && place.lat <= b.maxLat && place.lng >= b.minLng && place.lng <= b.maxLng)) continue;
      const distanceMeters = haversineUnchecked(center.lat, center.lng, place.lat, place.lng);
      if (distanceMeters > radiusMeters) continue;
      if (after && (distanceMeters < after.distanceMeters || (distanceMeters === after.distanceMeters && place.id <= after.id))) continue;
      hits.push({ place: { ...place }, distanceMeters });
    }
    this.lastScan = { cells: cells?.size ?? 0, examined };
    hits.sort((a, b) => a.distanceMeters - b.distanceMeters || (a.place.id < b.place.id ? -1 : a.place.id > b.place.id ? 1 : 0));
    return hits.slice(0, limit);
  }
}
