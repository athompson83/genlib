# SPDX-License-Identifier: Apache-2.0
"""Planar polygon and line helpers; points are [x, y] = [lon, lat].

Planar math on degrees is fine for small areas and hit tests; use ring_area_square_meters (the
spherical approximation Turf and Mapbox use) for real-world areas.
"""
import math

EARTH_RADIUS_M = 6378137.0


def _ring(ring) -> list[tuple[float, float]]:
    pts = [(float(p[0]), float(p[1])) for p in ring]
    if len(pts) >= 2 and pts[0] == pts[-1]:
        pts.pop()
    if len(pts) < 3:
        raise ValueError("a ring needs at least 3 distinct points")
    for x, y in pts:
        if not (math.isfinite(x) and math.isfinite(y)):
            raise ValueError("coordinates must be finite numbers")
    return pts


def point_in_polygon(point, ring) -> bool:
    """Even-odd test; points on an edge or vertex count as inside."""
    x, y = float(point[0]), float(point[1])
    pts = _ring(ring)
    inside = False
    n = len(pts)
    for i in range(n):
        ax, ay = pts[i]
        bx, by = pts[(i + 1) % n]
        cross = (bx - ax) * (y - ay) - (by - ay) * (x - ax)
        if cross == 0 and min(ax, bx) <= x <= max(ax, bx) and min(ay, by) <= y <= max(ay, by):
            return True
        if (ay > y) != (by > y) and x < (bx - ax) * (y - ay) / (by - ay) + ax:
            inside = not inside
    return inside


def signed_area(ring) -> float:
    """Shoelace area; counter-clockwise rings are positive."""
    pts = _ring(ring)
    n = len(pts)
    return sum(pts[i][0] * pts[(i + 1) % n][1] - pts[(i + 1) % n][0] * pts[i][1] for i in range(n)) / 2


def centroid(ring) -> list[float]:
    pts = _ring(ring)
    a = signed_area(pts)
    if a == 0:
        raise ValueError("centroid is undefined for a ring with zero area")
    cx = cy = 0.0
    n = len(pts)
    for i in range(n):
        x0, y0 = pts[i]
        x1, y1 = pts[(i + 1) % n]
        c = x0 * y1 - x1 * y0
        cx += (x0 + x1) * c
        cy += (y0 + y1) * c
    return [cx / (6 * a), cy / (6 * a)]


def _segment_distance(p, a, b) -> float:
    (px, py), (ax, ay), (bx, by) = p, a, b
    dx, dy = bx - ax, by - ay
    if dx == 0 and dy == 0:
        return math.hypot(px - ax, py - ay)
    t = max(0.0, min(1.0, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)))
    return math.hypot(px - (ax + t * dx), py - (ay + t * dy))


def simplify(points, tolerance: float) -> list:
    """Douglas-Peucker; keeps the first and last point. Returns the original point objects."""
    if not isinstance(tolerance, (int, float)) or isinstance(tolerance, bool) or not tolerance >= 0:
        raise ValueError("tolerance must be a non-negative number")
    pts = list(points)
    if len(pts) < 3:
        return pts

    def run(lo: int, hi: int) -> list[int]:
        best, idx = -1.0, lo
        for i in range(lo + 1, hi):
            d = _segment_distance(pts[i], pts[lo], pts[hi])
            if d > best:
                best, idx = d, i
        if best <= tolerance:
            return [lo, hi]
        return run(lo, idx)[:-1] + run(idx, hi)

    return [pts[i] for i in run(0, len(pts) - 1)]


def ring_area_square_meters(ring) -> float:
    """Spherical approximation (R = 6378137 m) used by Turf/Mapbox for [lon, lat] rings."""
    pts = _ring(ring)
    total = 0.0
    n = len(pts)
    for i in range(n):
        lon1, lat1 = pts[i]
        lon2, lat2 = pts[(i + 1) % n]
        total += math.radians(lon2 - lon1) * (2 + math.sin(math.radians(lat1)) + math.sin(math.radians(lat2)))
    return abs(total * EARTH_RADIUS_M * EARTH_RADIUS_M / 2)
