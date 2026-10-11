// SPDX-License-Identifier: Apache-2.0

/**
 * ISO 8601 week dates (weeks start Monday; week 1 holds the year's first Thursday) in the proleptic Gregorian calendar,
 * years 1..9999, computed with plain day arithmetic. Invalid dates or weeks throw IllegalArgumentException.
 */
object IsoWeek {
    /** An ISO week date: week-numbering year, week 1..53 and weekday 1 (Monday) .. 7 (Sunday). */
    data class WeekDate(val weekYear: Int, val week: Int, val weekday: Int)

    /** A calendar date. */
    data class Date(val year: Int, val month: Int, val day: Int)

    private val FORMAT = Regex("([0-9]{4})-?W([0-9]{2})(?:-?([1-7]))?")

    /** ISO week date of a calendar date. */
    fun isoWeek(year: Int, month: Int, day: Int): WeekDate {
        val days = toDays(year, month, day)
        val wd = weekday(days)
        val thursday = days + 4 - wd
        val ty = fromDays(thursday).year
        return WeekDate(ty, ((thursday - toDaysUnchecked(ty, 1, 1)) / 7).toInt() + 1, wd)
    }

    /** Calendar date of an ISO week date; week must be 1..weeksInYear and weekday 1..7. */
    fun fromIsoWeek(weekYear: Int, week: Int, weekday: Int): Date {
        require(weekYear in 1..9999 && weekday in 1..7 && week >= 1 && week <= weeksInYear(weekYear)) { "invalid ISO week date" }
        val jan4 = toDaysUnchecked(weekYear, 1, 4)
        val d = fromDays(jan4 - (weekday(jan4) - 1) + (week - 1) * 7L + (weekday - 1))
        require(d.year in 1..9999) { "date out of range" }
        return d
    }

    /** Number of ISO weeks (52 or 53) in a week-numbering year. */
    fun weeksInYear(year: Int): Int = isoWeek(year, 12, 28).week

    /** Formats a calendar date as "YYYY-Www-D". */
    fun formatIsoWeek(year: Int, month: Int, day: Int): String {
        val w = isoWeek(year, month, day)
        return "%04d-W%02d-%d".format(java.util.Locale.ROOT, w.weekYear, w.week, w.weekday)
    }

    /** Parses "YYYY-Www-D", "YYYYWwwD" or "YYYY-Www" (weekday 1) to a calendar date. */
    fun parseIsoWeek(s: String): Date {
        val m = FORMAT.matchEntire(s) ?: throw IllegalArgumentException("not an ISO week date")
        val wd = m.groupValues[3].ifEmpty { "1" }.toInt()
        return fromIsoWeek(m.groupValues[1].toInt(), m.groupValues[2].toInt(), wd)
    }

    private fun leap(y: Int) = (y % 4 == 0 && y % 100 != 0) || y % 400 == 0

    private fun daysInMonth(y: Int, m: Int) = when (m) { 2 -> if (leap(y)) 29 else 28; 4, 6, 9, 11 -> 30; else -> 31 }

    private fun toDays(y: Int, m: Int, d: Int): Long {
        require(y in 1..9999) { "year out of range" }
        require(m in 1..12) { "month must be in 1..12" }
        require(d >= 1 && d <= daysInMonth(y, m)) { "day is out of range for month" }
        return toDaysUnchecked(y, m, d)
    }

    // Days since 1970-01-01 (days-from-civil algorithm described by H. Hinnant).
    private fun toDaysUnchecked(y: Int, m: Int, d: Int): Long {
        val yy = (if (m <= 2) y - 1 else y).toLong()
        val era = Math.floorDiv(yy, 400L)
        val yoe = yy - era * 400
        val doy = (153L * (m + (if (m > 2) -3 else 9)) + 2) / 5 + d - 1
        val doe = yoe * 365 + yoe / 4 - yoe / 100 + doy
        return era * 146097 + doe - 719468
    }

    private fun fromDays(z0: Long): Date {
        val z = z0 + 719468
        val era = Math.floorDiv(z, 146097L)
        val doe = z - era * 146097
        val yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365
        val doy = doe - (365 * yoe + yoe / 4 - yoe / 100)
        val mp = (5 * doy + 2) / 153
        val d = (doy - (153 * mp + 2) / 5 + 1).toInt()
        val m = (if (mp < 10) mp + 3 else mp - 9).toInt()
        return Date((yoe + era * 400 + (if (m <= 2) 1 else 0)).toInt(), m, d)
    }

    private fun weekday(days: Long) = Math.floorMod(days + 3, 7L).toInt() + 1
}
