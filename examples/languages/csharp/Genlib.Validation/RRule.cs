// SPDX-License-Identifier: Apache-2.0
using System.Globalization;
using System.Text.RegularExpressions;

namespace Genlib.Validation;

/// <summary>
/// RFC 5545 recurrence rule expansion for a UTC subset: FREQ (DAILY, WEEKLY, MONTHLY, YEARLY), INTERVAL, COUNT, UNTIL, BYDAY,
/// BYMONTHDAY (MONTHLY) and BYMONTH (YEARLY). Every occurrence keeps the start's time of day.
/// </summary>
public static class RRule {
    private const int MaxPeriods = 100000;
    private static readonly string[] Weekdays = { "MO", "TU", "WE", "TH", "FR", "SA", "SU" };
    private static readonly Regex Start = new("^([0-9]{4})-([0-9]{2})-([0-9]{2})T([0-9]{2}):([0-9]{2}):([0-9]{2})Z\\z", RegexOptions.CultureInvariant);
    private static readonly Regex Until = new("^([0-9]{4})([0-9]{2})([0-9]{2})T([0-9]{2})([0-9]{2})([0-9]{2})Z\\z", RegexOptions.CultureInvariant);
    private static readonly Regex ByDay = new("^([+-]?[1-5])?(MO|TU|WE|TH|FR|SA|SU)\\z", RegexOptions.CultureInvariant);
    private static readonly Regex Number = new("^[+-]?[0-9]{1,4}\\z", RegexOptions.CultureInvariant);
    private static readonly HashSet<string> Allowed = new() { "FREQ", "INTERVAL", "COUNT", "UNTIL", "BYDAY", "BYMONTHDAY", "BYMONTH" };

    private sealed record Rule(string Freq, int Interval, int? Count, DateTime? Until, List<(int N, int Wd)> ByDay, List<int> ByMonthDay, List<int> ByMonth);

    /// <summary>
    /// Expands <paramref name="rule"/> from <paramref name="dtstartIsoUtc"/> ("YYYY-MM-DDTHH:MM:SSZ") into at most
    /// <paramref name="limit"/> (1..1000) occurrences in the same format. Candidates before the start are skipped; expansion stops
    /// after UNTIL (inclusive), COUNT, the limit or 100000 periods. Throws <see cref="FormatException"/> for a malformed start or
    /// an unsupported or invalid rule and <see cref="ArgumentOutOfRangeException"/> for a bad limit.
    /// </summary>
    public static IReadOnlyList<string> ExpandRRule(string dtstartIsoUtc, string rule, int limit = 50) {
        ArgumentNullException.ThrowIfNull(dtstartIsoUtc);
        ArgumentNullException.ThrowIfNull(rule);
        if (limit is < 1 or > 1000) throw new ArgumentOutOfRangeException(nameof(limit), "limit must be 1..1000");
        DateTime s = ParseDate(Start, dtstartIsoUtc, "DTSTART must be YYYY-MM-DDTHH:MM:SSZ");
        Rule r = ParseRule(rule);
        TimeSpan time = s.TimeOfDay;
        DateOnly startDay = DateOnly.FromDateTime(s);
        int startWd = Weekday(startDay);
        var output = new List<string>();
        for (int k = 0; k < MaxPeriods; k++) {
            var candidates = new List<DateTime>();
            if (r.Freq == "DAILY") {
                long day = startDay.DayNumber + (long)k * r.Interval;
                if (day > DateOnly.MaxValue.DayNumber) break;
                candidates.Add(At(DateOnly.FromDayNumber((int)day), time));
            } else if (r.Freq == "WEEKLY") {
                long monday = startDay.DayNumber - startWd + 7L * k * r.Interval;
                var days = r.ByDay.Count > 0 ? r.ByDay.Select(x => x.Wd).Distinct().OrderBy(x => x).ToList() : new List<int> { startWd };
                if (monday + 6 > DateOnly.MaxValue.DayNumber) break;
                foreach (int wd in days) candidates.Add(At(DateOnly.FromDayNumber((int)(monday + wd)), time));
            } else if (r.Freq == "MONTHLY") {
                long mi = s.Month - 1 + (long)k * r.Interval;
                long y = s.Year + mi / 12;
                if (y > 9999) break;
                int mo = (int)(mi % 12) + 1, nd = DateTime.DaysInMonth((int)y, mo);
                var days = new SortedSet<int>();
                if (r.ByDay.Count > 0) {
                    foreach (var (n, wd) in r.ByDay) {
                        var ds = Enumerable.Range(1, nd).Where(d => Weekday(new DateOnly((int)y, mo, d)) == wd).ToList();
                        if (n == 0) days.UnionWith(ds);
                        else if (Math.Abs(n) <= ds.Count) days.Add(n > 0 ? ds[n - 1] : ds[ds.Count + n]);
                    }
                } else if (r.ByMonthDay.Count > 0) {
                    foreach (int md in r.ByMonthDay) {
                        int d = md > 0 ? md : nd + md + 1;
                        if (d >= 1 && d <= nd) days.Add(d);
                    }
                } else if (s.Day <= nd) days.Add(s.Day);
                foreach (int d in days) candidates.Add(At(new DateOnly((int)y, mo, d), time));
            } else {
                long y = s.Year + (long)k * r.Interval;
                if (y > 9999) break;
                foreach (int mo in r.ByMonth.Count > 0 ? r.ByMonth : new List<int> { s.Month })
                    if (s.Day <= DateTime.DaysInMonth((int)y, mo)) candidates.Add(At(new DateOnly((int)y, mo, s.Day), time));
            }
            candidates.Sort();
            bool stop = false;
            foreach (DateTime c in candidates) {
                if (c < s) continue;
                if (r.Until is DateTime u && c > u) { stop = true; break; }
                output.Add(c.ToString("yyyy'-'MM'-'dd'T'HH':'mm':'ss'Z'", CultureInfo.InvariantCulture));
                if ((r.Count is int count && output.Count >= count) || output.Count >= limit) { stop = true; break; }
            }
            if (stop) break;
            if (r.Until is DateTime until && (candidates.Count > 0 ? candidates.Min() : s) > until) break;
        }
        return output;
    }

