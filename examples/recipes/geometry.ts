// SPDX-License-Identifier: Apache-2.0
// Genlib recipe: planar point-in-polygon, signed area, centroid, Douglas-Peucker and ring area in m². Original source; copy and adapt.
// Points are [x, y] = [lon, lat]. Planar math on degrees suits hit tests and small shapes; use
// ringAreaSquareMeters (the spherical approximation Turf and Mapbox use) for real-world areas.

export type Point = readonly [number, number];
export const EARTH_RADIUS_M = 6378137;
const rad = (d: number) => (d * Math.PI) / 180;

/** Drops a duplicated closing point and requires at least 3 finite points. */
function ring(points: readonly Point[]): Point[] {
  const pts = [...points];
  const first = pts[0];
  const last = pts[pts.length - 1];
  if (pts.length >= 2 && first && last && first[0] === last[0] && first[1] === last[1]) pts.pop();
  if (pts.length < 3) throw new RangeError("a ring needs at least 3 distinct points");
  for (const [x, y] of pts) if (!Number.isFinite(x) || !Number.isFinite(y)) throw new RangeError("coordinates must be finite numbers");
  return pts;
}

const at = (pts: readonly Point[], i: number): Point => pts[i % pts.length] as Point;

/** Even-odd test; points exactly on an edge or vertex count as inside. */
export function pointInPolygon(point: Point, polygon: readonly Point[]): boolean {
  const [x, y] = point;
  const pts = ring(polygon);
  let inside = false;
  for (let i = 0; i < pts.length; i++) {
    const [ax, ay] = at(pts, i);
    const [bx, by] = at(pts, i + 1);
    const cross = (bx - ax) * (y - ay) - (by - ay) * (x - ax);
    if (cross === 0 && Math.min(ax, bx) <= x && x <= Math.max(ax, bx) && Math.min(ay, by) <= y && y <= Math.max(ay, by)) return true;
    if (ay > y !== by > y && x < ((bx - ax) * (y - ay)) / (by - ay) + ax) inside = !inside;
  }
  return inside;
}

/** Shoelace area; counter-clockwise rings are positive. */
export function signedArea(polygon: readonly Point[]): number {
  const pts = ring(polygon);
  let sum = 0;
  for (let i = 0; i < pts.length; i++) {
    const [x0, y0] = at(pts, i);
    const [x1, y1] = at(pts, i + 1);
    sum += x0 * y1 - x1 * y0;
  }
  return sum / 2;
}

/** Area-weighted centroid; throws for a ring with zero area. */
export function centroid(polygon: readonly Point[]): [number, number] {
  const pts = ring(polygon);
  const a = signedArea(pts);
  if (a === 0) throw new RangeError("centroid is undefined for a ring with zero area");
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < pts.length; i++) {
    const [x0, y0] = at(pts, i);
    const [x1, y1] = at(pts, i + 1);
    const c = x0 * y1 - x1 * y0;
    cx += (x0 + x1) * c;
    cy += (y0 + y1) * c;
  }
  return [cx / (6 * a), cy / (6 * a)];
}

function segmentDistance([px, py]: Point, [ax, ay]: Point, [bx, by]: Point): number {
  const dx = bx - ax;
  const dy = by - ay;
  if (dx === 0 && dy === 0) return Math.hypot(px - ax, py - ay);
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

/** Douglas-Peucker against the first-last segment; keeps the endpoints and returns original point objects. */
export function simplify<P extends Point>(points: readonly P[], tolerance: number): P[] {
  if (!Number.isFinite(tolerance) || tolerance < 0) throw new RangeError("tolerance must be a non-negative number");
  if (points.length < 3) return [...points];
  const run = (lo: number, hi: number): number[] => {
    let best = -1;
    let idx = lo;
    for (let i = lo + 1; i < hi; i++) {
      const d = segmentDistance(points[i] as P, points[lo] as P, points[hi] as P);
      if (d > best) {
        best = d;
        idx = i;
      }
    }
    if (best <= tolerance) return [lo, hi];
    return [...run(lo, idx).slice(0, -1), ...run(idx, hi)];
  };
  return run(0, points.length - 1).map((i) => points[i] as P);
}

/** Spherical approximation (R = 6378137 m) of a [lon, lat] ring's area, as used by Turf/Mapbox. */
export function ringAreaSquareMeters(polygon: readonly Point[]): number {
  const pts = ring(polygon);
  let total = 0;
  for (let i = 0; i < pts.length; i++) {
    const [lon1, lat1] = at(pts, i);
    const [lon2, lat2] = at(pts, i + 1);
    total += rad(lon2 - lon1) * (2 + Math.sin(rad(lat1)) + Math.sin(rad(lat2)));
  }
  return Math.abs((total * EARTH_RADIUS_M * EARTH_RADIUS_M) / 2);
}
