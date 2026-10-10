// SPDX-License-Identifier: Apache-2.0
using System.Globalization;
using System.Text;
using System.Text.RegularExpressions;

namespace Genlib.Validation;

/// <summary>RFC 3986 section 6 normalization for http/https URLs (hand-parsed; no platform URL parser).</summary>
public static class UrlNormalize {
    private static readonly Regex UrlPattern = new(
        "^([A-Za-z][A-Za-z0-9+.-]*)://([^/?#]*)([^?#]*)(\\?[^#]*)?(#.*)?\\z", RegexOptions.CultureInvariant | RegexOptions.Singleline);
    private static readonly Regex Authority = new("^(\\[[0-9A-Fa-f:.]+\\]|[A-Za-z0-9.-]+)(?::([0-9]*))?\\z", RegexOptions.CultureInvariant);

    /// <summary>The remove_dot_segments algorithm of RFC 3986 section 5.2.4.</summary>
    public static string RemoveDotSegments(string path) {
        ArgumentNullException.ThrowIfNull(path);
        string input = path;
        var output = new StringBuilder();
        void Pop() {
            int i = output.ToString().LastIndexOf('/');
            output.Length = i < 0 ? 0 : i;
        }
        while (input.Length > 0) {
            if (input.StartsWith("../", StringComparison.Ordinal)) input = input[3..];
            else if (input.StartsWith("./", StringComparison.Ordinal)) input = input[2..];
            else if (input.StartsWith("/./", StringComparison.Ordinal)) input = "/" + input[3..];
            else if (input == "/.") input = "/";
            else if (input.StartsWith("/../", StringComparison.Ordinal)) { input = "/" + input[4..]; Pop(); }
            else if (input == "/..") { input = "/"; Pop(); }
            else if (input is "." or "..") input = "";
            else {
                int i = input.IndexOf('/', input.StartsWith('/') ? 1 : 0);
                if (i < 0) { output.Append(input); input = ""; } else { output.Append(input, 0, i); input = input[i..]; }
            }
        }
        return output.ToString();
    }

    /// <summary>
    /// Normalizes an http(s) URL: lowercase scheme and host, canonical bracketed IPv6, default or empty port removed, uppercase
    /// percent-encodings with unreserved characters decoded, dot segments removed, empty path as "/", bare "?" and fragment
    /// dropped. Throws <see cref="FormatException"/> for controls/spaces, other schemes, userinfo, bad hosts, ports or escapes.
    /// </summary>
    public static string NormalizeUrl(string text) {
        ArgumentNullException.ThrowIfNull(text);
        if (text.Any(c => c <= 0x20 || c == 0x7f)) throw new FormatException("URL contains spaces or control characters");
        var m = UrlPattern.Match(text);
        if (!m.Success) throw new FormatException("URL must be scheme://authority[path][?query][#fragment]");
        string scheme = m.Groups[1].Value.ToLowerInvariant(), auth = m.Groups[2].Value;
        if (scheme is not ("http" or "https")) throw new FormatException("URL scheme must be http or https");
        if (auth.Contains('@')) throw new FormatException("URL userinfo is not allowed");
        var hm = Authority.Match(auth);
        if (!hm.Success) throw new FormatException("invalid URL host or port");
        string host = hm.Groups[1].Value.ToLowerInvariant();
        if (host.StartsWith('[')) host = "[" + IpCidr.CanonicalIp(host[1..^1]) + "]";
        string port = "";
        if (hm.Groups[2].Success && hm.Groups[2].Value.Length > 0) {
            string digits = hm.Groups[2].Value.TrimStart('0');
            if (digits.Length > 5) throw new FormatException("URL port out of range");
            int p = digits.Length == 0 ? 0 : int.Parse(digits, CultureInfo.InvariantCulture);
            if (p > 65535) throw new FormatException("URL port out of range");
            if (!((scheme == "http" && p == 80) || (scheme == "https" && p == 443))) port = ":" + p.ToString(CultureInfo.InvariantCulture);
        }
        string path = RemoveDotSegments(NormalizePercent(m.Groups[3].Value));
        if (path.Length == 0) path = "/";
        string query = m.Groups[4].Success ? NormalizePercent(m.Groups[4].Value) : "";
        if (query == "?") query = "";
        return scheme + "://" + host + port + path + query;
    }

    private static string NormalizePercent(string s) {
        var sb = new StringBuilder(s.Length);
        for (int i = 0; i < s.Length; i++) {
            if (s[i] != '%') { sb.Append(s[i]); continue; }
            if (i + 2 >= s.Length || !Uri.IsHexDigit(s[i + 1]) || !Uri.IsHexDigit(s[i + 2]))
                throw new FormatException("'%' must be followed by two hex digits");
            char c = (char)int.Parse(s.AsSpan(i + 1, 2), NumberStyles.AllowHexSpecifier, CultureInfo.InvariantCulture);
            if (char.IsAsciiLetterOrDigit(c) || c is '-' or '.' or '_' or '~') sb.Append(c);
            else sb.Append('%').Append(char.ToUpperInvariant(s[i + 1])).Append(char.ToUpperInvariant(s[i + 2]));
            i += 2;
        }
        return sb.ToString();
    }
}
