// SPDX-License-Identifier: Apache-2.0
import java.time.Instant
import java.time.LocalDateTime
import java.time.ZoneOffset
import java.time.format.DateTimeParseException
import java.time.temporal.ChronoUnit

/** Next run time of a 5-field cron expression in UTC (Vixie day-of-month/day-of-week OR rule). */
object CronNext {
    private fun number(s: String, field: String): Int {
        require(s.isNotEmpty() && s.length <= 4 && s.all { it in '0'..'9' }) { "invalid $field value: '$s'" }
        return s.toInt()
    }

    private fun field(text: String, name: String, min: Int, max: Int): BooleanArray {
        val allowed = BooleanArray(max + 1)
        for (item in text.split(",")) {
            var range = item
            var step = 1
            val slash = item.indexOf('/')
            if (slash >= 0) {
                range = item.substring(0, slash)
                step = number(item.substring(slash + 1), "$name step")
                require(step in 1..(max - min + 1)) { "$name step out of range: $step" }
            }
            val lo: Int
            val hi: Int
            if (range == "*") { lo = min; hi = max }
            else {
                val dash = range.indexOf('-')
                if (dash >= 0) { lo = number(range.substring(0, dash), name); hi = number(range.substring(dash + 1), name) }
                else { lo = number(range, name); hi = if (slash >= 0) max else lo }
                require(lo >= min && hi <= max && lo <= hi) { "$name out of range: '$item'" }
            }
            for (v in lo..hi step step) allowed[v] = true
        }
        return allowed
    }

    /** First minute strictly after [afterIsoUtc] (seconds truncated), formatted YYYY-MM-DDTHH:MM:00Z. */
    fun nextRun(expression: String, afterIsoUtc: String): String {
        val f = expression.trim().split(Regex("\\s+"))
        require(f.size == 5) { "cron expression must have 5 fields" }
        val minutes = field(f[0], "minute", 0, 59)
        val hours = field(f[1], "hour", 0, 23)
        val dom = field(f[2], "day-of-month", 1, 31)
        val months = field(f[3], "month", 1, 12)
        val dow = field(f[4], "day-of-week", 0, 7)
        if (dow[7]) dow[0] = true
        val bothRestricted = !f[2].startsWith("*") && !f[4].startsWith("*")
        var t = try {
            LocalDateTime.ofInstant(Instant.parse(afterIsoUtc), ZoneOffset.UTC)
        } catch (e: DateTimeParseException) {
            throw IllegalArgumentException("after must be an ISO-8601 UTC instant")
        }
        t = t.truncatedTo(ChronoUnit.MINUTES).plusMinutes(1)
        val limit = t.plusYears(5)
        while (!t.isAfter(limit)) {
            if (!months[t.monthValue]) { t = t.withDayOfMonth(1).truncatedTo(ChronoUnit.DAYS).plusMonths(1); continue }
            val domOk = dom[t.dayOfMonth]
            val dowOk = dow[t.dayOfWeek.value % 7]
            if (!(if (bothRestricted) domOk || dowOk else domOk && dowOk)) { t = t.truncatedTo(ChronoUnit.DAYS).plusDays(1); continue }
            if (!hours[t.hour]) { t = t.truncatedTo(ChronoUnit.HOURS).plusHours(1); continue }
            if (!minutes[t.minute]) { t = t.plusMinutes(1); continue }
            return "%04d-%02d-%02dT%02d:%02d:00Z".format(t.year, t.monthValue, t.dayOfMonth, t.hour, t.minute)
        }
        throw IllegalArgumentException("no matching time within 5 years: $expression")
    }
}
