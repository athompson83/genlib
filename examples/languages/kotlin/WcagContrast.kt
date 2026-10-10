// SPDX-License-Identifier: Apache-2.0
import java.math.BigDecimal
import java.math.RoundingMode
import kotlin.math.max
import kotlin.math.min
import kotlin.math.pow

/** WCAG 2.x relative luminance, contrast ratio and AA/AAA pass checks for #rgb / #rrggbb colors. */
object WcagContrast {
    private const val HEX = "0123456789abcdef"

    private fun hexDigit(c: Char): Int {
        val d = HEX.indexOf(c.lowercaseChar())
        require(d >= 0 && c.code < 128) { "color must be #rgb or #rrggbb" }
        return d
    }

    private fun channel(value: Int): Double {
        val c = value / 255.0
        return if (c <= 0.04045) c / 12.92 else ((c + 0.055) / 1.055).pow(2.4)
    }

    /** WCAG relative luminance in [0, 1] of a #rgb or #rrggbb color (case-insensitive). */
    fun relativeLuminance(hex: String): Double {
        require(hex.startsWith("#") && (hex.length == 4 || hex.length == 7)) { "color must be #rgb or #rrggbb" }
        val rgb = IntArray(3) { i ->
            if (hex.length == 4) hexDigit(hex[1 + i]) * 17 else hexDigit(hex[1 + 2 * i]) * 16 + hexDigit(hex[2 + 2 * i])
        }
        return 0.2126 * channel(rgb[0]) + 0.7152 * channel(rgb[1]) + 0.0722 * channel(rgb[2])
    }

    /** (Lmax + 0.05) / (Lmin + 0.05), between 1 and 21. */
    fun contrastRatio(a: String, b: String): Double {
        val la = relativeLuminance(a)
        val lb = relativeLuminance(b)
        return (max(la, lb) + 0.05) / (min(la, lb) + 0.05)
    }

    /** [contrastRatio] rounded to 2 decimals, half away from zero. */
    fun contrastRatio2(a: String, b: String): Double = BigDecimal(contrastRatio(a, b)).setScale(2, RoundingMode.HALF_UP).toDouble()

    /** AA needs 4.5 (3.0 large text), AAA needs 7.0 (4.5 large text); compares the unrounded ratio. */
    fun passes(ratio: Double, level: String, largeText: Boolean): Boolean = when (level) {
        "AA" -> ratio >= if (largeText) 3.0 else 4.5
        "AAA" -> ratio >= if (largeText) 4.5 else 7.0
        else -> throw IllegalArgumentException("level must be AA or AAA")
    }
}
