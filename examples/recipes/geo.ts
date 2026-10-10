// SPDX-License-Identifier: Apache-2.0
// Genlib recipe: haversine distance, geohash encode/decode and a radius bounding box. Original source; copy and adapt.
// Spherical model (mean Earth radius 6,371,008.8 m): distance errors up to about 0.5% versus the
// WGS 84 ellipsoid. Use the bounding box to prefilter rows by index, then the exact distance.

export const EARTH_RADIUS_M = 6_371_008.8;
const BASE32 = "0123456789bcdefghjkmnpqrstuvwxyz";
const rad = (deg: number) => (deg * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;

function checkPoint(lat: number, lon: number): void {
  if (!Number.isFinite(lat) || lat < -90 || lat > 90) throw new RangeError("latitude must be in [-90, 90]");
  if (!Number.isFinite(lon) || lon < -180 || lon > 180) throw new RangeError("longitude must be in [-180, 180]");
}

/** Great-circle distance in meters. */
export function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  checkPoint(lat1, lon1);
  checkPoint(lat2, lon2);
  const dLat = rad(lat2 - lat1);
  const dLon = rad(lon2 - lon1);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Standard geohash (longitude bit first) with 1 to 12 characters. */
export function geohashEncode(lat: number, lon: number, precision = 9): string {
  checkPoint(lat, lon);
  if (!Number.isInteger(precision) || precision < 1 || precision > 12) throw new RangeError("precision must be an integer from 1 to 12");
  const latRange = [-90, 90];
  const lonRange = [-180, 180];
  let out = "";
  let even = true;
  let bits = 0;
  let value = 0;
  while (out.length < precision) {
    const range = even ? lonRange : latRange;
    const x = even ? lon : lat;
    const mid = ((range[0] ?? 0) + (range[1] ?? 0)) / 2;
    value <<= 1;
    if (x >= mid) { value |= 1; range[0] = mid; } else range[1] = mid;
    even = !even;
    if (++bits === 5) { out += BASE32[value]; bits = 0; value = 0; }
  }
  return out;
}

export interface GeohashCell { lat: number; lon: number; latError: number; lonError: number }

/** Cell center plus half the cell height/width in degrees. Case-insensitive; rejects a, i, l, o. */
export function geohashDecode(hash: string): GeohashCell {
  if (typeof hash !== "string" || hash.length < 1 || hash.length > 12) throw new RangeError("geohash must have 1 to 12 characters");
  const latRange = [-90, 90];
  const lonRange = [-180, 180];
  let even = true;
  for (const ch of hash.toLowerCase()) {
    const value = BASE32.indexOf(ch);
    if (value < 0) throw new RangeError(`invalid geohash character: ${JSON.stringify(ch)}`);
    for (let bit = 4; bit >= 0; bit--) {
      const range = even ? lonRange : latRange;
      const mid = ((range[0] ?? 0) + (range[1] ?? 0)) / 2;
      if ((value >> bit) & 1) range[0] = mid; else range[1] = mid;
      even = !even;
    }
  }
  const [latMin = 0, latMax = 0] = latRange;
  const [lonMin = 0, lonMax = 0] = lonRange;
  return { lat: (latMin + latMax) / 2, lon: (lonMin + lonMax) / 2, latError: (latMax - latMin) / 2, lonError: (lonMax - lonMin) / 2 };
}

export interface BoundingBox { minLat: number; maxLat: number; minLon: number; maxLon: number }

/**
 * Box containing every point within radiusMeters. Longitude half-width is the exact angle whose
 * great-circle distance along the center's latitude equals the radius (wider than radius/cos(lat)).
 * Near a pole or across the antimeridian the longitude range becomes the full [-180, 180].
 */
export function boundingBox(lat: number, lon: number, radiusMeters: number): BoundingBox {
  checkPoint(lat, lon);
  if (!Number.isFinite(radiusMeters) || radiusMeters < 0) throw new RangeError("radiusMeters must be a non-negative number");
  const angular = radiusMeters / EARTH_RADIUS_M;
  const minLat = lat - deg(angular);
  const maxLat = lat + deg(angular);
  const box = { minLat: Math.max(-90, minLat), maxLat: Math.min(90, maxLat), minLon: -180, maxLon: 180 };
  if (minLat <= -90 || maxLat >= 90 || angular >= Math.PI / 2) return box;
  const s = Math.sin(angular / 2) / Math.cos(rad(lat));
  if (s >= 1) return box;
  const dLon = deg(2 * Math.asin(s));
  if (lon - dLon < -180 || lon + dLon > 180) return box;
  return { ...box, minLon: lon - dLon, maxLon: lon + dLon };
}
