// SPDX-License-Identifier: Apache-2.0
using System.Globalization;
using System.Text.RegularExpressions;

namespace Genlib.Validation;

/// <summary>
/// RFC 5545 recurrence rule expansion in UTC for FREQ (DAILY, WEEKLY, MONTHLY, YEARLY), INTERVAL, COUNT, UNTIL, BYDAY (with
/// ordinals for MONTHLY and YEARLY), BYMONTHDAY and BYMONTH. Matches python-dateutil for every rule it accepts; rejects BYSETPOS,
/// WKST, BYHOUR and every other part. Every occurrence keeps the start's time of day.
/// </summary>
public static class RRule {
    private const int MaxPeriods = 100000;
    private static readonly string[] Weekdays = { "MO", "TU", "WE", "TH", "FR", "SA", "SU" };
    private static readonly Regex Start = new("^([0-9]{4})-([0-9]{2})-([0-9]{2})T([0-9]{2}):([0-9]{2}):([0-9]{2})Z\\z", RegexOptions.CultureInvariant);
    private static readonly Regex Until = new("^([0-9]{4})([0-9]{2})([0-9]{2})T([0-9]{2})([0-9]{2})([0-9]{2})Z\\z", RegexOptions.CultureInvariant);
    private static readonly Regex ByDay = new("^([+-]?[0-9]{1,2})?(MO|TU|WE|TH|FR|SA|SU)\\z", RegexOptions.CultureInvariant);
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
        // dateutil defaults apply only when no day-level filter is given.
        var byDay = r.ByDay;
        var byMonthDay = r.ByMonthDay;
        var byMonth = r.ByMonth;
        if (byDay.Count == 0 && byMonthDay.Count == 0) {
            if (r.Freq == "WEEKLY") byDay = new List<(int, int)> { (0, startWd) };
            else if (r.Freq == "MONTHLY") byMonthDay = new List<int> { s.Day };
            else if (r.Freq == "YEARLY") {
                byMonthDay = new List<int> { s.Day };
                if (byMonth.Count == 0) byMonth = new List<int> { s.Month };
            }
        }
        bool monthScope = r.Freq == "MONTHLY" || (r.Freq == "YEARLY" && r.ByMonth.Count > 0);
        var output = new List<string>();
        for (int k = 0; k < MaxPeriods; k++) {
            long first;
            int length;
            if (r.Freq == "DAILY") {
                first = startDay.DayNumber + (long)k * r.Interval;
                length = 1;
            } else if (r.Freq == "WEEKLY") {
                first = startDay.DayNumber - startWd + 7L * k * r.Interval;
                length = 7;
            } else if (r.Freq == "MONTHLY") {
                long mi = s.Month - 1 + (long)k * r.Interval;
                long y = s.Year + mi / 12;
                if (y > 9999) break;
                int mo = (int)(mi % 12) + 1;
                first = new DateOnly((int)y, mo, 1).DayNumber;
                length = DateTime.DaysInMonth((int)y, mo);
            } else {
                long y = s.Year + (long)k * r.Interval;
                if (y > 9999) break;
                first = new DateOnly((int)y, 1, 1).DayNumber;
                length = DateTime.IsLeapYear((int)y) ? 366 : 365;
            }
            if (first + length - 1 > DateOnly.MaxValue.DayNumber) break;
            bool stop = false;
            for (int i = 0; i < length && !stop; i++) {
                DateOnly d = DateOnly.FromDayNumber((int)(first + i));
                if (!Matches(d, byDay, byMonthDay, byMonth, monthScope)) continue;
                DateTime c = At(d, time);
                if (c < s) continue;
                if (r.Until is DateTime u && c > u) { stop = true; break; }
                output.Add(c.ToString("yyyy'-'MM'-'dd'T'HH':'mm':'ss'Z'", CultureInfo.InvariantCulture));
                if ((r.Count is int count && output.Count >= count) || output.Count >= limit) stop = true;
            }
            if (stop) break;
            if (r.Until is DateTime until && At(DateOnly.FromDayNumber((int)first), time) > until) break;
        }
        return output;
    }

    private static bool Matches(DateOnly d, List<(int N, int Wd)> byDay, List<int> byMonthDay, List<int> byMonth, bool monthScope) {
        if (byMonth.Count > 0 && !byMonth.Contains(d.Month)) return false;
        int nd = DateTime.DaysInMonth(d.Year, d.Month);
        if (byMonthDay.Count > 0 && !byMonthDay.Exists(x => d.Day == (x > 0 ? x : nd + x + 1))) return false;
        if (byDay.Count == 0) return true;
        int wd = Weekday(d);
        foreach (var (n, w) in byDay) {
            if (w != wd) continue;
            if (n == 0) return true;
            // Ordinal among this weekday's days in the month, or in the year (YEARLY without BYMONTH).
            int pos = monthScope ? d.Day : d.DayOfYear;
            int len = monthScope ? nd : (DateTime.IsLeapYear(d.Year) ? 366 : 365);
            if (n > 0 ? (pos - 1) / 7 + 1 == n : (len - pos) / 7 + 1 == -n) return true;
        }
        return false;
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
            int ordinalLimit = freq == "MONTHLY" || (freq == "YEARLY" && parts.ContainsKey("BYMONTH")) ? 5 : 53;
            bool plain = false, ordinal = false;
            foreach (string d in bd.Split(',')) {
                var m = ByDay.Match(d);
                if (!m.Success) throw new FormatException("invalid BYDAY value: '" + d + "'");
                int n = 0;
                if (m.Groups[1].Success) {
                    n = int.Parse(m.Groups[1].Value, NumberStyles.AllowLeadingSign, CultureInfo.InvariantCulture);
                    if (freq is not ("MONTHLY" or "YEARLY") || n == 0 || Math.Abs(n) > ordinalLimit)
                        throw new FormatException("invalid BYDAY ordinal: '" + d + "'");
                    ordinal = true;
                } else plain = true;
                byDay.Add((n, Array.IndexOf(Weekdays, m.Groups[2].Value)));
            }
            if (plain && ordinal) throw new FormatException("BYDAY cannot mix plain and ordinal weekdays");
        }
        var byMonthDay = new List<int>();
        if (parts.TryGetValue("BYMONTHDAY", out string? bmd)) byMonthDay.AddRange(bmd.Split(',').Select(x => Num(x, 1, 31, true)));
        var byMonth = new List<int>();
        if (parts.TryGetValue("BYMONTH", out string? bm)) byMonth.AddRange(bm.Split(',').Select(x => Num(x, 1, 12, false)));
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
