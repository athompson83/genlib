// SPDX-License-Identifier: Apache-2.0
import java.time.DateTimeException
import java.time.LocalDate
import java.time.LocalDateTime
import java.util.Locale
import java.util.TreeSet
import kotlin.math.abs

/** RFC 5545 recurrence rule expansion (UTC subset: FREQ, INTERVAL, COUNT, UNTIL, BYDAY, BYMONTHDAY, BYMONTH). */
object RRule {
    private val DTSTART = Regex("([0-9]{4})-([0-9]{2})-([0-9]{2})T([0-9]{2}):([0-9]{2}):([0-9]{2})Z")
    private val UNTIL = Regex("([0-9]{4})([0-9]{2})([0-9]{2})T([0-9]{2})([0-9]{2})([0-9]{2})Z")
    private val NUM = Regex("[+-]?[0-9]{1,4}")
    private val BYDAY = Regex("([+-]?[1-5])?(MO|TU|WE|TH|FR|SA|SU)")
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

    private fun num(s: String, lo: Int, hi: Int, allowNegative: Boolean, part: String): Int {
        require(NUM.matches(s)) { "invalid $part value: $s" }
        val v = s.toInt()
        require((v >= 0 || allowNegative) && abs(v) in lo..hi) { "$part value out of range: $s" }
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
        val byDay = parts["BYDAY"]?.split(",")?.map { d ->
            val m = requireNotNull(BYDAY.matchEntire(d)) { "invalid BYDAY value: $d" }
            val n = m.groupValues[1].ifEmpty { "0" }.toInt()
            require(n == 0 || freq == "MONTHLY") { "BYDAY ordinals are only supported with FREQ=MONTHLY" }
            Day(n, WEEKDAYS.indexOf(m.groupValues[2]))
        } ?: emptyList()
        require(byDay.isEmpty() || (freq != "DAILY" && freq != "YEARLY")) { "BYDAY is not supported with FREQ=$freq" }
        val byMonthDay = parts["BYMONTHDAY"]?.let { v ->
            require(freq == "MONTHLY") { "BYMONTHDAY requires FREQ=MONTHLY" }
            v.split(",").map { num(it, 1, 31, true, "BYMONTHDAY") }.also { require(byDay.isEmpty()) { "BYDAY and BYMONTHDAY cannot be combined" } }
        } ?: emptyList()
        val byMonth = parts["BYMONTH"]?.let { v ->
            require(freq == "YEARLY") { "BYMONTH requires FREQ=YEARLY" }
            v.split(",").map { num(it, 1, 12, false, "BYMONTH") }
        } ?: emptyList()
        return Rule(freq, interval, count, until, byDay, byMonthDay, byMonth)
    }

    private fun format(d: LocalDateTime) =
        String.format(Locale.ROOT, "%04d-%02d-%02dT%02d:%02d:%02dZ", d.year, d.monthValue, d.dayOfMonth, d.hour, d.minute, d.second)

    private fun weekday(d: LocalDate) = d.dayOfWeek.value - 1

    /** Occurrences (YYYY-MM-DDTHH:MM:SSZ) of [rule] starting at [dtstart], at most [limit] (1..1000); scans at most 100000 periods. */
    fun expandRRule(dtstart: String, rule: String, limit: Int = 50): List<String> {
        val s = dateTime(requireNotNull(DTSTART.matchEntire(dtstart)) { "dtstart must be YYYY-MM-DDTHH:MM:SSZ" }, "dtstart")
        val r = parseRule(rule)
        require(limit in 1..1000) { "limit must be between 1 and 1000" }
        val t = s.toLocalTime()
        val start = s.toLocalDate()
        val out = mutableListOf<String>()
        for (k in 0 until MAX_PERIODS) {
            val cands = TreeSet<LocalDateTime>()
            val step = k.toLong() * r.interval
            when (r.freq) {
                "DAILY" -> cands += LocalDateTime.of(start.plusDays(step), t)
                "WEEKLY" -> {
                    val monday = start.minusDays(weekday(start).toLong()).plusWeeks(step)
                    val days = if (r.byDay.isEmpty()) listOf(weekday(start)) else r.byDay.map { it.weekday }
                    for (d in days) cands += LocalDateTime.of(monday.plusDays(d.toLong()), t)
                }
                "MONTHLY" -> {
                    val mi = start.monthValue - 1 + step
                    val y = start.year + mi / 12
                    if (y > 9999) return out
                    val first = LocalDate.of(y.toInt(), (mi % 12).toInt() + 1, 1)
                    val nd = first.lengthOfMonth()
                    if (r.byDay.isNotEmpty()) {
                        for (bd in r.byDay) {
                            val days = (1..nd).filter { weekday(first.withDayOfMonth(it)) == bd.weekday }
                            val n = bd.ordinal
                            if (n == 0) days.forEach { cands += LocalDateTime.of(first.withDayOfMonth(it), t) }
                            else if (abs(n) <= days.size) cands += LocalDateTime.of(first.withDayOfMonth(days[if (n > 0) n - 1 else days.size + n]), t)
                        }
                    } else if (r.byMonthDay.isNotEmpty()) {
                        for (md in r.byMonthDay) {
                            val d = if (md > 0) md else nd + md + 1
                            if (d in 1..nd) cands += LocalDateTime.of(first.withDayOfMonth(d), t)
                        }
                    } else if (start.dayOfMonth <= nd) cands += LocalDateTime.of(first.withDayOfMonth(start.dayOfMonth), t)
                }
                else -> {
                    val y = start.year + step
                    if (y > 9999) return out
                    for (mo in r.byMonth.ifEmpty { listOf(start.monthValue) }) {
                        val first = LocalDate.of(y.toInt(), mo, 1)
                        if (start.dayOfMonth <= first.lengthOfMonth()) cands += LocalDateTime.of(first.withDayOfMonth(start.dayOfMonth), t)
                    }
                }
            }
            for (c in cands) {
                if (c.year > 9999) return out
                if (c < s) continue
                if (r.until != null && c > r.until) return out
                out += format(c)
                if ((r.count != null && out.size >= r.count) || out.size >= limit) return out
            }
            if (r.until != null && (cands.firstOrNull() ?: s) > r.until) return out
        }
        return out
    }
}
