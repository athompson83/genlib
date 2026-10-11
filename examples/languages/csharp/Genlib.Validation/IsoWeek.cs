// SPDX-License-Identifier: Apache-2.0
using System.Globalization;
using System.Text.RegularExpressions;

namespace Genlib.Validation;

/// <summary>
/// ISO 8601 week dates (weeks start Monday; week 1 contains the year's first Thursday) on the proleptic Gregorian calendar, years
/// 1..9999, computed with plain day arithmetic. Invalid dates and weeks throw <see cref="ArgumentOutOfRangeException"/>; malformed
/// week strings throw <see cref="FormatException"/>.
/// </summary>
public static class IsoWeek {
    private static readonly Regex Pattern = new(@"\A([0-9]{4})-?W([0-9]{2})(?:-?([1-7]))?\z", RegexOptions.CultureInvariant);

    /// <summary>The ISO (week year, week 1..53, weekday 1=Mon..7=Sun) of a calendar date.</summary>
    public static (int WeekYear, int Week, int Weekday) Of(int year, int month, int day) {
        long n = DayNumber(year, month, day);
        int wd = Weekday(n);
        long thursday = n + (4 - wd);
        var (ty, _, _) = Civil(thursday);
        long jan1 = DayNumber(ty, 1, 1, check: false);
        return (ty, (int)((thursday - jan1) / 7) + 1, wd);
    }

    /// <summary>The number of ISO weeks (52 or 53) in week year <paramref name="year"/>.</summary>
    public static int WeeksInYear(int year) => Of(year, 12, 28).Week;

    /// <summary>The calendar (year, month, day) of an ISO week date; week must be 1..WeeksInYear and weekday 1..7.</summary>
    public static (int Year, int Month, int Day) FromIsoWeek(int weekYear, int week, int weekday) {
        if (weekYear < 1 || weekYear > 9999 || weekday < 1 || weekday > 7 || week < 1 || week > WeeksInYear(weekYear))
            throw new ArgumentOutOfRangeException(nameof(week), "invalid ISO week date");
        long jan4 = DayNumber(weekYear, 1, 4);
        long n = jan4 - (Weekday(jan4) - 1) + (week - 1) * 7L + (weekday - 1);
        var (y, m, d) = Civil(n);
        if (y < 1 || y > 9999) throw new ArgumentOutOfRangeException(nameof(week), "date out of range");
        return (y, m, d);
    }

    /// <summary>Formats a calendar date as an ISO week date "YYYY-Www-D".</summary>
    public static string Format(int year, int month, int day) {
        var (wy, w, wd) = Of(year, month, day);
        return wy.ToString("D4", CultureInfo.InvariantCulture) + "-W" + w.ToString("D2", CultureInfo.InvariantCulture) + "-" + wd.ToString(CultureInfo.InvariantCulture);
    }

    /// <summary>Parses "YYYY-Www-D", "YYYYWwwD" or "YYYY-Www" (weekday 1) into a calendar (year, month, day).</summary>
    public static (int Year, int Month, int Day) Parse(string s) {
        ArgumentNullException.ThrowIfNull(s);
        var m = Pattern.Match(s);
        if (!m.Success) throw new FormatException("not an ISO week date");
        int wy = int.Parse(m.Groups[1].Value, CultureInfo.InvariantCulture);
        int w = int.Parse(m.Groups[2].Value, CultureInfo.InvariantCulture);
        int wd = m.Groups[3].Success ? m.Groups[3].Value[0] - '0' : 1;
        return FromIsoWeek(wy, w, wd);
    }

    private static int DaysInMonth(int y, int m) => m switch {
        2 => (y % 4 == 0 && y % 100 != 0) || y % 400 == 0 ? 29 : 28,
        4 or 6 or 9 or 11 => 30,
        _ => 31,
    };

    // Days since 1970-01-01 (Howard Hinnant's days_from_civil), valid for any proleptic Gregorian year.
    private static long DayNumber(int y, int m, int d, bool check = true) {
        if (check && (y < 1 || y > 9999 || m < 1 || m > 12 || d < 1 || d > DaysInMonth(y, m)))
            throw new ArgumentOutOfRangeException(nameof(d), $"invalid date {y}-{m}-{d}");
        long yy = m <= 2 ? y - 1 : y;
        long era = (yy >= 0 ? yy : yy - 399) / 400;
        long yoe = yy - era * 400;
        long doy = (153 * (m + (m > 2 ? -3 : 9)) + 2) / 5 + d - 1;
        long doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
        return era * 146097 + doe - 719468;
    }

    private static (int Y, int M, int D) Civil(long z) {
        z += 719468;
        long era = (z >= 0 ? z : z - 146096) / 146097;
        long doe = z - era * 146097;
        long yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365;
        long y = yoe + era * 400;
        long doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
        long mp = (5 * doy + 2) / 153;
        long d = doy - (153 * mp + 2) / 5 + 1;
        long m = mp < 10 ? mp + 3 : mp - 9;
        return ((int)(m <= 2 ? y + 1 : y), (int)m, (int)d);
    }

    // 1970-01-01 was a Thursday (ISO weekday 4).
    private static int Weekday(long n) => (int)(((n + 3) % 7 + 7) % 7) + 1;
}
