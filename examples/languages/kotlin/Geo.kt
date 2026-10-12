// SPDX-License-Identifier: Apache-2.0
import kotlin.math.asin
import kotlin.math.atan2
import kotlin.math.cos
import kotlin.math.sin
import kotlin.math.sqrt

/** Great-circle distance (haversine), geohash encode/decode and a radius bounding box. */
object Geo {
    /** Mean Earth radius in meters (IUGG). */
    const val EARTH_RADIUS_M = 6371008.8
    private const val BASE32 = "0123456789bcdefghjkmnpqrstuvwxyz"

    /** A decoded geohash cell: center plus half the cell size in each axis. */
    data class Cell(val lat: Double, val lon: Double, val latError: Double, val lonError: Double)

    /** Bounding box in degrees. */
    data class Box(val minLat: Double, val minLon: Double, val maxLat: Double, val maxLon: Double)

    private fun checkPoint(lat: Double, lon: Double) {
        require(lat >= -90 && lat <= 90) { "latitude must be in [-90, 90]" }
        require(lon >= -180 && lon <= 180) { "longitude must be in [-180, 180]" }
    }

    /** Haversine distance in meters on a sphere of radius [EARTH_RADIUS_M]. */
    fun haversineMeters(lat1: Double, lon1: Double, lat2: Double, lon2: Double): Double {
        checkPoint(lat1, lon1)
        checkPoint(lat2, lon2)
        val dp = Math.toRadians(lat2 - lat1)
        val dl = Math.toRadians(lon2 - lon1)
        val a = minOf(1.0, sin(dp / 2) * sin(dp / 2) + cos(Math.toRadians(lat1)) * cos(Math.toRadians(lat2)) * sin(dl / 2) * sin(dl / 2))
        return 2 * EARTH_RADIUS_M * atan2(sqrt(a), sqrt(1 - a))
    }

    /** Standard geohash (longitude bit first) of the given [precision], 1 to 12 characters. */
    fun geohashEncode(lat: Double, lon: Double, precision: Int): String {
        checkPoint(lat, lon)
        require(precision in 1..12) { "precision must be between 1 and 12" }
        val la = doubleArrayOf(-90.0, 90.0)
        val lo = doubleArrayOf(-180.0, 180.0)
        val out = StringBuilder(precision)
        var even = true
        var bits = 0
        var ch = 0
        while (out.length < precision) {
            val r = if (even) lo else la
            val value = if (even) lon else lat
            val mid = (r[0] + r[1]) / 2
            if (value >= mid) { ch = (ch shl 1) or 1; r[0] = mid } else { ch = ch shl 1; r[1] = mid }
            even = !even
            if (++bits == 5) { out.append(BASE32[ch]); bits = 0; ch = 0 }
        }
        return out.toString()
    }

    /** Decodes a geohash (case-insensitive) to its cell center and half-size errors. */
    fun geohashDecode(hash: String): Cell {
        require(hash.length in 1..12) { "geohash must be 1 to 12 characters" }
        val la = doubleArrayOf(-90.0, 90.0)
        val lo = doubleArrayOf(-180.0, 180.0)
        var even = true
        for (c in hash) {
            val v = BASE32.indexOf(c.lowercaseChar())
            require(v >= 0 && c.code < 128) { "invalid geohash character: '$c'" }
            for (b in 4 downTo 0) {
                val r = if (even) lo else la
                val mid = (r[0] + r[1]) / 2
                if ((v shr b) and 1 == 1) r[0] = mid else r[1] = mid
                even = !even
            }
        }
        return Cell((la[0] + la[1]) / 2, (lo[0] + lo[1]) / 2, (la[1] - la[0]) / 2, (lo[1] - lo[0]) / 2)
    }

    /**
     * Box containing every point within [radiusMeters] of the center. Latitude is clamped to [-90, 90]; the longitude
     * half-width is the circle's widest longitude extent asin(sin(d)/cos(lat)) (about d/cos(lat)), and the full
     * [-180, 180] range is used near the poles, when sin(d) >= cos(lat), or when the box would cross the antimeridian,
     * so points on the far side of +-180 are never excluded.
     */
    fun boundingBox(lat: Double, lon: Double, radiusMeters: Double): Box {
        checkPoint(lat, lon)
        require(radiusMeters >= 0 && radiusMeters.isFinite()) { "radiusMeters must be a finite number >= 0" }
        val d = radiusMeters / EARTH_RADIUS_M
        val dLat = Math.toDegrees(d)
        val minLat = maxOf(-90.0, lat - dLat)
        val maxLat = minOf(90.0, lat + dLat)
        val s = sin(d) / cos(Math.toRadians(lat))
        if (minLat <= -90 || maxLat >= 90 || !(s < 1)) return Box(minLat, -180.0, maxLat, 180.0)
        val dLon = Math.toDegrees(asin(s))
        if (lon - dLon < -180 || lon + dLon > 180) return Box(minLat, -180.0, maxLat, 180.0)
        return Box(minLat, lon - dLon, maxLat, lon + dLon)
    }
}
