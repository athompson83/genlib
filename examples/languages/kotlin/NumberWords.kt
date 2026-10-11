// SPDX-License-Identifier: Apache-2.0

/**
 * English number words in US style without "and" ("one hundred five", "forty-two", "one million one"), ordinal words
 * ("twenty-first"), numeric ordinal suffixes ("112th") and money amounts ("one dollar and one cent"). Out-of-range
 * input throws IllegalArgumentException.
 */
object NumberWords {
    private val ONES = listOf("zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten",
        "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen")
    private val TENS = listOf("", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety")
    private val SCALES = listOf("", "thousand", "million", "billion", "trillion")
    private val IRREGULAR = mapOf("one" to "first", "two" to "second", "three" to "third", "five" to "fifth",
        "eight" to "eighth", "nine" to "ninth", "twelve" to "twelfth")
    private const val LIMIT = 1_000_000_000_000_000L

    private fun under1000(n0: Int): String {
        var n = n0
        val parts = ArrayList<String>()
        if (n >= 100) { parts.add(ONES[n / 100] + " hundred"); n %= 100 }
        if (n >= 20) parts.add(TENS[n / 10] + if (n % 10 != 0) "-" + ONES[n % 10] else "")
        else if (n > 0) parts.add(ONES[n])
        return parts.joinToString(" ")
    }

    /** Cardinal words for |n| < 10^15 ("negative " prefix for negatives). */
    fun numberToWords(n: Long): String {
        require(n > -LIMIT && n < LIMIT) { "range" }
        if (n == 0L) return "zero"
        if (n < 0) return "negative " + numberToWords(-n)
        val groups = ArrayList<String>()
        var rest = n
        var i = 0
        while (rest > 0) {
            val g = (rest % 1000).toInt()
            if (g != 0) groups.add(0, under1000(g) + if (SCALES[i].isEmpty()) "" else " " + SCALES[i])
            rest /= 1000
            i++
        }
        return groups.joinToString(" ")
    }

    private fun ordinal(w: String): String = IRREGULAR[w] ?: if (w.endsWith("y")) w.dropLast(1) + "ieth" else w + "th"

    /** Ordinal words for n >= 0 ("zeroth", "twenty-first", "one hundredth"). */
    fun ordinalWords(n: Long): String {
        require(n >= 0) { "range" }
        val words = numberToWords(n).split(" ").toMutableList()
        val last = words.last()
        val dash = last.indexOf('-')
        words[words.size - 1] = if (dash >= 0) last.substring(0, dash + 1) + ordinal(last.substring(dash + 1)) else ordinal(last)
        return words.joinToString(" ")
    }

    /** The number followed by st/nd/rd/th ("1st", "11th", "-22nd"). */
    fun ordinalSuffix(n: Long): String {
        val a = Math.abs(n % 100)
        val s = if (a in 11..13) "th" else when (a % 10) { 1L -> "st"; 2L -> "nd"; 3L -> "rd"; else -> "th" }
        return "$n$s"
    }

    /** Words for an amount in minor units ("one dollar and one cent"); exponent 0..3, 0 meaning no minor unit. */
    fun moneyWords(minor: Long, major: String, minorName: String, exponent: Int = 2): String {
        require(minor >= 0 && exponent in 0..3) { "bad" }
        var unit = 1L
        repeat(exponent) { unit *= 10 }
        val whole = minor / unit
        val frac = minor % unit
        var out = numberToWords(whole) + " " + major + if (whole == 1L) "" else "s"
        if (exponent != 0 && frac != 0L) out += " and " + numberToWords(frac) + " " + minorName + if (frac == 1L) "" else "s"
        return out
    }
}
