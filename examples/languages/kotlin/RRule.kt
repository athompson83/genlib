// SPDX-License-Identifier: Apache-2.0
import java.time.DateTimeException
import java.time.LocalDate
import java.time.LocalDateTime
import java.util.Locale
import kotlin.math.abs

/**
 * RFC 5545 recurrence rule expansion in UTC: FREQ (DAILY, WEEKLY, MONTHLY, YEARLY), INTERVAL, COUNT, UNTIL,
 * BYDAY (with MONTHLY/YEARLY ordinals), BYMONTHDAY and BYMONTH. Matches python-dateutil for every rule it accepts;
 * rejects BYSETPOS, WKST, BYHOUR and every other part.
 */
object RRule {
    private val DTSTART = Regex("([0-9]{4})-([0-9]{2})-([0-9]{2})T([0-9]{2}):([0-9]{2}):([0-9]{2})Z")
    private val UNTIL = Regex("([0-9]{4})([0-9]{2})([0-9]{2})T([0-9]{2})([0-9]{2})([0-9]{2})Z")
    private val SIGNED = Regex("[+-]?[0-9]{1,4}")
    private val UNSIGNED = Regex("\\+?[0-9]{1,4}")
    private val BYDAY = Regex("([+-]?[0-9]{1,2})?(MO|TU|WE|TH|FR|SA|SU)")
    private val WEEKDAYS = listOf("MO", "TU", "WE", "TH", "FR", "SA", "SU")
    private val ALLOWED = setOf("FREQ", "INTERVAL", "COUNT", "UNTIL", "BYDAY", "BYMONTHDAY", "BYMONTH")
    private const val MAX_PERIODS = 100000

    /** A BYDAY entry: ordinal 0 means every such weekday; weekday 0 = Monday. */
    private data class Day(val ordinal: Int, val weekday: Int)

    private data class Rule(
        val freq: String, val interval: Int, val count: Int?, val until: LocalDateTime?,
        val byDay: List<Day>, val byMonthDay: List<Int>, val byMonth: List<Int>,
    )

    private fun dateTime(m: MatchResult, what: String): LocalDateTime {
        val g = m.groupValues.drop(1).map { it.toInt() }
        require(g[0] >= 1) { "$what year must be 0001-9999" }
        return try {
            LocalDateTime.of(g[0], g[1], g[2], g[3], g[4], g[5])
        } catch (e: DateTimeException) {
            throw IllegalArgumentException("invalid $what: ${e.message}", e)
        }
    }

    private fun num(s: String, lo: Int, hi: Int, signed: Boolean, part: String): Int {
        require((if (signed) SIGNED else UNSIGNED).matches(s)) { "invalid $part value: $s" }
        val v = s.toInt()
        require(v != 0 && abs(v) in lo..hi) { "$part value out of range: $s" }
        return v
    }

    private fun parseRule(rule: String): Rule {
        val parts = mutableMapOf<String, String>()
        for (p in rule.split(";")) {
            require('=' in p) { "malformed rule part: $p" }
            val k = p.substringBefore('=')
            require(k !in parts) { "duplicate rule part: $k" }
            parts[k] = p.substringAfter('=')
        }
        for (k in parts.keys) require(k in ALLOWED) { "unsupported rule part: $k" }
        val freq = requireNotNull(parts["FREQ"]) { "FREQ is required" }
        require(freq in listOf("DAILY", "WEEKLY", "MONTHLY", "YEARLY")) { "unsupported FREQ: $freq" }
        require(!("COUNT" in parts && "UNTIL" in parts)) { "COUNT and UNTIL cannot both be set" }
        val interval = parts["INTERVAL"]?.let { num(it, 1, 9999, false, "INTERVAL") } ?: 1
        val count = parts["COUNT"]?.let { num(it, 1, 9999, false, "COUNT") }
        val until = parts["UNTIL"]?.let { dateTime(requireNotNull(UNTIL.matchEntire(it)) { "UNTIL must be YYYYMMDDTHHMMSSZ" }, "UNTIL") }
        val ordinalScope = freq == "MONTHLY" || freq == "YEARLY"
        val maxOrdinal = if (freq == "MONTHLY" || (freq == "YEARLY" && "BYMONTH" in parts)) 5 else 53
        val byDay = parts["BYDAY"]?.split(",")?.map { d ->
            val m = requireNotNull(BYDAY.matchEntire(d)) { "invalid BYDAY value: $d" }
            val n = if (m.groupValues[1].isEmpty()) 0 else m.groupValues[1].toInt()
            require(m.groupValues[1].isEmpty() || (ordinalScope && n != 0 && abs(n) <= maxOrdinal)) { "invalid BYDAY ordinal for FREQ=$freq: $d" }
            Day(n, WEEKDAYS.indexOf(m.groupValues[2]))
        } ?: emptyList()
        require(byDay.all { it.ordinal == 0 } || byDay.none { it.ordinal == 0 }) { "BYDAY cannot mix plain and ordinal weekdays" }
        val byMonthDay = parts["BYMONTHDAY"]?.split(",")?.map { num(it, 1, 31, true, "BYMONTHDAY") } ?: emptyList()
        val byMonth = parts["BYMONTH"]?.split(",")?.map { num(it, 1, 12, false, "BYMONTH") } ?: emptyList()
        return Rule(freq, interval, count, until, byDay, byMonthDay, byMonth)
    }

