// SPDX-License-Identifier: Apache-2.0
using System.Globalization;
using System.Text;
using System.Text.RegularExpressions;

namespace Genlib.Validation;

/// <summary>The components of a parsed ISO 8601 duration; seconds and their fraction are stored as milliseconds.</summary>
public readonly record struct DurationParts(long Years = 0, long Months = 0, long Weeks = 0, long Days = 0, long Hours = 0, long Minutes = 0, long Milliseconds = 0);

/// <summary>ISO 8601 durations (<c>P1Y2M3DT4H5M6.5S</c>, <c>P2W</c>): parse, exact length and canonical formatting.</summary>
public static class IsoDuration {
    private static readonly Regex Pattern = new(
        "^P(?:([0-9]+)Y)?(?:([0-9]+)M)?(?:([0-9]+)W)?(?:([0-9]+)D)?(?:T(?:([0-9]+)H)?(?:([0-9]+)M)?(?:([0-9]+)(?:\\.([0-9]{1,3}))?S)?)?\\z",
        RegexOptions.CultureInvariant);

    /// <summary>Parses an uppercase ISO 8601 duration; throws <see cref="FormatException"/> for anything outside the grammar.</summary>
    public static DurationParts ParseDuration(string s) {
        ArgumentNullException.ThrowIfNull(s);
        var m = Pattern.Match(s);
        if (!m.Success || s.EndsWith('T') || Enumerable.Range(1, 7).All(g => !m.Groups[g].Success)) throw new FormatException("invalid ISO 8601 duration");
        long N(int g) {
            if (!m.Groups[g].Success) return 0;
            if (!long.TryParse(m.Groups[g].Value, NumberStyles.None, CultureInfo.InvariantCulture, out long v)) throw new FormatException("duration component too large");
            return v;
        }
        long seconds = N(7);
        if (seconds > long.MaxValue / 1000 - 1) throw new FormatException("duration seconds too large");
        long frac = m.Groups[8].Success ? long.Parse(m.Groups[8].Value.PadRight(3, '0'), CultureInfo.InvariantCulture) : 0;
        return new DurationParts(N(1), N(2), N(3), N(4), N(5), N(6), seconds * 1000 + frac);
    }

    /// <summary>
    /// The exact length in milliseconds (a week is 7 days, a day 24 hours). Throws <see cref="ArgumentException"/> when years or
    /// months are set (their length depends on the calendar) and <see cref="ArgumentOutOfRangeException"/> on overflow.
    /// </summary>
    public static long DurationMilliseconds(DurationParts d) {
        if (d.Years != 0 || d.Months != 0) throw new ArgumentException("years and months have no exact length", nameof(d));
        try {
            return checked(((((d.Weeks * 7 + d.Days) * 24 + d.Hours) * 60 + d.Minutes) * 60000) + d.Milliseconds);
        } catch (OverflowException) {
            throw new ArgumentOutOfRangeException(nameof(d), "duration exceeds 64-bit milliseconds");
        }
    }

    /// <summary>Formats non-negative milliseconds as days, hours, minutes and seconds ("PT0S" for zero).</summary>
    public static string FormatDuration(long milliseconds) {
        if (milliseconds < 0) throw new ArgumentOutOfRangeException(nameof(milliseconds), "milliseconds must be >= 0");
        long d = milliseconds / 86400000, h = milliseconds % 86400000 / 3600000, mi = milliseconds % 3600000 / 60000;
        long s = milliseconds % 60000 / 1000, f = milliseconds % 1000;
        var sb = new StringBuilder("P");
        if (d > 0) sb.Append(d.ToString(CultureInfo.InvariantCulture)).Append('D');
        var t = new StringBuilder();
        if (h > 0) t.Append(h.ToString(CultureInfo.InvariantCulture)).Append('H');
        if (mi > 0) t.Append(mi.ToString(CultureInfo.InvariantCulture)).Append('M');
        if (s > 0 || f > 0) {
            t.Append(s.ToString(CultureInfo.InvariantCulture));
            if (f > 0) t.Append('.').Append(f.ToString("000", CultureInfo.InvariantCulture).TrimEnd('0'));
            t.Append('S');
        }
        if (t.Length > 0) sb.Append('T').Append(t);
        return sb.Length == 1 ? "PT0S" : sb.ToString();
    }
}
