// SPDX-License-Identifier: Apache-2.0
using System.Text.RegularExpressions;

namespace Genlib.Validation;

/// <summary>
/// Server-driven content negotiation for Accept (media types) and Accept-Language (RFC 4647 basic filtering). The most specific
/// matching range sets each candidate's q; the highest q above zero wins and ties go to the earlier available entry.
/// </summary>
public static class ContentNegotiation {
    private static readonly Regex MediaRange = new(
        "^[!#$%&'*+.^_`|~0-9a-z-]+/[!#$%&'*+.^_`|~0-9a-z-]+\\z", RegexOptions.CultureInvariant);
    private static readonly Regex LanguageRange = new("^(\\*|[a-z]{1,8}(-[a-z0-9]{1,8})*)\\z", RegexOptions.CultureInvariant);
    private static readonly Regex QValue = new("^(0(\\.[0-9]{0,3})?|1(\\.0{0,3})?)\\z", RegexOptions.CultureInvariant);

    /// <summary>
    /// Picks the best of <paramref name="available"/> (type/subtype) for an Accept header; a null or blank header selects the
    /// first available type, and no acceptable type returns null. Ranges: exact (3) beats type/* (2) beats */* (1).
    /// </summary>
    public static string? NegotiateMediaType(string? acceptHeader, IReadOnlyList<string> available) {
        ArgumentNullException.ThrowIfNull(available);
        if (acceptHeader is null || acceptHeader.Trim().Length == 0) return available.Count > 0 ? available[0] : null;
        var ranges = ParseAccept(acceptHeader).Where(r => MediaRange.IsMatch(r.Value)).ToList();
        return Best(available, ranges, (candidate, range) => {
            string[] t = candidate.ToLowerInvariant().Split('/');
            if (t.Length != 2) throw new ArgumentException("available media types must be type/subtype: '" + candidate + "'", nameof(available));
            string[] r = range.Split('/');
            if (r[0] == t[0] && r[1] == t[1]) return 3;
            if (r[0] == t[0] && r[1] == "*") return 2;
            return r[0] == "*" && r[1] == "*" ? 1 : 0;
        });
    }

    /// <summary>
    /// Picks the best of <paramref name="available"/> language tags for an Accept-Language header (returned in its original case).
    /// "*" matches everything (specificity 1); a range matches a tag equal to it or starting with range + "-" (2 + dashes).
    /// </summary>
    public static string? NegotiateLanguage(string? acceptLanguage, IReadOnlyList<string> available) {
        ArgumentNullException.ThrowIfNull(available);
        if (acceptLanguage is null || acceptLanguage.Trim().Length == 0) return available.Count > 0 ? available[0] : null;
        var ranges = ParseAccept(acceptLanguage).Where(r => LanguageRange.IsMatch(r.Value)).ToList();
        return Best(available, ranges, (candidate, range) => {
            if (range == "*") return 1;
            string tag = candidate.ToLowerInvariant();
            return tag == range || tag.StartsWith(range + "-", StringComparison.Ordinal) ? 2 + range.Count(c => c == '-') : 0;
        });
    }

    private static string? Best(IReadOnlyList<string> available, List<(string Value, double Q)> ranges, Func<string, string, int> specificity) {
        string? best = null;
        double bestQ = 0;
        foreach (string candidate in available) {
            int matchSpec = 0;
            double matchQ = 0;
            foreach (var (value, q) in ranges) {
                int spec = specificity(candidate, value);
                if (spec > matchSpec) { matchSpec = spec; matchQ = q; }
            }
            if (matchSpec > 0 && matchQ > bestQ) { best = candidate; bestQ = matchQ; }
        }
        return best;
    }

    private static List<(string Value, double Q)> ParseAccept(string header) {
        var items = new List<(string, double)>();
        foreach (string part in header.Split(',')) {
            string item = part.Trim(' ', '\t');
            if (item.Length == 0) continue;
            string[] bits = item.Split(';').Select(b => b.Trim(' ', '\t')).ToArray();
            double? q = ParseQ(bits.Skip(1));
            if (q is null) continue;
            items.Add((bits[0].ToLowerInvariant(), q.Value));
        }
        return items;
    }

    private static double? ParseQ(IEnumerable<string> parameters) {
        double q = 1;
        foreach (string p in parameters) {
            int eq = p.IndexOf('=');
            string key = eq < 0 ? p : p[..eq], value = eq < 0 ? "" : p[(eq + 1)..];
            if (!key.Trim().Equals("q", StringComparison.OrdinalIgnoreCase)) continue;
            value = value.Trim();
            if (!QValue.IsMatch(value)) return null;
            int milli = (value[0] - '0') * 1000;
            for (int i = 2, scale = 100; i < value.Length; i++, scale /= 10) milli += (value[i] - '0') * scale;
            q = milli / 1000.0;
        }
        return q;
    }
}