    private fun format(d: LocalDateTime) =
        String.format(Locale.ROOT, "%04d-%02d-%02dT%02d:%02d:%02dZ", d.year, d.monthValue, d.dayOfMonth, d.hour, d.minute, d.second)

    private fun weekday(d: LocalDate) = d.dayOfWeek.value - 1

    /** Whether day [d] passes every filter; defaults (from dtstart) are already folded into the lists. */
    private fun matches(r: Rule, byDay: List<Day>, byMonthDay: List<Int>, byMonth: List<Int>, d: LocalDate): Boolean {
        if (byMonth.isNotEmpty() && d.monthValue !in byMonth) return false
        if (byMonthDay.isNotEmpty()) {
            val nd = d.lengthOfMonth()
            if (byMonthDay.none { d.dayOfMonth == (if (it > 0) it else nd + it + 1) }) return false
        }
        if (byDay.isNotEmpty()) {
            val inMonth = r.freq == "MONTHLY" || (r.freq == "YEARLY" && r.byMonth.isNotEmpty())
            val pos = if (inMonth) d.dayOfMonth else d.dayOfYear
            val len = if (inMonth) d.lengthOfMonth() else d.lengthOfYear()
            val ok = byDay.any { bd ->
                bd.weekday == weekday(d) && (bd.ordinal == 0 ||
                    bd.ordinal == (if (bd.ordinal > 0) (pos - 1) / 7 + 1 else -((len - pos) / 7 + 1)))
            }
            if (!ok) return false
        }
        return true
    }

    /** Occurrences (YYYY-MM-DDTHH:MM:SSZ) of [rule] starting at [dtstart], at most [limit] (1..1000); scans at most 100000 periods. */
    fun expandRRule(dtstart: String, rule: String, limit: Int = 50): List<String> {
        val s = dateTime(requireNotNull(DTSTART.matchEntire(dtstart)) { "dtstart must be YYYY-MM-DDTHH:MM:SSZ" }, "dtstart")
        val r = parseRule(rule)
        require(limit in 1..1000) { "limit must be between 1 and 1000" }
        val t = s.toLocalTime()
        val start = s.toLocalDate()
        var byDay = r.byDay
        var byMonthDay = r.byMonthDay
        var byMonth = r.byMonth
        if (byDay.isEmpty() && byMonthDay.isEmpty()) {
            when (r.freq) {
                "WEEKLY" -> byDay = listOf(Day(0, weekday(start)))
                "MONTHLY" -> byMonthDay = listOf(start.dayOfMonth)
                "YEARLY" -> {
                    byMonthDay = listOf(start.dayOfMonth)
                    if (byMonth.isEmpty()) byMonth = listOf(start.monthValue)
                }
            }
        }
        val out = mutableListOf<String>()
        for (k in 0 until MAX_PERIODS) {
            val step = k.toLong() * r.interval
            val first: LocalDate
            val length: Int
            when (r.freq) {
                "DAILY" -> { first = start.plusDays(step); length = 1 }
                "WEEKLY" -> { first = start.minusDays(weekday(start).toLong()).plusWeeks(step); length = 7 }
                "MONTHLY" -> {
                    val mi = start.monthValue - 1 + step
                    val y = start.year + mi / 12
                    if (y > 9999) return out
                    first = LocalDate.of(y.toInt(), (mi % 12).toInt() + 1, 1)
                    length = first.lengthOfMonth()
                }
                else -> {
                    val y = start.year + step
                    if (y > 9999) return out
                    first = LocalDate.of(y.toInt(), 1, 1)
                    length = first.lengthOfYear()
                }
            }
            if (first.year > 9999) return out
            for (i in 0 until length) {
                val d = first.plusDays(i.toLong())
                if (!matches(r, byDay, byMonthDay, byMonth, d)) continue
                val c = LocalDateTime.of(d, t)
                if (c.year > 9999) return out
                if (c < s) continue
                if (r.until != null && c > r.until) return out
                out += format(c)
                if ((r.count != null && out.size >= r.count) || out.size >= limit) return out
            }
            if (r.until != null && LocalDateTime.of(first, t) > r.until) return out
        }
        return out
    }
}
