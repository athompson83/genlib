// SPDX-License-Identifier: Apache-2.0
// Genlib recipe: Web Mercator (EPSG:3857) slippy-map tiles, bounds, Bing quadkeys and meters. Original source; copy and adapt.
// Tile URLs follow {z}/{x}/{y} with y counted from the north (XYZ); TMS flips y as 2^z - 1 - y.

export const MAX_LATITUDE = 85.05112877980659;
export const EARTH_RADIUS_M = 6378137;
const rad = (d: number) => (d * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;

function checkZoom(zoom: number): number {
  if (!Number.isInteger(zoom) || zoom < 0 || zoom > 24) throw new RangeError("zoom must be an integer from 0 to 24");
  return 2 ** zoom;
}

function checkLon(lon: number, lat: number): void {
  if (!Number.isFinite(lon) || !Number.isFinite(lat)) throw new RangeError("coordinates must be finite numbers");
  if (lon < -180 || lon > 180) throw new RangeError("longitude must be in [-180, 180]");
}

function checkTile(x: number, y: number, zoom: number): number {
  const n = checkZoom(zoom);
  for (const v of [x, y]) if (!Number.isInteger(v) || v < 0 || v >= n) throw new RangeError(`tile x and y must be integers in [0, ${n - 1}] at zoom ${zoom}`);
  return n;
}

/** Tile containing the point; latitude is clamped to the Mercator limit. */
export function lonLatToTile(lon: number, lat: number, zoom: number): [x: number, y: number] {
  checkLon(lon, lat);
  const n = checkZoom(zoom);
  const r = rad(Math.max(-MAX_LATITUDE, Math.min(MAX_LATITUDE, lat)));
  const x = Math.floor(((lon + 180) / 360) * n);
  const y = Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * n);
  return [Math.min(Math.max(x, 0), n - 1), Math.min(Math.max(y, 0), n - 1)];
}

/** [west, south, east, north] in degrees. */
export function tileBounds(x: number, y: number, zoom: number): [number, number, number, number] {
  const n = checkTile(x, y, zoom);
  const lat = (yy: number) => deg(Math.atan(Math.sinh(Math.PI * (1 - (2 * yy) / n))));
  return [(x / n) * 360 - 180, lat(y + 1), ((x + 1) / n) * 360 - 180, lat(y)];
}

export function tileToQuadkey(x: number, y: number, zoom: number): string {
  checkTile(x, y, zoom);
  let key = "";
  for (let i = zoom; i > 0; i--) {
    const mask = 2 ** (i - 1);
    key += String((Math.floor(x / mask) % 2) + 2 * (Math.floor(y / mask) % 2));
  }
  return key;
}

/** The empty key is the zoom 0 tile. */
export function quadkeyToTile(key: string): { x: number; y: number; zoom: number } {
  if (typeof key !== "string" || key.length > 24) throw new RangeError("quadkey must be a string of at most 24 digits");
  let x = 0;
  let y = 0;
  for (const ch of key) {
    if (ch < "0" || ch > "3") throw new RangeError(`invalid quadkey character: ${JSON.stringify(ch)}`);
    const d = ch.charCodeAt(0) - 48;
    x = x * 2 + (d & 1);
    y = y * 2 + (d >> 1);
  }
  return { x, y, zoom: key.length };
}

/** [x, y] in EPSG:3857 meters. */
export function lonLatToMercator(lon: number, lat: number): [x: number, y: number] {
  checkLon(lon, lat);
  if (Math.abs(lat) > MAX_LATITUDE + 1e-9) throw new RangeError("latitude must be within +/-85.05112877980659");
  return [rad(lon) * EARTH_RADIUS_M, Math.log(Math.tan(Math.PI / 4 + rad(lat) / 2)) * EARTH_RADIUS_M];
}
