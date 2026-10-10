// SPDX-License-Identifier: Apache-2.0
using System.Text;

namespace Genlib.Validation;

/// <summary>Shared URL checks, XML/HTML escaping and query decoding for the marketing capabilities.</summary>
internal static class WebText {
    /// <summary>True for an absolute http(s) URL with a host and no whitespace or control characters.</summary>
    internal static bool IsAbsoluteHttpUrl(string? value, bool httpsOnly = false) {
        if (string.IsNullOrEmpty(value)) return false;
        foreach (char c in value) if (c <= ' ' || c == '\u007f') return false;
        string rest;
        if (value.StartsWith("https://", StringComparison.OrdinalIgnoreCase)) rest = value[8..];
        else if (!httpsOnly && value.StartsWith("http://", StringComparison.OrdinalIgnoreCase)) rest = value[7..];
        else return false;
        return rest.Length > 0 && rest[0] is not ('/' or '?' or '#');
    }

    internal static bool HasNewline(string? value) => value is not null && (value.Contains('\n') || value.Contains('\r'));

    /// <summary>Escapes &amp; &lt; &gt; " and ' for XML text and attribute values.</summary>
    internal static string XmlEscape(string value) {
        var sb = new StringBuilder(value.Length);
        foreach (char c in value) {
            sb.Append(c switch { '&' => "&amp;", '<' => "&lt;", '>' => "&gt;", '"' => "&quot;", '\'' => "&apos;", _ => c.ToString() });
        }
        return sb.ToString();
    }

    /// <summary>Escapes &amp; &lt; &gt; and " for HTML text and double-quoted attribute values.</summary>
    internal static string HtmlEscape(string value) {
        var sb = new StringBuilder(value.Length);
        foreach (char c in value) {
            sb.Append(c switch { '&' => "&amp;", '<' => "&lt;", '>' => "&gt;", '"' => "&quot;", _ => c.ToString() });
        }
        return sb.ToString();
    }

    /// <summary>Decodes application/x-www-form-urlencoded text ('+' is a space); throws on malformed escapes or UTF-8.</summary>
    internal static string FormDecode(string value) {
        var bytes = new List<byte>(value.Length);
        for (int i = 0; i < value.Length; i++) {
            char c = value[i];
            if (c == '+') bytes.Add((byte)' ');
            else if (c == '%') {
                if (i + 2 >= value.Length || !IsHex(value[i + 1]) || !IsHex(value[i + 2]))
                    throw new FormatException("malformed percent-encoding in query");
                bytes.Add(Convert.ToByte(value.Substring(i + 1, 2), 16));
                i += 2;
            } else bytes.AddRange(Encoding.UTF8.GetBytes(c.ToString()));
        }
        try { return new UTF8Encoding(false, true).GetString(bytes.ToArray()); }
        catch (DecoderFallbackException) { throw new FormatException("query is not valid UTF-8"); }
    }

    private static bool IsHex(char c) => c is >= '0' and <= '9' or >= 'a' and <= 'f' or >= 'A' and <= 'F';

    /// <summary>Splits a URL into the part before '?', the raw query (null when absent) and the fragment (null when absent).</summary>
    internal static (string Head, string? Query, string? Fragment) SplitUrl(string url) {
        string? fragment = null;
        int hash = url.IndexOf('#');
        if (hash >= 0) { fragment = url[(hash + 1)..]; url = url[..hash]; }
        int q = url.IndexOf('?');
        return q < 0 ? (url, null, fragment) : (url[..q], url[(q + 1)..], fragment);
    }

    internal static string ParamName(string segment) {
        int eq = segment.IndexOf('=');
        return eq < 0 ? segment : segment[..eq];
    }

    internal static string JoinUrl(string head, IReadOnlyCollection<string> segments, string? fragment) {
        var sb = new StringBuilder(head);
        if (segments.Count > 0) sb.Append('?').Append(string.Join("&", segments));
        if (fragment is not null) sb.Append('#').Append(fragment);
        return sb.ToString();
    }
}
