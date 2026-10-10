// SPDX-License-Identifier: Apache-2.0
/// Planar polygon and line helpers on `(x, y)` = `(lon, lat)` points: point-in-polygon, signed area,
/// centroid, Douglas-Peucker simplification and a spherical ring area in square meters.
library;

import 'dart:math' as math;

/// A planar point `(x, y)`; for geographic data, `(lon, lat)` in degrees.
typedef Position = (double, double);

/// True when [point] is inside [ring] or on its boundary (even-odd rule; the ring is implicitly closed).
bool pointInPolygon(Position point, List<Position> ring) {
  final r = _ring(ring);
  final (x, y) = point;
  _finite(point);
  var inside = false;
  for (var i = 0; i < r.length; i++) {
    final (ax, ay) = r[i];
    final (bx, by) = r[(i + 1) % r.length];
    final cross = (bx - ax) * (y - ay) - (by - ay) * (x - ax);
    if (cross == 0 && math.min(ax, bx) <= x && x <= math.max(ax, bx) && math.min(ay, by) <= y && y <= math.max(ay, by)) return true;
    if ((ay > y) != (by > y) && x < (bx - ax) * (y - ay) / (by - ay) + ax) inside = !inside;
  }
  return inside;
}

/// Shoelace area: positive for counter-clockwise rings, negative for clockwise.
double signedArea(List<Position> ring) {
  final r = _ring(ring);
  var sum = 0.0;
  for (var i = 0; i < r.length; i++) {
    final (x0, y0) = r[i];
    final (x1, y1) = r[(i + 1) % r.length];
    sum += x0 * y1 - x1 * y0;
  }
  return sum / 2;
}

/// Area-weighted centroid; throws [ArgumentError] when the ring has zero area.
Position centroid(List<Position> ring) {
  final r = _ring(ring);
  final a = signedArea(r);
  if (a == 0) throw ArgumentError('ring has zero area');
  var cx = 0.0, cy = 0.0;
  for (var i = 0; i < r.length; i++) {
    final (x0, y0) = r[i];
    final (x1, y1) = r[(i + 1) % r.length];
    final c = x0 * y1 - x1 * y0;
    cx += (x0 + x1) * c;
    cy += (y0 + y1) * c;
  }
  return (cx / (6 * a), cy / (6 * a));
}

/// Douglas-Peucker simplification keeping the first and last points; [tolerance] must be >= 0.
List<Position> simplify(List<Position> points, double tolerance) {
  if (!(tolerance >= 0) || tolerance.isInfinite) throw RangeError.value(tolerance, 'tolerance', 'must be finite and >= 0');
  points.forEach(_finite);
  return _simplify(points, tolerance);
}

List<Position> _simplify(List<Position> pts, double tol) {
  if (pts.length <= 2) return List.of(pts);
  var best = -1.0, index = 0;
  for (var i = 1; i < pts.length - 1; i++) {
    final d = _segmentDistance(pts[i], pts.first, pts.last);
    if (d > best) {
      best = d;
      index = i;
    }
  }
  if (best <= tol) return [pts.first, pts.last];
  final left = _simplify(pts.sublist(0, index + 1), tol);
  return [...left.sublist(0, left.length - 1), ..._simplify(pts.sublist(index), tol)];
}

double _segmentDistance(Position p, Position a, Position b) {
  final (px, py) = p;
  final (ax, ay) = a;
  final (bx, by) = b;
  final dx = bx - ax, dy = by - ay;
  if (dx == 0 && dy == 0) return _hypot(px - ax, py - ay);
  final t = (((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)).clamp(0.0, 1.0);
  return _hypot(px - (ax + t * dx), py - (ay + t * dy));
}

double _hypot(double x, double y) => math.sqrt(x * x + y * y);

/// Approximate area in square meters of a `(lon, lat)` ring on a sphere of radius 6378137 m
/// (the formula used by Turf and Mapbox).
double ringAreaSquareMeters(List<Position> ring) {
  final r = _ring(ring);
  const radius = 6378137.0;
  double rad(double d) => d * math.pi / 180;
  var total = 0.0;
  for (var i = 0; i < r.length; i++) {
    final (lon1, lat1) = r[i];
    final (lon2, lat2) = r[(i + 1) % r.length];
    total += rad(lon2 - lon1) * (2 + math.sin(rad(lat1)) + math.sin(rad(lat2)));
  }
  return (total * radius * radius / 2).abs();
}

/// Drops an explicit closing point and checks that at least 3 finite points remain.
List<Position> _ring(List<Position> ring) {
  ring.forEach(_finite);
  final r = ring.length > 1 && ring.first == ring.last ? ring.sublist(0, ring.length - 1) : ring;
  if (r.length < 3) throw ArgumentError('a ring needs at least 3 points');
  return r;
}

void _finite(Position p) {
  if (!p.$1.isFinite || !p.$2.isFinite) throw ArgumentError.value(p, 'point', 'coordinates must be finite');
}
