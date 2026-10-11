// SPDX-License-Identifier: Apache-2.0
import java.time.DateTimeException
import java.time.LocalDate

/** Business days over strict ISO dates (YYYY-MM-DD) with configurable weekend days (MO..SU) and holidays. */
object BusinessDays {
    private val WEEKDAYS = listOf("MO", "TU", "WE", "TH", "FR", "SA", "SU")
    private val DATE = Regex("[0-9]{4}-[0-9]{2}-[0-9]{2}")

    private fun date(s: String): LocalDate {
        require(DATE.matches(s)) { "date must be YYYY-MM-DD" }
        val y = s.substring(0, 4).toInt()
        require(y >= 1) { "year must be 0001..9999" }
        return try { LocalDate.of(y, s.substring(5, 7).toInt(), s.substring(8, 10).toInt()) }
        catch (e: DateTimeException) { throw IllegalArgumentException("invalid date: $s") }
    }

    private fun weekendSet(weekend: List<String>): Set<Int> {
        val w = weekend.map { x -> WEEKDAYS.indexOf(x).also { require(it >= 0) { "weekend days are MO..SU" } } }.toSet()
        require(w.size < 7) { "weekend cannot be every day" }
        return w
    }

    private fun wd(d: LocalDate) = d.dayOfWeek.value - 1

    private fun step(d: LocalDate, days: Long): LocalDate {
        val n = d.plusDays(days)
        require(n.year in 1..9999) { "date out of range" }
        return n
    }

    /** True when [date] is neither a weekend day nor a holiday. */
    fun isBusinessDay(date: String, holidays: List<String> = emptyList(), weekend: List<String> = listOf("SA", "SU")): Boolean {
        val w = weekendSet(weekend)
        val h = holidays.map(::date).toSet()
        val d = date(date)
        return wd(d) !in w && d !in h
    }

    /** The date [n] business days after [date] (before it when n < 0); n = 0 gives date or the next business day; |n| <= 100000. */
    fun addBusinessDays(date: String, n: Int, holidays: List<String> = emptyList(), weekend: List<String> = listOf("SA", "SU")): String {
        require(Math.abs(n.toLong()) <= 100000) { "n must be within +-100000" }
        val w = weekendSet(weekend)
        val h = holidays.map(::date).toSet()
        var d = date(date)
        val ok = { x: LocalDate -> wd(x) !in w && x !in h }
        if (n == 0) {
            while (!ok(d)) d = step(d, 1)
            return d.toString()
        }
        val dir = if (n > 0) 1L else -1L
        var left = Math.abs(n)
        while (left > 0) {
            d = step(d, dir)
            if (ok(d)) left--
        }
        return d.toString()
    }

    /** Business days in [start, end) (start counted, end not); negative when end is before start. */
    fun businessDaysBetween(start: String, end: String, holidays: List<String> = emptyList(), weekend: List<String> = listOf("SA", "SU")): Long {
        val w = weekendSet(weekend)
        val h = holidays.map(::date).toSet()
        var a = date(start)
        var b = date(end)
        var sign = 1L
        if (b < a) { val t = a; a = b; b = t; sign = -1L }
        val days = b.toEpochDay() - a.toEpochDay()
        val full = days / 7
        val rem = days % 7
        var count = full * (7 - w.size)
        for (i in 0 until rem) if (wd(a.plusDays(full * 7 + i)) !in w) count++
        count -= h.count { x -> x >= a && x < b && wd(x) !in w }
        return sign * count
    }
}