    private static Rule ParseRule(string rule) {
        var parts = new Dictionary<string, string>();
        foreach (string p in rule.Split(';')) {
            int eq = p.IndexOf('=');
            if (eq < 0) throw new FormatException("malformed rule part: '" + p + "'");
            string key = p[..eq];
            if (!parts.TryAdd(key, p[(eq + 1)..])) throw new FormatException("duplicate rule part: " + key);
        }
        foreach (string key in parts.Keys) if (!Allowed.Contains(key)) throw new FormatException("unsupported rule part: " + key);
        if (!parts.TryGetValue("FREQ", out string? freq)) throw new FormatException("FREQ is required");
        if (freq is not ("DAILY" or "WEEKLY" or "MONTHLY" or "YEARLY")) throw new FormatException("unsupported FREQ: " + freq);
        if (parts.ContainsKey("COUNT") && parts.ContainsKey("UNTIL")) throw new FormatException("COUNT and UNTIL cannot both be set");
        int interval = parts.TryGetValue("INTERVAL", out string? iv) ? Num(iv, 1, 9999, false) : 1;
        int? count = parts.TryGetValue("COUNT", out string? cv) ? Num(cv, 1, 9999, false) : null;
        DateTime? until = parts.TryGetValue("UNTIL", out string? uv) ? ParseDate(Until, uv, "UNTIL must be YYYYMMDDTHHMMSSZ") : null;
        var byDay = new List<(int, int)>();
        if (parts.TryGetValue("BYDAY", out string? bd)) {
            if (freq is "DAILY" or "YEARLY") throw new FormatException("BYDAY is only supported with WEEKLY or MONTHLY");
            foreach (string d in bd.Split(',')) {
                var m = ByDay.Match(d);
                if (!m.Success) throw new FormatException("invalid BYDAY value: '" + d + "'");
                int n = m.Groups[1].Success ? int.Parse(m.Groups[1].Value, NumberStyles.AllowLeadingSign, CultureInfo.InvariantCulture) : 0;
                if (n != 0 && freq != "MONTHLY") throw new FormatException("BYDAY ordinals are only supported with MONTHLY");
                byDay.Add((n, Array.IndexOf(Weekdays, m.Groups[2].Value)));
            }
        }
        var byMonthDay = new List<int>();
        if (parts.TryGetValue("BYMONTHDAY", out string? bmd)) {
            if (freq != "MONTHLY") throw new FormatException("BYMONTHDAY is only supported with MONTHLY");
            if (byDay.Count > 0) throw new FormatException("BYDAY and BYMONTHDAY cannot be combined");
            byMonthDay.AddRange(bmd.Split(',').Select(x => Num(x, 1, 31, true)));
        }
        var byMonth = new List<int>();
        if (parts.TryGetValue("BYMONTH", out string? bm)) {
            if (freq != "YEARLY") throw new FormatException("BYMONTH is only supported with YEARLY");
            byMonth.AddRange(bm.Split(',').Select(x => Num(x, 1, 12, false)));
        }
        return new Rule(freq, interval, count, until, byDay, byMonthDay, byMonth);
    }

    private static int Num(string s, int lo, int hi, bool signed) {
        if (!Number.IsMatch(s) || (!signed && s[0] == '-')) throw new FormatException("invalid rule number: '" + s + "'");
        int v = int.Parse(s, NumberStyles.AllowLeadingSign, CultureInfo.InvariantCulture);
        if (Math.Abs(v) < lo || Math.Abs(v) > hi) throw new FormatException("rule number out of range: '" + s + "'");
        return v;
    }

    private static DateTime ParseDate(Regex pattern, string text, string message) {
        var m = pattern.Match(text);
        if (!m.Success) throw new FormatException(message);
        int G(int i) => int.Parse(m.Groups[i].Value, CultureInfo.InvariantCulture);
        int y = G(1), mo = G(2), d = G(3), h = G(4), mi = G(5), sec = G(6);
        if (y < 1 || mo < 1 || mo > 12 || d < 1 || d > DateTime.DaysInMonth(y, mo) || h > 23 || mi > 59 || sec > 59) throw new FormatException(message);
        return new DateTime(y, mo, d, h, mi, sec, DateTimeKind.Utc);
    }

    private static DateTime At(DateOnly day, TimeSpan time) => day.ToDateTime(TimeOnly.MinValue, DateTimeKind.Utc) + time;

    private static int Weekday(DateOnly d) => ((int)d.DayOfWeek + 6) % 7;
}
