// SPDX-License-Identifier: Apache-2.0
using System.Globalization;

namespace Genlib.Validation;

/// <summary>
/// Business days over ISO dates ("YYYY-MM-DD", proleptic Gregorian) with configurable holidays and weekend days ("MO".."SU",
/// default Saturday and Sunday; a null weekend means the default, an empty one means no weekend). Throws
/// <see cref="FormatException"/> for malformed or impossible dates and <see cref="ArgumentException"/> for bad weekends or counts.
/// </summary>
public static class BusinessDays {
    private static readonly string[] Weekdays = { "MO", "TU", "WE", "TH", "FR", "SA", "SU" };
    private static readonly string[] DefaultWeekend = { "SA", "SU" };

    private static DateOnly ParseDate(string s) {
        if (s is null || s.Length != 10 || s[4] != '-' || s[7] != '-'
            || !s.Where((c, i) => i != 4 && i != 7).All(c => c is >= '0' and <= '9'))
            throw new FormatException("date must be YYYY-MM-DD");
        if (!DateOnly.TryParseExact(s, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var d))
            throw new FormatException("invalid date: " + s);
        return d;
    }

    private static int Weekday(DateOnly d) => ((int)d.DayOfWeek + 6) % 7; // Monday = 0

    private static (HashSet<DateOnly> Holidays, HashSet<int> Weekend) Config(IEnumerable<string>? holidays, IEnumerable<string>? weekend) {
        var w = new HashSet<int>();
        foreach (var x in weekend ?? DefaultWeekend) {
            int i = Array.IndexOf(Weekdays, x);
            if (i < 0) throw new ArgumentException("weekend days are MO..SU", nameof(weekend));
            w.Add(i);
        }
        if (w.Count == 7) throw new ArgumentException("weekend cannot be every day", nameof(weekend));
        var h = new HashSet<DateOnly>();
        foreach (var x in holidays ?? Array.Empty<string>()) h.Add(ParseDate(x));
        return (h, w);
    }

    /// <summary>True when <paramref name="date"/> is neither a weekend day nor a holiday.</summary>
    public static bool IsBusinessDay(string date, IEnumerable<string>? holidays = null, IEnumerable<string>? weekend = null) {
        var (h, w) = Config(holidays, weekend);
        var d = ParseDate(date);
        return !w.Contains(Weekday(d)) && !h.Contains(d);
    }

    /// <summary>
    /// The date <paramref name="n"/> business days after <paramref name="date"/> (before it when n &lt; 0, |n| &lt;= 100000). n == 0
    /// returns the date itself when it is a business day, otherwise the next business day.
    /// </summary>
    public static string AddBusinessDays(string date, int n, IEnumerable<string>? holidays = null, IEnumerable<string>? weekend = null) {
        if (n < -100000 || n > 100000) throw new ArgumentOutOfRangeException(nameof(n), "n must be within ±100000");
        var (h, w) = Config(holidays, weekend);
        var d = ParseDate(date);
        bool Ok(DateOnly x) => !w.Contains(Weekday(x)) && !h.Contains(x);
        if (n == 0) {
            while (!Ok(d)) d = d.AddDays(1);
        } else {
            int step = n > 0 ? 1 : -1, left = Math.Abs(n);
            while (left > 0) {
                d = d.AddDays(step);
                if (Ok(d)) left--;
            }
        }
        return d.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture);
    }

    /// <summary>Business days in [start, end) (start counted, end not); negative when end is before start. O(1) week arithmetic plus holidays.</summary>
    public static int BusinessDaysBetween(string start, string end, IEnumerable<string>? holidays = null, IEnumerable<string>? weekend = null) {
        var (h, w) = Config(holidays, weekend);
        DateOnly a = ParseDate(start), b = ParseDate(end);
        int sign = 1;
        if (b < a) { (a, b) = (b, a); sign = -1; }
        int days = b.DayNumber - a.DayNumber;
        int full = days / 7, rem = days % 7;
        int count = full * (7 - w.Count);
        for (int i = 0; i < rem; i++) if (!w.Contains(Weekday(a.AddDays(full * 7 + i)))) count++;
        count -= h.Count(x => a <= x && x < b && !w.Contains(Weekday(x)));
        return sign * count;
    }
}
