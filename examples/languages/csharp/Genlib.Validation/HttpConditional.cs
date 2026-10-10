// SPDX-License-Identifier: Apache-2.0
using System.Globalization;
using System.Text.RegularExpressions;

namespace Genlib.Validation;

/// <summary>A parsed If-Match/If-None-Match value: the wildcard "*" or a list of valid entity tags.</summary>
public sealed record EntityTags(bool IsWildcard, IReadOnlyList<string> Tags);

/// <summary>Request facts for <see cref="HttpConditional.EvaluateConditional"/>; null means "not sent" or "unknown".</summary>
public sealed record ConditionalRequest {
    /// <summary>Request method, for example GET, HEAD or PUT.</summary>
    public required string Method { get; init; }
    /// <summary>The current representation's entity tag, for example "\"v2\"" or "W/\"v2\"".</summary>
    public string? Etag { get; init; }
    /// <summary>The current representation's last modification time in unix seconds.</summary>
    public long? LastModified { get; init; }
    /// <summary>If-Match header value.</summary>
    public string? IfMatch { get; init; }
    /// <summary>If-None-Match header value.</summary>
    public string? IfNoneMatch { get; init; }
    /// <summary>If-Modified-Since header value (IMF-fixdate).</summary>
    public string? IfModifiedSince { get; init; }
    /// <summary>If-Unmodified-Since header value (IMF-fixdate).</summary>
    public string? IfUnmodifiedSince { get; init; }
}

/// <summary>Entity tags, IMF-fixdate HTTP dates and RFC 9110 section 13 conditional request evaluation.</summary>
public static class HttpConditional {
    private static readonly Regex EntityTag = new("^(?:W/)?\"[\\x21\\x23-\\x7e\\x80-\\xff]*\"\\z", RegexOptions.CultureInvariant);
    private static readonly string[] Days = { "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun" };
    private static readonly string[] Months = { "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec" };
    private static readonly Regex FixDate = new(
        "^(Mon|Tue|Wed|Thu|Fri|Sat|Sun), ([0-9]{2}) (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) ([0-9]{4}) ([0-9]{2}):([0-9]{2}):([0-9]{2}) GMT\\z",
        RegexOptions.CultureInvariant);

    /// <summary>Parses If-Match/If-None-Match: "*" after trimming, or the valid entity tags among comma-separated items.</summary>
    public static EntityTags ParseEtags(string header) {
        ArgumentNullException.ThrowIfNull(header);
        string h = header.Trim(' ', '\t');
        if (h == "*") return new EntityTags(true, Array.Empty<string>());
        return new EntityTags(false, h.Split(',').Select(p => p.Trim(' ', '\t')).Where(p => EntityTag.IsMatch(p)).ToList());
    }

    /// <summary>Strong comparison: neither tag is weak and both are identical.</summary>
    public static bool StrongMatch(string a, string b) => !a.StartsWith("W/", StringComparison.Ordinal) && !b.StartsWith("W/", StringComparison.Ordinal) && a == b;

    /// <summary>Weak comparison: identical after removing a leading "W/".</summary>
    public static bool WeakMatch(string a, string b) => Opaque(a) == Opaque(b);

    /// <summary>
    /// Returns 200, 304 or 412 following RFC 9110 13.2.2: If-Match, else If-Unmodified-Since; then If-None-Match, else
    /// If-Modified-Since (GET/HEAD only). Dates that are not an exact IMF-fixdate are ignored.
    /// </summary>
    public static int EvaluateConditional(ConditionalRequest request) {
        ArgumentNullException.ThrowIfNull(request);
        bool safe = request.Method is "GET" or "HEAD";
        string? etag = request.Etag;
        if (request.IfMatch is not null) {
            var tags = ParseEtags(request.IfMatch);
            if (tags.IsWildcard) {
                if (etag is null) return 412;
            } else if (etag is null || !tags.Tags.Any(t => StrongMatch(t, etag))) return 412;
        } else if (request.IfUnmodifiedSince is not null && request.LastModified is long lm) {
            long? d = ParseHttpDate(request.IfUnmodifiedSince);
            if (d is not null && lm > d) return 412;
        }
        if (request.IfNoneMatch is not null) {
            var tags = ParseEtags(request.IfNoneMatch);
            bool hit = etag is not null && (tags.IsWildcard || tags.Tags.Any(t => WeakMatch(t, etag)));
            if (hit) return safe ? 304 : 412;
        } else if (request.IfModifiedSince is not null && safe && request.LastModified is long lm2) {
            long? d = ParseHttpDate(request.IfModifiedSince);
            if (d is not null && lm2 <= d) return 304;
        }
        return 200;
    }

    /// <summary>Formats unix seconds as an IMF-fixdate, for example "Wed, 21 Oct 2026 07:28:00 GMT".</summary>
    public static string FormatHttpDate(long unixSeconds) {
        long days = Math.DivRem(unixSeconds, 86400, out long secs);
        if (secs < 0) { secs += 86400; days--; }
        var (y, m, d) = CivilFromDays(days);
        if (y < 1 || y > 9999) throw new ArgumentOutOfRangeException(nameof(unixSeconds), "year must be 1..9999");
        int weekday = (int)(((days + 3) % 7 + 7) % 7);
        return string.Create(CultureInfo.InvariantCulture,
            $"{Days[weekday]}, {d:00} {Months[m - 1]} {y:0000} {secs / 3600:00}:{secs / 60 % 60:00}:{secs % 60:00} GMT");
    }

    /// <summary>Parses an exact IMF-fixdate (it must round-trip, weekday included) to unix seconds, or null.</summary>
    public static long? ParseHttpDate(string text) {
        if (text is null) return null;
        var m = FixDate.Match(text);
        if (!m.Success) return null;
        int Num(int g) => int.Parse(m.Groups[g].Value, CultureInfo.InvariantCulture);
        int day = Num(2), month = Array.IndexOf(Months, m.Groups[3].Value) + 1, year = Num(4), h = Num(5), mi = Num(6), s = Num(7);
        if (year < 1 || day < 1 || day > DaysInMonth(year, month) || h > 23 || mi > 59 || s > 59) return null;
        long days = DaysFromCivil(year, month, day);
        if (Days[(int)(((days + 3) % 7 + 7) % 7)] != m.Groups[1].Value) return null;
        return days * 86400 + h * 3600 + mi * 60 + s;
    }

    private static string Opaque(string e) => e.StartsWith("W/", StringComparison.Ordinal) ? e[2..] : e;

    internal static int DaysInMonth(int y, int m) =>
        m == 2 ? (y % 4 == 0 && (y % 100 != 0 || y % 400 == 0) ? 29 : 28) : m is 4 or 6 or 9 or 11 ? 30 : 31;

    internal static long DaysFromCivil(long y, int m, int d) {
        y -= m <= 2 ? 1 : 0;
        long era = (y >= 0 ? y : y - 399) / 400;
        long yoe = y - era * 400;
        long doy = (153 * (m + (m > 2 ? -3 : 9)) + 2) / 5 + d - 1;
        long doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
        return era * 146097 + doe - 719468;
    }

    internal static (long Y, int M, int D) CivilFromDays(long z) {
        z += 719468;
        long era = (z >= 0 ? z : z - 146096) / 146097;
        long doe = z - era * 146097;
        long yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365;
        long doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
        long mp = (5 * doy + 2) / 153;
        int d = (int)(doy - (153 * mp + 2) / 5 + 1);
        int m = (int)(mp < 10 ? mp + 3 : mp - 9);
        return (yoe + era * 400 + (m <= 2 ? 1 : 0), m, d);
    }
}
