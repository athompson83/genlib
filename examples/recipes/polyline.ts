// SPDX-License-Identifier: Apache-2.0
// Genlib recipe: Google encoded polyline algorithm (encode/decode, precision 5 or 6). Original source; copy and adapt.
// Precision 5 is Google's default; OSRM and Valhalla commonly use 6. Values use BigInt-free integer math
// that stays exact up to |value| * 10^precision < 2^53.

export type LatLon = readonly [lat: number, lon: number];

function factor(precision: number): number {
  if (!Number.isInteger(precision) || precision < 0 || precision > 8) throw new RangeError("precision must be an integer from 0 to 8");
  return 10 ** precision;
}

/** Round half away from zero. */
const roundAway = (v: number): number => (v < 0 ? -Math.floor(-v + 0.5) : Math.floor(v + 0.5));

function pushValue(out: string[], delta: number): void {
  // Zigzag: 2d for d >= 0, -2d - 1 (== ~(d << 1)) for d < 0, without 32-bit overflow.
  let v = delta < 0 ? -2 * delta - 1 : 2 * delta;
  while (v >= 0x20) {
    out.push(String.fromCharCode((0x20 | v % 32) + 63));
    v = Math.floor(v / 32);
  }
  out.push(String.fromCharCode(v + 63));
}

export function encodePolyline(points: readonly LatLon[], precision = 5): string {
  const f = factor(precision);
  const out: string[] = [];
  let prevLat = 0;
  let prevLon = 0;
  for (const [lat, lon] of points) {
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) throw new RangeError("coordinates must be finite numbers");
    const iLat = roundAway(lat * f);
    const iLon = roundAway(lon * f);
    pushValue(out, iLat - prevLat);
    pushValue(out, iLon - prevLon);
    prevLat = iLat;
    prevLon = iLon;
  }
  return out.join("");
}

export function decodePolyline(text: string, precision = 5): Array<[number, number]> {
  const f = factor(precision);
  if (typeof text !== "string") throw new TypeError("text must be a string");
  const points: Array<[number, number]> = [];
  let index = 0;
  const next = (): number => {
    let result = 0;
    let scale = 1;
    for (;;) {
      if (index >= text.length) throw new RangeError("truncated polyline");
      const b = text.charCodeAt(index) - 63;
      if (b < 0 || b > 63) throw new RangeError(`invalid polyline character at ${index}`);
      index++;
      if (scale > 2 ** 50) throw new RangeError("polyline value too long");
      result += (b & 0x1f) * scale;
      scale *= 32;
      if (b < 0x20) break;
    }
    return result % 2 === 1 ? -(result + 1) / 2 : result / 2;
  };
  let lat = 0;
  let lon = 0;
  while (index < text.length) {
    lat += next();
    lon += next();
    points.push([lat / f, lon / f]);
  }
  return points;
}
