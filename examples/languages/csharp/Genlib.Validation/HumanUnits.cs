// SPDX-License-Identifier: Apache-2.0
using System.Globalization;
using System.Numerics;
using System.Text.RegularExpressions;

namespace Genlib.Validation;

/// <summary>Human-readable byte sizes, durations and relative times using exact integer rounding (half up).</summary>
public static class HumanUnits {
    private static readonly string[] SiUnits = { "B", "kB", "MB", "GB", "TB", "PB", "EB" };
    private static readonly string[] IecUnits = { "B", "KiB", "MiB", "GiB", "TiB", "PiB", "EiB" };
    private static readonly Regex BytesPattern = new(@"\A\s*([0-9]+)(?:\.([0-9]+))?\s*([A-Za-z]*)\s*\z", RegexOptions.CultureInvariant);
    private static readonly Dictionary<string, BigInteger> ByteUnits = new() {
        [""] = 1, ["b"] = 1, ["kb"] = BigInteger.Pow(1000, 1), ["mb"] = BigInteger.Pow(1000, 2), ["gb"] = BigInteger.Pow(1000, 3),
        ["tb"] = BigInteger.Pow(1000, 4), ["pb"] = BigInteger.Pow(1000, 5), ["eb"] = BigInteger.Pow(1000, 6),
        ["kib"] = BigInteger.Pow(1024, 1), ["mib"] = BigInteger.Pow(1024, 2), ["gib"] = BigInteger.Pow(1024, 3),
        ["tib"] = BigInteger.Pow(1024, 4), ["pib"] = BigInteger.Pow(1024, 5), ["eib"] = BigInteger.Pow(1024, 6),
    };

    private static BigInteger RoundDiv(BigInteger n, BigInteger d) => (2 * n + d) / (2 * d);
    private static long RoundDiv(long n, long d) => (2 * n + d) / (2 * d);

    /// <summary>
    /// Formats a byte count with SI ("si": kB, MB...) or IEC ("iec": KiB, MiB...) units and 0..3 decimals, trailing zeros removed:
    /// 1536 iec -> "1.5 KiB", 999950 si -> "1 MB".
    /// </summary>
    public static string FormatBytes(long n, string @base = "si", int decimals = 1) {
        if (n < 0) throw new ArgumentOutOfRangeException(nameof(n), "must not be negative");
        if (decimals is < 0 or > 3) throw new ArgumentOutOfRangeException(nameof(decimals), "must be 0..3");
        string[] units = @base switch { "si" => SiUnits, "iec" => IecUnits, _ => throw new ArgumentException("base must be si or iec", nameof(@base)) };
        BigInteger step = @base == "si" ? 1000 : 1024;
        if (n < step) return n.ToString(CultureInfo.InvariantCulture) + " B";
        int i = 1;
        while (i < 6 && n >= BigInteger.Pow(step, i + 1)) i++;
        BigInteger scale = BigInteger.Pow(10, decimals);
        BigInteger v = RoundDiv(n * scale, BigInteger.Pow(step, i));
        if (v >= step * scale && i < 6) { i++; v = RoundDiv(n * scale, BigInteger.Pow(step, i)); }
        BigInteger whole = BigInteger.DivRem(v, scale, out BigInteger frac);
        string s = whole.ToString(CultureInfo.InvariantCulture);
        if (decimals > 0) {
            string f = frac.ToString(CultureInfo.InvariantCulture).PadLeft(decimals, '0').TrimEnd('0');
            if (f.Length > 0) s += "." + f;
        }
        return s + " " + units[i];
    }

    /// <summary>
    /// Parses "1.5 GiB", "2.25MB", " 10 b " or "512" to bytes (kb..eb = powers of 1000, kib..eib = powers of 1024, case-insensitive),
    /// rounding half up. Throws <see cref="FormatException"/> for signs, exponents, unknown units or values above 2^63-1.
    /// </summary>
    public static long ParseBytes(string text) {
        var m = BytesPattern.Match(text);
        if (!m.Success) throw new FormatException("invalid byte size: " + text);
        if (!ByteUnits.TryGetValue(m.Groups[3].Value.ToLowerInvariant(), out var mult)) throw new FormatException("unknown byte unit: " + m.Groups[3].Value);
        string frac = m.Groups[2].Value;
        BigInteger num = BigInteger.Parse(m.Groups[1].Value + frac, CultureInfo.InvariantCulture);
        BigInteger r = RoundDiv(num * mult, BigInteger.Pow(10, frac.Length));
        if (r > long.MaxValue) throw new FormatException("byte size exceeds 2^63-1");
        return (long)r;
    }

    /// <summary>Below one second "850ms"; otherwise the two largest non-zero units of d, h, m, s ("1h 2m", "1d 1h", "45s").</summary>
    public static string FormatDuration(long ms) {
        if (ms < 0) throw new ArgumentOutOfRangeException(nameof(ms), "must not be negative");
        if (ms < 1000) return ms.ToString(CultureInfo.InvariantCulture) + "ms";
        long s = ms / 1000;
        var parts = new List<string>();
        foreach (var (name, size) in new[] { ("d", 86400L), ("h", 3600L), ("m", 60L), ("s", 1L) }) {
            long q = s / size;
            s %= size;
            if (q > 0) parts.Add(q.ToString(CultureInfo.InvariantCulture) + name);
        }
        return string.Join(" ", parts.Take(2));
    }

    /// <summary>Relative phrase for a delta in seconds (positive = future): "just now", "in 3 minutes", "2 months ago", "in 10 years".</summary>
    public static string RelativeTime(long deltaSeconds) {
        long a = Math.Abs(deltaSeconds);
        string? p;
        if (a < 45) p = null;
        else if (a < 90) p = "a minute";
        else if (a < 45 * 60) p = RoundDiv(a, 60) + " minutes";
        else if (a < 90 * 60) p = "an hour";
        else if (a < 22 * 3600) p = RoundDiv(a, 3600) + " hours";
        else if (a < 36 * 3600) p = "a day";
        else if (a < 26 * 86400) p = RoundDiv(a, 86400) + " days";
        else if (a < 46 * 86400) p = "a month";
        else if (a < 320 * 86400) p = RoundDiv(a, 2629746) + " months";
        else if (a < 548 * 86400) p = "a year";
        else p = RoundDiv(a, 31556952) + " years";
        if (p is null) return "just now";
        return deltaSeconds > 0 ? "in " + p : p + " ago";
    }
}
