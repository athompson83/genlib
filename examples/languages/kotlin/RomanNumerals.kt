// SPDX-License-Identifier: Apache-2.0

/**
 * Roman numerals 1..3999 in standard subtractive form. Parsing is case-insensitive and accepts only the canonical
 * form (so "IIII", "IC" and "VX" are rejected). Every failure throws IllegalArgumentException.
 */
object RomanNumerals {
    private val PAIRS = listOf(
        1000 to "M", 900 to "CM", 500 to "D", 400 to "CD", 100 to "C", 90 to "XC",
        50 to "L", 40 to "XL", 10 to "X", 9 to "IX", 5 to "V", 4 to "IV", 1 to "I",
    )
    private val VALUE = mapOf('I' to 1, 'V' to 5, 'X' to 10, 'L' to 50, 'C' to 100, 'D' to 500, 'M' to 1000)

    /** Formats 1..3999 as an upper-case Roman numeral. */
    fun toRoman(n: Int): String {
        require(n in 1..3999) { "out of range" }
        var rest = n
        val out = StringBuilder()
        for ((v, s) in PAIRS) while (rest >= v) { out.append(s); rest -= v }
        return out.toString()
    }

    /** Parses a canonical Roman numeral (any case) to its value. */
    fun fromRoman(s: String): Int {
        val u = s.uppercase()
        require(u.isNotEmpty() && u.all { it in VALUE }) { "not a roman numeral" }
        var total = 0
        for (i in u.indices) {
            val v = VALUE.getValue(u[i])
            total += if (i + 1 < u.length && VALUE.getValue(u[i + 1]) > v) -v else v
        }
        require(total in 1..3999 && toRoman(total) == u) { "not a canonical roman numeral" }
        return total
    }
}
