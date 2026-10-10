// SPDX-License-Identifier: Apache-2.0
import kotlin.math.PI
import kotlin.math.abs
import kotlin.math.atan
import kotlin.math.cos
import kotlin.math.floor
import kotlin.math.ln
import kotlin.math.sinh
import kotlin.math.tan

/** Web Mercator (EPSG:3857) slippy-map tiles, Bing quadkeys and spherical Mercator meters. */
object TileMath {
    /** Latitude limit of the square Web Mercator world. */
    const val MAX_LAT = 85.05112877980659
    /** WGS 84 semi-major axis used by EPSG:3857. */
    const val EARTH_RADIUS_M = 6378137.0

    /** A tile address. */
    data class Tile(val x: Long, val y: Long, val zoom: Int)

    /** Tile bounds in degrees. */
    data class Bounds(val west: Double, val south: Double, val east: Double, val north: Double)

    private fun size(zoom: Int): Long {
        require(zoom in 0..24) { "zoom must be between 0 and 24" }
        return 1L shl zoom
    }

    private fun checkTile(x: Long, y: Long, n: Long) = require(x in 0 until n && y in 0 until n) { "tile x and y must be in [0, 2^zoom - 1]" }

    /** The tile containing [lon]/[lat] at [zoom] (latitude clamped to +/-[MAX_LAT]). */
    fun lonLatToTile(lon: Double, lat: Double, zoom: Int): Tile {
        val n = size(zoom)
        require(lon >= -180 && lon <= 180) { "longitude must be in [-180, 180]" }
        require(lat >= -90 && lat <= 90) { "latitude must be in [-90, 90]" }
        val r = Math.toRadians(lat.coerceIn(-MAX_LAT, MAX_LAT))
        val x = floor((lon + 180) / 360 * n).toLong()
        val y = floor((1 - ln(tan(r) + 1 / cos(r)) / PI) / 2 * n).toLong()
        return Tile(x.coerceIn(0, n - 1), y.coerceIn(0, n - 1), zoom)
    }

    private fun tileLat(y: Long, n: Long) = Math.toDegrees(atan(sinh(PI * (1 - 2.0 * y / n))))

    fun tileBounds(x: Long, y: Long, zoom: Int): Bounds {
        val n = size(zoom)
        checkTile(x, y, n)
        return Bounds(x.toDouble() / n * 360 - 180, tileLat(y + 1, n), (x + 1).toDouble() / n * 360 - 180, tileLat(y, n))
    }

    /** Bing Maps quadkey of a tile ("" at zoom 0). */
    fun tileToQuadkey(x: Long, y: Long, zoom: Int): String {
        val n = size(zoom)
        checkTile(x, y, n)
        val out = StringBuilder(zoom)
        for (i in zoom downTo 1) {
            val m = 1L shl (i - 1)
            out.append('0' + (if (x and m != 0L) 1 else 0) + (if (y and m != 0L) 2 else 0))
        }
        return out.toString()
    }

    /** Tile of a quadkey of digits 0-3; the empty key is the zoom-0 tile. */
    fun quadkeyToTile(key: String): Tile {
        require(key.length <= 24) { "quadkey must be at most 24 characters" }
        var x = 0L
        var y = 0L
        for (c in key) {
            require(c in '0'..'3') { "quadkey characters must be 0-3" }
            val d = c - '0'
            x = (x shl 1) or (d and 1).toLong()
            y = (y shl 1) or (d shr 1).toLong()
        }
        return Tile(x, y, key.length)
    }

    /** (x, y) spherical Mercator meters; rejects |lat| > [MAX_LAT]. */
    fun lonLatToMercator(lon: Double, lat: Double): Pair<Double, Double> {
        require(lon >= -180 && lon <= 180) { "longitude must be in [-180, 180]" }
        require(abs(lat) <= MAX_LAT + 1e-9) { "latitude must be within +/-$MAX_LAT" }
        return Pair(Math.toRadians(lon) * EARTH_RADIUS_M, ln(tan(PI / 4 + Math.toRadians(lat) / 2)) * EARTH_RADIUS_M)
    }
}
