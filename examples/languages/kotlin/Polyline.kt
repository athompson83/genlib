// SPDX-License-Identifier: Apache-2.0
import kotlin.math.abs
import kotlin.math.floor

/** Google encoded polyline algorithm; points are (lat, lon) pairs. */
object Polyline {
    private const val MAX_SCALED = 9007199254740992.0 // 2^53

    private fun factor(precision: Int): Long {
        require(precision in 0..10) { "precision must be between 0 and 10" }
        var f = 1L
        repeat(precision) { f *= 10 }
        return f
    }

    private fun round(v: Double): Long {
        require(v.isFinite() && abs(v) <= MAX_SCALED) { "coordinate must be finite and in range" }
        val r = floor(abs(v) + 0.5).toLong()
        return if (v >= 0) r else -r
    }

    private fun emit(out: StringBuilder, d: Long) {
        var v = if (d < 0) (d shl 1).inv() else d shl 1
        while (v >= 0x20) { out.append(((0x20L or (v and 0x1f)) + 63).toInt().toChar()); v = v ushr 5 }
        out.append((v + 63).toInt().toChar())
    }

    /** Encodes (lat, lon) points, rounding half away from zero at [precision] (0..10). */
    fun encodePolyline(points: List<Pair<Double, Double>>, precision: Int = 5): String {
        val f = factor(precision)
        val out = StringBuilder()
        var plat = 0L
        var plon = 0L
        for ((latD, lonD) in points) {
            val lat = round(latD * f)
            val lon = round(lonD * f)
            emit(out, lat - plat)
            emit(out, lon - plon)
            plat = lat
            plon = lon
        }
        return out.toString()
    }

    /** Decodes an encoded polyline; rejects characters outside 63..126 and truncated input. */
    fun decodePolyline(text: String, precision: Int = 5): List<Pair<Double, Double>> {
        val f = factor(precision).toDouble()
        val out = mutableListOf<Pair<Double, Double>>()
        var pos = 0
        fun next(): Long {
            var result = 0L
            var shift = 0
            while (true) {
                require(pos < text.length) { "truncated polyline" }
                val c = text[pos++]
                require(c.code in 63..126) { "invalid polyline character at ${pos - 1}" }
                require(shift <= 60) { "polyline value too large" }
                val b = (c.code - 63).toLong()
                result = result or ((b and 0x1f) shl shift)
                shift += 5
                if (b < 0x20) break
            }
            return if (result and 1L != 0L) (result ushr 1).inv() else result ushr 1
        }
        var lat = 0L
        var lon = 0L
        while (pos < text.length) {
            lat += next()
            require(pos < text.length) { "truncated polyline" }
            lon += next()
            out += Pair(lat / f, lon / f)
        }
        return out
    }
}
