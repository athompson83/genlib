// SPDX-License-Identifier: Apache-2.0
using System.Globalization;
using System.Text;
using System.Text.RegularExpressions;

namespace Genlib.Validation;

/// <summary>Set-Cookie attributes; null or false attributes are omitted.</summary>
public sealed record CookieOptions {
    /// <summary>Max-Age in seconds (non-negative).</summary>
    public long? MaxAge { get; init; }
    /// <summary>Expires as unix seconds, written as an IMF-fixdate.</summary>
    public long? Expires { get; init; }
    /// <summary>Domain attribute (written lowercased).</summary>
    public string? Domain { get; init; }
    /// <summary>Path attribute; must start with "/".</summary>
    public string? Path { get; init; }
    /// <summary>Secure attribute.</summary>
    public bool Secure { get; init; }
    /// <summary>HttpOnly attribute.</summary>
    public bool HttpOnly { get; init; }
    /// <summary>"Strict", "Lax" or "None" (exact case).</summary>
    public string? SameSite { get; init; }
    /// <summary>Partitioned (CHIPS) attribute; requires Secure.</summary>
    public bool Partitioned { get; init; }
}

/// <summary>RFC 6265 Set-Cookie serialization with current browser prefix and SameSite rules, and Cookie header parsing.</summary>
public static class Cookies {
    private static readonly Regex Token = new("^[!#$%&'*+\\-.^_`|~0-9A-Za-z]+\\z", RegexOptions.CultureInvariant);
    private static readonly Regex Octets = new("^[\\x21\\x23-\\x2b\\x2d-\\x3a\\x3c-\\x5b\\x5d-\\x7e]*\\z", RegexOptions.CultureInvariant);
    private static readonly Regex DomainPattern = new(
        "^\\.?[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?(?:\\.[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)*\\z", RegexOptions.CultureInvariant);

    /// <summary>
    /// Builds a Set-Cookie value: name=value; Max-Age; Expires; Domain; Path; Secure; HttpOnly; SameSite; Partitioned.
    /// Throws <see cref="ArgumentException"/> for a non-token name, a value outside cookie-octet (encode it first), an invalid
    /// domain or path, SameSite=None or Partitioned without Secure, and __Secure-/__Host- prefix violations.
    /// </summary>
    public static string SerializeCookie(string name, string value, CookieOptions? options = null) {
        ArgumentNullException.ThrowIfNull(name);
        ArgumentNullException.ThrowIfNull(value);
        var o = options ?? new CookieOptions();
        if (!Token.IsMatch(name)) throw new ArgumentException("cookie name must be an RFC 7230 token", nameof(name));
        if (!Octets.IsMatch(value)) throw new ArgumentException("cookie value has characters outside cookie-octet; encode it first", nameof(value));
        if (o.Domain is not null && !DomainPattern.IsMatch(o.Domain)) throw new ArgumentException("invalid cookie domain", nameof(options));
        if (o.Path is not null && (!o.Path.StartsWith('/') || o.Path.Any(c => c < 0x20 || c == 0x7f || c == ';')))
            throw new ArgumentException("cookie path must start with / and contain no controls or ';'", nameof(options));
        if (o.SameSite is not null && o.SameSite is not ("Strict" or "Lax" or "None"))
            throw new ArgumentException("SameSite must be Strict, Lax or None", nameof(options));
        if (o.SameSite == "None" && !o.Secure) throw new ArgumentException("SameSite=None requires Secure", nameof(options));
        if (o.Partitioned && !o.Secure) throw new ArgumentException("Partitioned requires Secure", nameof(options));
        if (name.StartsWith("__Secure-", StringComparison.Ordinal) && !o.Secure) throw new ArgumentException("__Secure- requires Secure", nameof(name));
        if (name.StartsWith("__Host-", StringComparison.Ordinal) && (!o.Secure || o.Domain is not null || o.Path != "/"))
            throw new ArgumentException("__Host- requires Secure, Path=/ and no Domain", nameof(name));
        if (o.MaxAge is < 0) throw new ArgumentException("Max-Age must be non-negative", nameof(options));
        var sb = new StringBuilder(name).Append('=').Append(value);
        if (o.MaxAge is long maxAge) sb.Append("; Max-Age=").Append(maxAge.ToString(CultureInfo.InvariantCulture));
        if (o.Expires is long expires) sb.Append("; Expires=").Append(HttpConditional.FormatHttpDate(expires));
        if (o.Domain is not null) sb.Append("; Domain=").Append(o.Domain.ToLowerInvariant());
        if (o.Path is not null) sb.Append("; Path=").Append(o.Path);
        if (o.Secure) sb.Append("; Secure");
        if (o.HttpOnly) sb.Append("; HttpOnly");
        if (o.SameSite is not null) sb.Append("; SameSite=").Append(o.SameSite);
        if (o.Partitioned) sb.Append("; Partitioned");
        return sb.ToString();
    }

    /// <summary>
    /// Parses a Cookie request header into ordered (name, value) pairs, keeping duplicates. Pieces without "=" or with an empty
    /// name are skipped; one pair of surrounding double quotes is removed from the value.
    /// </summary>
    public static IReadOnlyList<(string Name, string Value)> ParseCookieHeader(string header) {
        ArgumentNullException.ThrowIfNull(header);
        var pairs = new List<(string, string)>();
        foreach (string piece in header.Split(';')) {
            int eq = piece.IndexOf('=');
            if (eq < 0) continue;
            string n = piece[..eq].Trim(' ', '\t'), v = piece[(eq + 1)..].Trim(' ', '\t');
            if (n.Length == 0) continue;
            if (v.Length >= 2 && v[0] == '"' && v[^1] == '"') v = v[1..^1];
            pairs.Add((n, v));
        }
        return pairs;
    }
}
