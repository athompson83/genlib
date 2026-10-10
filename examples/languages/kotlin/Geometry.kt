// SPDX-License-Identifier: Apache-2.0
import kotlin.math.abs
import kotlin.math.hypot
import kotlin.math.max
import kotlin.math.min
import kotlin.math.sin

/** Planar polygon and line helpers; points are (x, y) = (lon, lat). Rings are implicitly closed. */
object Geometry {
    /** WGS 84 semi-major axis, as used by Turf/Mapbox ring area. */
    const val EARTH_RADIUS_M = 6378137.0

    private fun checkPoint(p: Pair<Double, Double>) = require(p.first.isFinite() && p.second.isFinite()) { "each point must be two finite numbers" }

    private fun ring(ring: List<Pair<Double, Double>>): List<Pair<Double, Double>> {
        ring.forEach(::checkPoint)
        val r = if (ring.size > 1 && ring.first() == ring.last()) ring.dropLast(1) else ring
        require(r.size >= 3) { "ring must have at least 3 distinct points" }
        return r
    }

    /** True when [point] is inside [ring] or on an edge or vertex (even-odd rule). */
    fun pointInPolygon(point: Pair<Double, Double>, ring: List<Pair<Double, Double>>): Boolean {
        checkPoint(point)
        val r = ring(ring)
        val (x, y) = point
        var inside = false
        for (i in r.indices) {
            val (ax, ay) = r[i]
            val (bx, by) = r[(i + 1) % r.size]
            val cross = (bx - ax) * (y - ay) - (by - ay) * (x - ax)
            if (cross == 0.0 && min(ax, bx) <= x && x <= max(ax, bx) && min(ay, by) <= y && y <= max(ay, by)) return true
            if ((ay > y) != (by > y) && x < (bx - ax) * (y - ay) / (by - ay) + ax) inside = !inside
        }
        return inside
    }

    /** Shoelace area; counter-clockwise rings are positive. */
    fun signedArea(ring: List<Pair<Double, Double>>): Double {
        val r = ring(ring)
        var sum = 0.0
        for (i in r.indices) {
            val a = r[i]
            val b = r[(i + 1) % r.size]
            sum += a.first * b.second - b.first * a.second
        }
        return sum / 2
    }

    /** Area-weighted centroid; zero-area rings are rejected. */
    fun centroid(ring: List<Pair<Double, Double>>): Pair<Double, Double> {
        val r = ring(ring)
        val a = signedArea(r)
        require(a != 0.0) { "ring has zero area" }
        var cx = 0.0
        var cy = 0.0
        for (i in r.indices) {
            val (x0, y0) = r[i]
            val (x1, y1) = r[(i + 1) % r.size]
            val c = x0 * y1 - x1 * y0
            cx += (x0 + x1) * c
            cy += (y0 + y1) * c
        }
        return Pair(cx / (6 * a), cy / (6 * a))
    }

    private fun segmentDistance(p: Pair<Double, Double>, a: Pair<Double, Double>, b: Pair<Double, Double>): Double {
        val dx = b.first - a.first
        val dy = b.second - a.second
        if (dx == 0.0 && dy == 0.0) return hypot(p.first - a.first, p.second - a.second)
        val t = max(0.0, min(1.0, ((p.first - a.first) * dx + (p.second - a.second) * dy) / (dx * dx + dy * dy)))
        return hypot(p.first - (a.first + t * dx), p.second - (a.second + t * dy))
    }

    /** Douglas-Peucker simplification keeping the first and last points; fewer than 3 points are returned unchanged. */
    fun simplify(points: List<Pair<Double, Double>>, tolerance: Double): List<Pair<Double, Double>> {
        require(tolerance >= 0 && tolerance.isFinite()) { "tolerance must be a finite number >= 0" }
        points.forEach(::checkPoint)
        if (points.size < 3) return points.toList()
        val out = mutableListOf<Pair<Double, Double>>()
        fun dp(first: Int, last: Int) {
            if (last - first < 2) { for (i in first until last) out += points[i]; return }
            var best = -1.0
            var idx = first
            for (i in first + 1 until last) {
                val d = segmentDistance(points[i], points[first], points[last])
                if (d > best) { best = d; idx = i }
            }
            if (best <= tolerance) { out += points[first]; return }
            dp(first, idx)
            dp(idx, last)
        }
        dp(0, points.size - 1)
        out += points.last()
        return out
    }

    /** Spherical ring area in square meters (Turf/Mapbox approximation, R = 6378137). */
    fun ringAreaSquareMeters(ring: List<Pair<Double, Double>>): Double {
        val r = ring(ring)
        var total = 0.0
        for (i in r.indices) {
            val (lon1, lat1) = r[i]
            val (lon2, lat2) = r[(i + 1) % r.size]
            total += Math.toRadians(lon2 - lon1) * (2 + sin(Math.toRadians(lat1)) + sin(Math.toRadians(lat2)))
        }
        return abs(total * EARTH_RADIUS_M * EARTH_RADIUS_M / 2)
    }
}
