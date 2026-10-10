// SPDX-License-Identifier: Apache-2.0
import java.math.BigInteger

/** Byte sizes (SI and IEC), byte-size parsing, compact durations and relative times, with integer half-up rounding. */
object HumanUnits {
    private val SI = listOf("B", "kB", "MB", "GB", "TB", "PB", "EB")
    private val IEC = listOf("B", "KiB", "MiB", "GiB", "TiB", "PiB", "EiB")
    private val SIZE = Regex("(?U)\\s*([0-9]+)(?:\\.([0-9]+))?\\s*([A-Za-z]*)\\s*")
    private val UNITS: Map<String, BigInteger> = mapOf(
        "" to BigInteger.ONE, "b" to BigInteger.ONE,
        "kb" to BigInteger.TEN.pow(3), "mb" to BigInteger.TEN.pow(6), "gb" to BigInteger.TEN.pow(9),
        "tb" to BigInteger.TEN.pow(12), "pb" to BigInteger.TEN.pow(15), "eb" to BigInteger.TEN.pow(18),
        "kib" to BigInteger.TWO.pow(10), "mib" to BigInteger.TWO.pow(20), "gib" to BigInteger.TWO.pow(30),
        "tib" to BigInteger.TWO.pow(40), "pib" to BigInteger.TWO.pow(50), "eib" to BigInteger.TWO.pow(60),
    )
    private val MAX = BigInteger.valueOf(Long.MAX_VALUE)

    /** Round half up of n / d for n >= 0, d > 0. */
    private fun roundDiv(n: BigInteger, d: BigInteger): BigInteger = n.shiftLeft(1).add(d).divide(d.shiftLeft(1))

    private fun roundDiv(n: Long, d: Long): Long = n / d + if (2 * (n % d) >= d) 1 else 0

    /** "1.5 kB" / "1.5 KiB"; [base] is "si" or "iec", [decimals] 0..3, trailing zeros removed. */
    fun formatBytes(n: Long, base: String = "si", decimals: Int = 1): String {
        require(n >= 0) { "byte count must be non-negative" }
        require(decimals in 0..3) { "decimals must be 0..3" }
        require(base == "si" || base == "iec") { "base must be si or iec" }
        val units = if (base == "si") SI else IEC
        val step = BigInteger.valueOf(if (base == "si") 1000 else 1024)
        val big = BigInteger.valueOf(n)
        if (big < step) return "$n B"
        var i = 1
        while (i < 6 && big >= step.pow(i + 1)) i++
        val scale = BigInteger.TEN.pow(decimals)
        var v = roundDiv(big * scale, step.pow(i))
        if (v >= step * scale && i < 6) { i++; v = roundDiv(big * scale, step.pow(i)) }
        val (whole, frac) = v.divideAndRemainder(scale)
        var s = whole.toString()
        if (decimals > 0) {
            val f = frac.toString().padStart(decimals, '0').trimEnd('0')
            if (f.isNotEmpty()) s += ".$f"
        }
        return "$s ${units[i]}"
    }

    /** Parses "1.5 GiB", "2MB", "512"; units are case-insensitive (kb..eb powers of 1000, kib..eib powers of 1024). */
    fun parseBytes(text: String): Long {
        val m = SIZE.matchEntire(text) ?: throw IllegalArgumentException("invalid byte size")
        val mult = UNITS[m.groupValues[3].lowercase()] ?: throw IllegalArgumentException("unknown byte unit")
        val frac = m.groupValues[2]
        val num = BigInteger(m.groupValues[1] + frac)
        val r = roundDiv(num * mult, BigInteger.TEN.pow(frac.length))
        require(r <= MAX) { "byte size exceeds 2^63-1" }
        return r.toLong()
    }

    /** "850ms", "45s", "1h 2m", "1d 1h": the two largest non-zero units of whole seconds. */
    fun formatDuration(ms: Long): String {
        require(ms >= 0) { "duration must be non-negative" }
        if (ms < 1000) return "${ms}ms"
        var s = ms / 1000
        val parts = mutableListOf<String>()
        for ((name, size) in listOf("d" to 86400L, "h" to 3600L, "m" to 60L, "s" to 1L)) {
            val q = s / size
            s %= size
            if (q > 0) parts += "$q$name"
        }
        return parts.take(2).joinToString(" ")
    }

    /** "just now", "in 3 minutes", "2 months ago"; positive [deltaSeconds] is the future. */
    fun relativeTime(deltaSeconds: Long): String {
        require(deltaSeconds != Long.MIN_VALUE) { "delta out of range" }
        val a = Math.abs(deltaSeconds)
        val p = when {
            a < 45 -> return "just now"
            a < 90 -> "a minute"
            a < 45 * 60 -> "${roundDiv(a, 60)} minutes"
            a < 90 * 60 -> "an hour"
            a < 22 * 3600 -> "${roundDiv(a, 3600)} hours"
            a < 36 * 3600 -> "a day"
            a < 26 * 86400 -> "${roundDiv(a, 86400)} days"
            a < 46 * 86400 -> "a month"
            a < 320 * 86400 -> "${roundDiv(a, 2629746)} months"
            a < 548 * 86400 -> "a year"
            else -> "${roundDiv(a, 31556952)} years"
        }
        return if (deltaSeconds > 0) "in $p" else "$p ago"
    }
}
