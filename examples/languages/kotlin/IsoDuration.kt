// SPDX-License-Identifier: Apache-2.0

/** ISO 8601 durations: PnYnMnWnDTnHnMn(.fff)S parsing, exact milliseconds and formatting. */
object IsoDuration {
    /** Parsed components; seconds and their fraction are combined into milliseconds. */
    data class Parts(
        val years: Long = 0, val months: Long = 0, val weeks: Long = 0, val days: Long = 0,
        val hours: Long = 0, val minutes: Long = 0, val milliseconds: Long = 0,
    )

    private val DURATION = Regex(
        "P(?:([0-9]+)Y)?(?:([0-9]+)M)?(?:([0-9]+)W)?(?:([0-9]+)D)?(?:T(?:([0-9]+)H)?(?:([0-9]+)M)?(?:([0-9]+)(?:\\.([0-9]{1,3}))?S)?)?",
    )

    private fun num(g: String?): Long = if (g.isNullOrEmpty()) 0 else g.toLongOrNull() ?: throw IllegalArgumentException("duration component too large")

    private inline fun <T> exact(block: () -> T): T =
        try { block() } catch (e: ArithmeticException) { throw IllegalArgumentException("duration too large", e) }

    /** Parses an upper-case ISO 8601 duration with at least one component; fractions only on seconds (1-3 digits). */
    fun parseDuration(s: String): Parts {
        val m = DURATION.matchEntire(s)
        require(m != null && !s.endsWith("T")) { "invalid ISO 8601 duration: $s" }
        val g = m.groupValues
        require((1..7).any { g[it].isNotEmpty() }) { "invalid ISO 8601 duration: $s" }
        val fracMs = if (g[8].isEmpty()) 0L else (g[8] + "00").substring(0, 3).toLong()
        val ms = exact { Math.addExact(Math.multiplyExact(num(g[7]), 1000L), fracMs) }
        return Parts(num(g[1]), num(g[2]), num(g[3]), num(g[4]), num(g[5]), num(g[6]), ms)
    }

    /** Exact length in milliseconds (week = 7 days, day = 24 h); years and months are calendar-dependent and rejected. */
    fun durationMilliseconds(p: Parts): Long {
        require(p.years == 0L && p.months == 0L) { "years and months have no exact length" }
        return exact {
            val days = Math.addExact(Math.multiplyExact(p.weeks, 7L), p.days)
            val hours = Math.addExact(Math.multiplyExact(days, 24L), p.hours)
            val minutes = Math.addExact(Math.multiplyExact(hours, 60L), p.minutes)
            Math.addExact(Math.multiplyExact(minutes, 60000L), p.milliseconds)
        }
    }

    /** Formats non-negative milliseconds as days, hours, minutes and seconds (0 -> "PT0S"). */
    fun formatDuration(ms: Long): String {
        require(ms >= 0) { "milliseconds must be >= 0" }
        val d = ms / 86400000L
        var r = ms % 86400000L
        val h = r / 3600000L
        r %= 3600000L
        val mi = r / 60000L
        r %= 60000L
        val s = r / 1000L
        val f = r % 1000L
        val t = StringBuilder()
        if (h != 0L) t.append(h).append('H')
        if (mi != 0L) t.append(mi).append('M')
        if (s != 0L || f != 0L) {
            t.append(s)
            if (f != 0L) t.append('.').append(f.toString().padStart(3, '0').trimEnd('0'))
            t.append('S')
        }
        val out = "P" + (if (d != 0L) "${d}D" else "") + (if (t.isNotEmpty()) "T$t" else "")
        return if (out == "P") "PT0S" else out
    }
}
