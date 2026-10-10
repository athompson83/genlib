// SPDX-License-Identifier: Apache-2.0
using System.Globalization;

namespace Genlib.Validation;

/// <summary>How to answer a request carrying a Range header.</summary>
public enum RangeKind {
    /// <summary>No or unusable Range header: respond 200 with the full body.</summary>
    None,
    /// <summary>No satisfiable range: respond 416 with <see cref="RangeResult.ContentRange"/>.</summary>
    Unsatisfiable,
    /// <summary>Respond 206 with the listed inclusive byte ranges.</summary>
    Ranges,
}

/// <summary>Result of <see cref="HttpRange.ParseRange"/>; ranges are inclusive, in header order and not merged.</summary>
public sealed record RangeResult(RangeKind Kind, IReadOnlyList<(long Start, long End)> Ranges, string? ContentRange);

/// <summary>RFC 9110 byte Range requests and Content-Range values with 64-bit sizes.</summary>
public static class HttpRange {
    private const int MaxSpecs = 100;
    private static readonly RangeResult NoneResult = new(RangeKind.None, Array.Empty<(long, long)>(), null);

    /// <summary>
    /// Interprets a Range header for a representation of <paramref name="size"/> bytes. A missing, malformed or non-bytes header
    /// (or more than 100 specs) yields <see cref="RangeKind.None"/>; specs starting at or beyond the end are dropped, ends are
    /// clamped to size-1, and when every spec is dropped the result is <see cref="RangeKind.Unsatisfiable"/>.
    /// </summary>
    public static RangeResult ParseRange(string? header, long size) {
        ArgumentOutOfRangeException.ThrowIfNegative(size);
        if (header is null) return NoneResult;
        int i = 0;
        while (i < header.Length && header[i] is ' ' or '\t') i++;
        int eq = header.IndexOf('=', i);
        if (eq <= i) return NoneResult;
        string unit = header[i..eq], rest = header[(eq + 1)..];
        if (!unit.All(char.IsAsciiLetter) || !unit.Equals("bytes", StringComparison.OrdinalIgnoreCase) || rest.Contains('\n')) return NoneResult;
        string[] specs = rest.Split(',').Select(p => p.Trim(' ', '\t')).ToArray();
        if (specs.Length > MaxSpecs || specs.Any(p => p.Length == 0)) return NoneResult;
        var ranges = new List<(long, long)>();
        foreach (string spec in specs) {
            if (spec[0] == '-') {
                string n = spec[1..];
                if (!IsDigits(n)) return NoneResult;
                long suffix = Saturating(n);
                if (suffix == 0 || size == 0) continue;
                ranges.Add((Math.Max(0, size - suffix), size - 1));
                continue;
            }
            int dash = spec.IndexOf('-');
            if (dash <= 0) return NoneResult;
            string a = spec[..dash], b = spec[(dash + 1)..];
            if (!IsDigits(a) || (b.Length > 0 && !IsDigits(b))) return NoneResult;
            if (b.Length > 0 && CompareDigits(b, a) < 0) return NoneResult;
            long start = Saturating(a);
            if (start >= size) continue;
            ranges.Add((start, b.Length == 0 ? size - 1 : Math.Min(Saturating(b), size - 1)));
        }
        return ranges.Count > 0
            ? new RangeResult(RangeKind.Ranges, ranges, null)
            : new RangeResult(RangeKind.Unsatisfiable, Array.Empty<(long, long)>(), "bytes */" + size.ToString(CultureInfo.InvariantCulture));
    }

    /// <summary>The Content-Range value "bytes start-end/size" for a 206 part.</summary>
    public static string ContentRange(long start, long end, long size) {
        if (start < 0 || end < start || end >= size) throw new ArgumentOutOfRangeException(nameof(start), "need 0 <= start <= end < size");
        return string.Create(CultureInfo.InvariantCulture, $"bytes {start}-{end}/{size}");
    }

    private static bool IsDigits(string s) => s.Length > 0 && s.All(c => c is >= '0' and <= '9');

    private static long Saturating(string digits) {
        long v = 0;
        foreach (char c in digits) {
            if (v > (long.MaxValue - (c - '0')) / 10) return long.MaxValue;
            v = v * 10 + (c - '0');
        }
        return v;
    }

    private static int CompareDigits(string x, string y) {
        x = x.TrimStart('0');
        y = y.TrimStart('0');
        return x.Length != y.Length ? x.Length.CompareTo(y.Length) : string.CompareOrdinal(x, y);
    }
}
