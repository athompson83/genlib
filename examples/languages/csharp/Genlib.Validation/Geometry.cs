// SPDX-License-Identifier: Apache-2.0
namespace Genlib.Validation;

/// <summary>
/// Planar polygon and line helpers on (X, Y) = (lon, lat) points: point-in-polygon, signed area, centroid,
/// Douglas-Peucker simplification and a spherical ring area in square meters.
/// </summary>
public static class Geometry {
    /// <summary>True when <paramref name="point"/> is inside <paramref name="ring"/> or on its boundary (even-odd rule; the ring is implicitly closed).</summary>
    public static bool PointInPolygon((double X, double Y) point, IReadOnlyList<(double X, double Y)> ring) {
        var r = Ring(ring);
        CheckFinite(point);
        var (x, y) = point;
        bool inside = false;
        for (int i = 0; i < r.Count; i++) {
            var (ax, ay) = r[i];
            var (bx, by) = r[(i + 1) % r.Count];
            double cross = (bx - ax) * (y - ay) - (by - ay) * (x - ax);
            if (cross == 0 && Math.Min(ax, bx) <= x && x <= Math.Max(ax, bx) && Math.Min(ay, by) <= y && y <= Math.Max(ay, by)) return true;
            if ((ay > y) != (by > y) && x < (bx - ax) * (y - ay) / (by - ay) + ax) inside = !inside;
        }
        return inside;
    }

    /// <summary>Shoelace area: positive for counter-clockwise rings, negative for clockwise.</summary>
    public static double SignedArea(IReadOnlyList<(double X, double Y)> ring) {
        var r = Ring(ring);
        double sum = 0;
        for (int i = 0; i < r.Count; i++) {
            var (x0, y0) = r[i];
            var (x1, y1) = r[(i + 1) % r.Count];
            sum += x0 * y1 - x1 * y0;
        }
        return sum / 2;
    }

    /// <summary>Area-weighted centroid; throws <see cref="ArgumentException"/> when the ring has zero area.</summary>
    public static (double X, double Y) Centroid(IReadOnlyList<(double X, double Y)> ring) {
        var r = Ring(ring);
        double a = SignedArea(r);
        if (a == 0) throw new ArgumentException("ring has zero area", nameof(ring));
        double cx = 0, cy = 0;
        for (int i = 0; i < r.Count; i++) {
            var (x0, y0) = r[i];
            var (x1, y1) = r[(i + 1) % r.Count];
            double c = x0 * y1 - x1 * y0;
            cx += (x0 + x1) * c;
            cy += (y0 + y1) * c;
        }
        return (cx / (6 * a), cy / (6 * a));
    }

    /// <summary>Douglas-Peucker simplification keeping the first and last points; <paramref name="tolerance"/> must be finite and &gt;= 0.</summary>
    public static List<(double X, double Y)> Simplify(IReadOnlyList<(double X, double Y)> points, double tolerance) {
        ArgumentNullException.ThrowIfNull(points);
        if (!double.IsFinite(tolerance) || tolerance < 0) throw new ArgumentOutOfRangeException(nameof(tolerance), "tolerance must be finite and >= 0");
        foreach (var p in points) CheckFinite(p);
        return SimplifyRange(points.ToList(), tolerance);
    }

    private static List<(double X, double Y)> SimplifyRange(List<(double X, double Y)> pts, double tol) {
        if (pts.Count <= 2) return new List<(double X, double Y)>(pts);
        double best = -1;
        int index = 0;
        for (int i = 1; i < pts.Count - 1; i++) {
            double d = SegmentDistance(pts[i], pts[0], pts[^1]);
            if (d > best) { best = d; index = i; }
        }
        if (best <= tol) return new List<(double X, double Y)> { pts[0], pts[^1] };
        var left = SimplifyRange(pts.GetRange(0, index + 1), tol);
        left.RemoveAt(left.Count - 1);
        left.AddRange(SimplifyRange(pts.GetRange(index, pts.Count - index), tol));
        return left;
    }

    private static double SegmentDistance((double X, double Y) p, (double X, double Y) a, (double X, double Y) b) {
        double dx = b.X - a.X, dy = b.Y - a.Y;
        if (dx == 0 && dy == 0) return Hypot(p.X - a.X, p.Y - a.Y);
        double t = Math.Clamp(((p.X - a.X) * dx + (p.Y - a.Y) * dy) / (dx * dx + dy * dy), 0, 1);
        return Hypot(p.X - (a.X + t * dx), p.Y - (a.Y + t * dy));
    }

    private static double Hypot(double x, double y) => Math.Sqrt(x * x + y * y);

    /// <summary>Approximate area in square meters of a (lon, lat) ring on a sphere of radius 6378137 m (the formula used by Turf and Mapbox).</summary>
    public static double RingAreaSquareMeters(IReadOnlyList<(double X, double Y)> ring) {
        var r = Ring(ring);
        const double radius = 6378137.0;
        static double Rad(double d) => d * Math.PI / 180;
        double total = 0;
        for (int i = 0; i < r.Count; i++) {
            var (lon1, lat1) = r[i];
            var (lon2, lat2) = r[(i + 1) % r.Count];
            total += Rad(lon2 - lon1) * (2 + Math.Sin(Rad(lat1)) + Math.Sin(Rad(lat2)));
        }
        return Math.Abs(total * radius * radius / 2);
    }

    /// <summary>Drops an explicit closing point and checks that at least 3 finite points remain.</summary>
    private static IReadOnlyList<(double X, double Y)> Ring(IReadOnlyList<(double X, double Y)> ring) {
        ArgumentNullException.ThrowIfNull(ring);
        foreach (var p in ring) CheckFinite(p);
        var r = ring.Count > 1 && ring[0] == ring[^1] ? ring.Take(ring.Count - 1).ToList() : ring;
        if (r.Count < 3) throw new ArgumentException("a ring needs at least 3 points", nameof(ring));
        return r;
    }

    private static void CheckFinite((double X, double Y) p) {
        if (!double.IsFinite(p.X) || !double.IsFinite(p.Y)) throw new ArgumentException("coordinates must be finite");
    }
}
