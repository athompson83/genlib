// SPDX-License-Identifier: Apache-2.0
using System.Globalization;
using System.Text.RegularExpressions;

namespace Genlib.Validation;

/// <summary>Next run time of a standard 5-field cron expression, evaluated in UTC with the Vixie day-matching rule.</summary>
public static class CronNext {
    private static readonly Regex Item = new("^(\\*|[0-9]{1,2}(?:-[0-9]{1,2})?)(?:/([0-9]{1,2}))?$", RegexOptions.CultureInvariant);
    private static readonly Regex Iso = new("^([0-9]{4})-([0-9]{2})-([0-9]{2})T([0-9]{2}):([0-9]{2})(?::([0-9]{2})(?:\\.[0-9]+)?)?Z$", RegexOptions.CultureInvariant);

    /// <summary>
    /// First minute strictly after <paramref name="afterIsoUtc"/> (seconds truncated) matching <paramref name="expression"/>,
    /// as <c>YYYY-MM-DDTHH:MM:00Z</c>. Throws <see cref="ArgumentException"/> for invalid input and
    /// <see cref="InvalidOperationException"/> when nothing matches within 5 years.
    /// </summary>
    public static string NextRun(string expression, string afterIsoUtc) {
        ArgumentNullException.ThrowIfNull(expression);
        string[] f = expression.Trim().Split((char[]?)null, StringSplitOptions.RemoveEmptyEntries);
        if (f.Length != 5) throw new ArgumentException("cron expression must have 5 fields", nameof(expression));
        bool[] minutes = Field(f[0], 0, 59), hours = Field(f[1], 0, 23), dom = Field(f[2], 1, 31), months = Field(f[3], 1, 12), dowRaw = Field(f[4], 0, 7);
        var dow = new bool[7];
        for (int i = 0; i < 7; i++) dow[i] = dowRaw[i] || (i == 0 && dowRaw[7]);
        bool either = !f[2].StartsWith('*') && !f[4].StartsWith('*');

        DateTime after = ParseUtc(afterIsoUtc);
        DateTime start = new DateTime(after.Year, after.Month, after.Day, after.Hour, after.Minute, 0, DateTimeKind.Utc).AddMinutes(1);
        DateTime limit = start.AddYears(5);
        for (DateTime day = start.Date; day <= limit; day = day.AddDays(1)) {
            if (!months[day.Month]) continue;
            bool d = dom[day.Day], w = dow[(int)day.DayOfWeek];
            if (either ? !(d || w) : !(d && w)) continue;
            bool first = day == start.Date;
            for (int h = first ? start.Hour : 0; h < 24; h++) {
                if (!hours[h]) continue;
                for (int m = first && h == start.Hour ? start.Minute : 0; m < 60; m++) {
                    if (minutes[m]) return day.AddHours(h).AddMinutes(m).ToString("yyyy-MM-dd'T'HH:mm':00Z'", CultureInfo.InvariantCulture);
                }
            }
        }
        throw new InvalidOperationException("no matching time within 5 years");
    }

    private static bool[] Field(string text, int min, int max) {
        var allowed = new bool[max + 1];
        foreach (string part in text.Split(',')) {
            Match m = Item.Match(part);
            if (!m.Success) throw new ArgumentException($"invalid cron field item '{part}'");
            int lo = min, hi = max, step = 1;
            if (m.Groups[1].Value != "*") {
                string[] bounds = m.Groups[1].Value.Split('-');
                lo = int.Parse(bounds[0], CultureInfo.InvariantCulture);
                hi = bounds.Length == 2 ? int.Parse(bounds[1], CultureInfo.InvariantCulture) : m.Groups[2].Success ? max : lo;
            }
            if (m.Groups[2].Success) step = int.Parse(m.Groups[2].Value, CultureInfo.InvariantCulture);
            if (lo < min || hi > max || lo > hi) throw new ArgumentException($"cron value out of range in '{part}' (allowed {min}-{max})");
            if (step < 1) throw new ArgumentException($"cron step must be >= 1 in '{part}'");
            for (int v = lo; v <= hi; v += step) allowed[v] = true;
        }
        return allowed;
    }

    private static DateTime ParseUtc(string text) {
        ArgumentNullException.ThrowIfNull(text);
        Match m = Iso.Match(text);
        if (!m.Success) throw new ArgumentException("after must be an ISO 8601 UTC timestamp like 2026-10-10T12:00:00Z", nameof(text));
        int[] n = Enumerable.Range(1, 6).Select(i => m.Groups[i].Success ? int.Parse(m.Groups[i].Value, CultureInfo.InvariantCulture) : 0).ToArray();
        try { return new DateTime(n[0], n[1], n[2], n[3], n[4], n[5], DateTimeKind.Utc); }
        catch (ArgumentOutOfRangeException) { throw new ArgumentException("after is not a valid date and time", nameof(text)); }
    }
}
