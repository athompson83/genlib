// SPDX-License-Identifier: Apache-2.0
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;

/** Planar polygon and line helpers; points are {x, y} = {lon, lat}. Rings are implicitly closed. */
public final class Geometry {
    /** WGS 84 semi-major axis, as used by Turf/Mapbox ring area. */
    public static final double EARTH_RADIUS_M = 6378137.0;

    private Geometry() {}

    private static void checkPoint(double[] p) {
        if (p == null || p.length != 2 || !Double.isFinite(p[0]) || !Double.isFinite(p[1])) throw new IllegalArgumentException("each point must be two finite numbers");
    }

    private static double[][] ring(double[][] ring) {
        if (ring == null) throw new IllegalArgumentException("ring is required");
        for (double[] p : ring) checkPoint(p);
        double[][] r = ring;
        if (r.length > 1 && r[0][0] == r[r.length - 1][0] && r[0][1] == r[r.length - 1][1]) r = Arrays.copyOf(r, r.length - 1);
        if (r.length < 3) throw new IllegalArgumentException("ring must have at least 3 distinct points");
        return r;
    }

    /** True when point is inside the ring or on an edge or vertex (even-odd rule). */
    public static boolean pointInPolygon(double[] point, double[][] ring) {
        checkPoint(point);
        double[][] r = ring(ring);
        double x = point[0];
        double y = point[1];
        boolean inside = false;
        for (int i = 0; i < r.length; i++) {
            double ax = r[i][0], ay = r[i][1], bx = r[(i + 1) % r.length][0], by = r[(i + 1) % r.length][1];
            double cross = (bx - ax) * (y - ay) - (by - ay) * (x - ax);
            if (cross == 0 && Math.min(ax, bx) <= x && x <= Math.max(ax, bx) && Math.min(ay, by) <= y && y <= Math.max(ay, by)) return true;
            if ((ay > y) != (by > y) && x < (bx - ax) * (y - ay) / (by - ay) + ax) inside = !inside;
        }
        return inside;
    }

    /** Shoelace area; counter-clockwise rings are positive. */
    public static double signedArea(double[][] ring) {
        double[][] r = ring(ring);
        double sum = 0;
        for (int i = 0; i < r.length; i++) {
            double[] a = r[i];
            double[] b = r[(i + 1) % r.length];
            sum += a[0] * b[1] - b[0] * a[1];
        }
        return sum / 2;
    }

    /** Area-weighted centroid {x, y}; zero-area rings are rejected. */
    public static double[] centroid(double[][] ring) {
        double[][] r = ring(ring);
        double a = signedArea(r);
        if (a == 0) throw new IllegalArgumentException("ring has zero area");
        double cx = 0;
        double cy = 0;
        for (int i = 0; i < r.length; i++) {
            double x0 = r[i][0], y0 = r[i][1], x1 = r[(i + 1) % r.length][0], y1 = r[(i + 1) % r.length][1];
            double c = x0 * y1 - x1 * y0;
            cx += (x0 + x1) * c;
            cy += (y0 + y1) * c;
        }
        return new double[] {cx / (6 * a), cy / (6 * a)};
    }

    private static double segmentDistance(double[] p, double[] a, double[] b) {
        double dx = b[0] - a[0];
        double dy = b[1] - a[1];
        if (dx == 0 && dy == 0) return Math.hypot(p[0] - a[0], p[1] - a[1]);
        double t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy)));
        return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
    }

    /** Douglas-Peucker simplification keeping the first and last points; fewer than 3 points are returned unchanged. */
    public static double[][] simplify(double[][] points, double tolerance) {
        if (points == null) throw new IllegalArgumentException("points are required");
        if (!(tolerance >= 0) || Double.isInfinite(tolerance)) throw new IllegalArgumentException("tolerance must be a finite number >= 0");
        for (double[] p : points) checkPoint(p);
        List<double[]> out = new ArrayList<>();
        dp(points, 0, points.length - 1, tolerance, out);
        if (points.length > 0) out.add(points[points.length - 1].clone());
        return out.toArray(new double[0][]);
    }

    /** Appends the kept points of points[first..last] except the last one. */
    private static void dp(double[][] pts, int first, int last, double tol, List<double[]> out) {
        if (last < first) return;
        if (last - first < 2) {
            for (int i = first; i < last; i++) out.add(pts[i].clone());
            return;
        }
        double best = -1;
        int idx = first;
        for (int i = first + 1; i < last; i++) {
            double d = segmentDistance(pts[i], pts[first], pts[last]);
            if (d > best) { best = d; idx = i; }
        }
        if (best <= tol) { out.add(pts[first].clone()); return; }
        dp(pts, first, idx, tol, out);
        dp(pts, idx, last, tol, out);
    }

    /** Spherical ring area in square meters (Turf/Mapbox approximation, R = 6378137). */
    public static double ringAreaSquareMeters(double[][] ring) {
        double[][] r = ring(ring);
        double total = 0;
        for (int i = 0; i < r.length; i++) {
            double[] a = r[i];
            double[] b = r[(i + 1) % r.length];
            total += Math.toRadians(b[0] - a[0]) * (2 + Math.sin(Math.toRadians(a[1])) + Math.sin(Math.toRadians(b[1])));
        }
        return Math.abs(total * EARTH_RADIUS_M * EARTH_RADIUS_M / 2);
    }
}
