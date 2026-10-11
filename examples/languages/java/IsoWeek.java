// SPDX-License-Identifier: Apache-2.0

import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * ISO 8601 week dates (weeks start Monday; week 1 holds the year's first Thursday) in the proleptic Gregorian calendar,
 * years 1..9999, computed with plain day arithmetic. Invalid dates or weeks throw IllegalArgumentException.
 */
public final class IsoWeek {
    private IsoWeek() {}

    /** An ISO week date: week-numbering year, week 1..53 and weekday 1 (Monday) .. 7 (Sunday). */
    public record WeekDate(int weekYear, int week, int weekday) {}

    /** A calendar date. */
    public record Date(int year, int month, int day) {}

    private static final Pattern FORMAT = Pattern.compile("([0-9]{4})-?W([0-9]{2})(?:-?([1-7]))?");

    /** ISO week date of a calendar date. */
    public static WeekDate isoWeek(int year, int month, int day) {
        long days = toDays(year, month, day);
        int wd = weekday(days);
        Date thursday = fromDays(days + 4 - wd);
        long ordinal = days + 4 - wd - toDaysUnchecked(thursday.year(), 1, 1);
        return new WeekDate(thursday.year(), (int) (ordinal / 7) + 1, wd);
    }

    /** Calendar date of an ISO week date; week must be 1..weeksInYear and weekday 1..7. */
    public static Date fromIsoWeek(int weekYear, int week, int weekday) {
        if (weekYear < 1 || weekYear > 9999 || weekday < 1 || weekday > 7 || week < 1 || week > weeksInYear(weekYear)) {
            throw new IllegalArgumentException("invalid ISO week date");
        }
        long jan4 = toDaysUnchecked(weekYear, 1, 4);
        long days = jan4 - (weekday(jan4) - 1) + (week - 1) * 7L + (weekday - 1);
        Date d = fromDays(days);
        if (d.year() < 1 || d.year() > 9999) throw new IllegalArgumentException("date out of range");
        return d;
    }

    /** Number of ISO weeks (52 or 53) in a week-numbering year. */
    public static int weeksInYear(int year) { return isoWeek(year, 12, 28).week(); }

    /** Formats a calendar date as "YYYY-Www-D". */
    public static String formatIsoWeek(int year, int month, int day) {
        WeekDate w = isoWeek(year, month, day);
        return String.format(java.util.Locale.ROOT, "%04d-W%02d-%d", w.weekYear(), w.week(), w.weekday());
    }

    /** Parses "YYYY-Www-D", "YYYYWwwD" or "YYYY-Www" (weekday 1) to a calendar date. */
    public static Date parseIsoWeek(String s) {
        Matcher m = FORMAT.matcher(s);
        if (!m.matches()) throw new IllegalArgumentException("not an ISO week date");
        int wd = m.group(3) == null ? 1 : Integer.parseInt(m.group(3));
        return fromIsoWeek(Integer.parseInt(m.group(1)), Integer.parseInt(m.group(2)), wd);
    }

    private static boolean leap(int y) { return (y % 4 == 0 && y % 100 != 0) || y % 400 == 0; }

    private static int daysInMonth(int y, int m) {
        return switch (m) { case 2 -> leap(y) ? 29 : 28; case 4, 6, 9, 11 -> 30; default -> 31; };
    }

    private static long toDays(int y, int m, int d) {
        if (y < 1 || y > 9999) throw new IllegalArgumentException("year out of range");
        if (m < 1 || m > 12) throw new IllegalArgumentException("month must be in 1..12");
        if (d < 1 || d > daysInMonth(y, m)) throw new IllegalArgumentException("day is out of range for month");
        return toDaysUnchecked(y, m, d);
    }

    // Days since 1970-01-01 (civil-from-days algorithm by H. Hinnant, public domain description).
    private static long toDaysUnchecked(int y, int m, int d) {
        long yy = m <= 2 ? y - 1 : y;
        long era = Math.floorDiv(yy, 400);
        long yoe = yy - era * 400;
        long doy = (153L * (m + (m > 2 ? -3 : 9)) + 2) / 5 + d - 1;
        long doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
        return era * 146097 + doe - 719468;
    }

    private static Date fromDays(long z) {
        z += 719468;
        long era = Math.floorDiv(z, 146097);
        long doe = z - era * 146097;
        long yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365;
        long doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
        long mp = (5 * doy + 2) / 153;
        int d = (int) (doy - (153 * mp + 2) / 5 + 1);
        int m = (int) (mp < 10 ? mp + 3 : mp - 9);
        long y = yoe + era * 400 + (m <= 2 ? 1 : 0);
        return new Date((int) y, m, d);
    }

    private static int weekday(long days) { return Math.floorMod(days + 3, 7) + 1; }
}
