// SPDX-License-Identifier: Apache-2.0

/**
 * Color conversions between CSS hex, sRGB, HSL and OKLCH (Ottosson's Oklab). Channels r, g, b, alpha are 0..1;
 * HSL h is degrees [0, 360), s and l 0..1; OKLCH L 0..1, C >= 0, h degrees.
 */
object ColorConvert {
    private val HEX = Regex("#([0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})")

    private fun pyMod(a: Double, m: Double): Double {
        var r = a % m
        if (r != 0.0 && (r < 0) != (m < 0)) r += m else if (r == 0.0) r = Math.copySign(0.0, m)
        return r
    }

    /** "#rgb", "#rgba", "#rrggbb" or "#rrggbbaa" (case-insensitive) to [r, g, b, a] in 0..1. */
    fun parseHex(text: String): DoubleArray {
        val m = HEX.matchEntire(text) ?: throw IllegalArgumentException("expected #rgb, #rgba, #rrggbb or #rrggbbaa")
        var h = m.groupValues[1]
        if (h.length <= 4) h = h.map { "$it$it" }.joinToString("")
        val out = doubleArrayOf(0.0, 0.0, 0.0, 1.0)
        for (i in 0 until h.length / 2) out[i] = h.substring(2 * i, 2 * i + 2).toInt(16) / 255.0
        return out
    }

    private fun channel(v: Double): Int = minOf(255.0, maxOf(0.0, Math.floor(minOf(1.0, maxOf(0.0, v)) * 255 + 0.5))).toInt()

    /** Lowercase #rrggbb, or #rrggbbaa when [a] < 1; channels clamped to 0..1 and rounded half up. */
    fun toHex(r: Double, g: Double, b: Double, a: Double = 1.0): String {
        var out = "#%02x%02x%02x".format(channel(r), channel(g), channel(b))
        if (a < 1) out += "%02x".format(minOf(255.0, maxOf(0.0, Math.floor(maxOf(0.0, a) * 255 + 0.5))).toInt())
        return out
    }

    /** sRGB to [h, s, l]. */
    fun rgbToHsl(r: Double, g: Double, b: Double): DoubleArray {
        val mx = maxOf(r, g, b)
        val mn = minOf(r, g, b)
        val l = (mx + mn) / 2
        val d = mx - mn
        if (d == 0.0) return doubleArrayOf(0.0, 0.0, l)
        val s = d / (1 - Math.abs(2 * l - 1))
        val h = when (mx) {
            r -> pyMod((g - b) / d, 6.0)
            g -> (b - r) / d + 2
            else -> (r - g) / d + 4
        }
        return doubleArrayOf(pyMod(h * 60, 360.0), s, l)
    }

    /** HSL (h wraps modulo 360) to [r, g, b]. */
    fun hslToRgb(hue: Double, s: Double, l: Double): DoubleArray {
        val h = pyMod(hue, 360.0)
        val c = (1 - Math.abs(2 * l - 1)) * s
        val x = c * (1 - Math.abs(pyMod(h / 60, 2.0) - 1))
        val m = l - c / 2
        val t = arrayOf(doubleArrayOf(c, x, 0.0), doubleArrayOf(x, c, 0.0), doubleArrayOf(0.0, c, x), doubleArrayOf(0.0, x, c), doubleArrayOf(x, 0.0, c), doubleArrayOf(c, 0.0, x))
        val row = t[Math.floorMod(Math.floor(h / 60).toInt(), 6)]
        return doubleArrayOf(row[0] + m, row[1] + m, row[2] + m)
    }

    private fun lin(c: Double) = if (c <= 0.04045) c / 12.92 else Math.pow((c + 0.055) / 1.055, 2.4)
    private fun gam(c: Double) = if (c <= 0.0031308) 12.92 * c else 1.055 * Math.pow(c, 1 / 2.4) - 0.055
    private fun cbrt(x: Double) = Math.copySign(Math.pow(Math.abs(x), 1.0 / 3), x)

    /** sRGB to [L, C, h] in OKLCH. */
    fun rgbToOklch(red: Double, green: Double, blue: Double): DoubleArray {
        val r = lin(red)
        val g = lin(green)
        val b = lin(blue)
        val l = cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
        val m = cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
        val s = cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
        val bigL = 0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s
        val bigA = 1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s
        val bigB = 0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s
        val c = Math.hypot(bigA, bigB)
        val h = if (c > 1e-7) pyMod(Math.toDegrees(Math.atan2(bigB, bigA)), 360.0) else 0.0
        return doubleArrayOf(bigL, c, h)
    }

    /** OKLCH to sRGB [r, g, b], not clamped (values outside 0..1 are out of the sRGB gamut). */
    fun oklchToRgb(bigL: Double, c: Double, h: Double): DoubleArray {
        val a = c * Math.cos(Math.toRadians(h))
        val bb = c * Math.sin(Math.toRadians(h))
        val l = Math.pow(bigL + 0.3963377774 * a + 0.2158037573 * bb, 3.0)
        val m = Math.pow(bigL - 0.1055613458 * a - 0.0638541728 * bb, 3.0)
        val s = Math.pow(bigL - 0.0894841775 * a - 1.2914855480 * bb, 3.0)
        val r = 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s
        val g = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s
        val b = -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s
        return doubleArrayOf(gam(r), gam(g), gam(b))
    }

    /** True when every channel is within [-eps, 1 + eps]. */
    fun inGamut(r: Double, g: Double, b: Double, eps: Double = 1e-9): Boolean =
        listOf(r, g, b).all { it >= -eps && it <= 1 + eps }
}
