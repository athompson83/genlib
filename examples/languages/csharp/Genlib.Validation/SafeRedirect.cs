// SPDX-License-Identifier: Apache-2.0
using System.Globalization;
using System.Text.RegularExpressions;

namespace Genlib.Validation;

/// <summary>Open-redirect guard: allow same-site paths and absolute http(s) URLs on allow-listed origins only.</summary>
public static class SafeRedirects {
    private static readonly Regex Absolute = new(
        "^([hH][tT][tT][pP][sS]?)://([A-Za-z0-9.-]+)(?::([0-9]{1,5}))?(/[^?#]*)?(\\?[^#]*)?(#.*)?\\z", RegexOptions.CultureInvariant);

    /// <summary>
    /// Returns <paramref name="target"/> when it is a safe redirect, otherwise <paramref name="fallback"/>. Safe targets are paths
    /// starting with a single "/", or absolute http/https URLs whose origin (lowercase scheme and host, default port dropped)
    /// equals an origin in <paramref name="allowedOrigins"/>. Control characters, spaces, backslashes, userinfo,
    /// protocol-relative "//host" and other schemes are unsafe. Invalid allowed entries never match.
    /// </summary>
    public static string SafeRedirect(string? target, IEnumerable<string> allowedOrigins, string fallback = "/") {
        ArgumentNullException.ThrowIfNull(allowedOrigins);
        if (string.IsNullOrEmpty(target) || CodePoints(target) > 2048) return fallback;
        foreach (char c in target) if (c <= ' ' || c == '\x7f' || c == '\\') return fallback;
        if (target.StartsWith('/')) return target.StartsWith("//", StringComparison.Ordinal) ? fallback : target;
        string? origin = OriginOf(target);
        if (origin is null) return fallback;
        foreach (string allowed in allowedOrigins) if (allowed is not null && OriginOf(allowed) == origin) return target;
        return fallback;
    }

    private static int CodePoints(string s) {
        int n = 0;
        for (int i = 0; i < s.Length; i++) { n++; if (char.IsHighSurrogate(s[i]) && i + 1 < s.Length && char.IsLowSurrogate(s[i + 1])) i++; }
        return n;
    }

    private static string? OriginOf(string url) {
        var m = Absolute.Match(url);
        if (!m.Success) return null;
        string scheme = m.Groups[1].Value.ToLowerInvariant(), host = m.Groups[2].Value.ToLowerInvariant();
        if (host.StartsWith('.') || host.EndsWith('.') || host.Contains("..")) return null;
        string suffix = "";
        if (m.Groups[3].Success) {
            int p = int.Parse(m.Groups[3].Value, CultureInfo.InvariantCulture);
            if (p < 1 || p > 65535) return null;
            if (!((scheme == "https" && p == 443) || (scheme == "http" && p == 80))) suffix = ":" + p.ToString(CultureInfo.InvariantCulture);
        }
        return scheme + "://" + host + suffix;
    }
}
