// SPDX-License-Identifier: Apache-2.0
using System.Text;
using System.Text.RegularExpressions;

namespace Genlib.Validation;

/// <summary>One Link header value: the target URI and its ordered parameters (names lowercased, unique).</summary>
public sealed record WebLink(string Uri, IReadOnlyList<KeyValuePair<string, string>> Params) {
    /// <summary>The value of parameter <paramref name="name"/> (lowercase), or null.</summary>
    public string? Get(string name) {
        foreach (var p in Params) if (p.Key == name) return p.Value;
        return null;
    }
}

/// <summary>
/// HTTP Link header (RFC 8288) parsing and formatting. Commas inside &lt;...&gt; or quoted strings do not split; parameter names are
/// lowercased; quoted strings take backslash escapes; RFC 8187 <c>name*</c> values (UTF-8 or ISO-8859-1) win over the plain form and
/// are stored without '*'; otherwise the first occurrence wins; rel is lowercased with whitespace collapsed. Malformed input throws
/// <see cref="FormatException"/>.
/// </summary>
public static class LinkHeader {
    private static readonly Regex TokenRun = new(@"\G[!#$%&'*+\-.^_`|~0-9A-Za-z]+", RegexOptions.CultureInvariant);
    private static readonly Regex Token = new(@"\A[!#$%&'*+\-.^_`|~0-9A-Za-z]+\z", RegexOptions.CultureInvariant);
    private static readonly Regex Bare = new(@"\G[^,;\s]*", RegexOptions.CultureInvariant);
    private static readonly Regex ExtValue = new(@"\A([A-Za-z0-9!#$&+\-^_`{}~]+)'([A-Za-z0-9-]*)'(.*)\z", RegexOptions.CultureInvariant);
    private const string AttrChar = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!#$&+-.^_`|~";

    /// <summary>Parses a Link header into links in order; throws FormatException on malformed input.</summary>
    public static List<WebLink> Parse(string s) {
        ArgumentNullException.ThrowIfNull(s);
        int i = 0, n = s.Length;
        var links = new List<WebLink>();
        void Ws() { while (i < n && (s[i] == ' ' || s[i] == '\t')) i++; }
        while (true) {
            Ws();
            if (i >= n) break;
            if (s[i] == ',') { i++; continue; }
            if (s[i] != '<') throw new FormatException("expected <");
            int end = s.IndexOf('>', i);
            if (end < 0) throw new FormatException("unterminated <");
            string uri = s[(i + 1)..end];
            i = end + 1;
            var prms = new List<KeyValuePair<string, string>>();
            var ext = new HashSet<string>();
            while (true) {
                Ws();
                if (i >= n || s[i] == ',') break;
                if (s[i] != ';') throw new FormatException("expected ;");
                i++;
                Ws();
                var m = TokenRun.Match(s, i);
                if (!m.Success) throw new FormatException("expected parameter name");
                string name = m.Value.ToLowerInvariant();
                i += m.Length;
                Ws();
                string val = "";
                if (i < n && s[i] == '=') {
                    i++;
                    Ws();
                    if (i < n && s[i] == '"') {
                        i++;
                        var buf = new StringBuilder();
                        while (true) {
                            if (i >= n) throw new FormatException("unterminated quote");
                            char c = s[i];
                            if (c == '\\' && i + 1 < n) { buf.Append(s[i + 1]); i += 2; continue; }
                            if (c == '"') { i++; break; }
                            buf.Append(c);
                            i++;
                        }
                        val = buf.ToString();
                    } else {
                        var b = Bare.Match(s, i);
                        val = b.Value;
                        i += b.Length;
                    }
                }
                if (name.EndsWith('*')) {
                    string bn = name[..^1];
                    Set(prms, bn, DecodeExtended(val));
                    ext.Add(bn);
                } else if (!ext.Contains(name) && IndexOf(prms, name) < 0) prms.Add(KeyValuePair.Create(name, val));
            }
            int r = IndexOf(prms, "rel");
            if (r >= 0) prms[r] = KeyValuePair.Create("rel", string.Join(' ', SplitWs(prms[r].Value.ToLowerInvariant())));
            links.Add(new WebLink(uri, prms));
        }
        return links;
    }

    /// <summary>The first link whose rel list contains <paramref name="rel"/> (case-insensitive), or null.</summary>
    public static WebLink? FindRel(IEnumerable<WebLink> links, string rel) {
        ArgumentNullException.ThrowIfNull(links);
        ArgumentNullException.ThrowIfNull(rel);
        string want = rel.ToLowerInvariant();
        foreach (var l in links) if (Array.IndexOf(SplitWs(l.Get("rel") ?? ""), want) >= 0) return l;
        return null;
    }

    /// <summary>Formats links as '&lt;uri&gt;; rel="next"' joined by ", "; non-printable-ASCII values use name*=UTF-8''pct.</summary>
    public static string Format(IEnumerable<WebLink> links) {
        ArgumentNullException.ThrowIfNull(links);
        var output = new List<string>();
        Span<byte> buf = stackalloc byte[4];
        foreach (var l in links) {
            var parts = new List<string> { "<" + l.Uri + ">" };
            foreach (var (k, v) in l.Params) {
                bool nonAscii = false;
                foreach (char c in v) if (c > 0x7e || c < 0x20) { nonAscii = true; break; }
                if (nonAscii) {
                    var sb = new StringBuilder(k).Append("*=UTF-8''");
                    foreach (var rune in v.EnumerateRunes()) {
                        if (rune.Value < 0x80 && AttrChar.IndexOf((char)rune.Value) >= 0) sb.Append((char)rune.Value);
                        else {
                            int len = rune.EncodeToUtf8(buf);
                            for (int j = 0; j < len; j++) sb.Append('%').Append(buf[j].ToString("X2"));
                        }
                    }
                    parts.Add(sb.ToString());
                } else if (Token.IsMatch(v) && k != "rel") parts.Add(k + "=" + v);
                else parts.Add(k + "=\"" + v.Replace("\\", "\\\\").Replace("\"", "\\\"") + "\"");
            }
            output.Add(string.Join("; ", parts));
        }
        return string.Join(", ", output);
    }

    private static int IndexOf(List<KeyValuePair<string, string>> prms, string name) => prms.FindIndex(p => p.Key == name);

    private static void Set(List<KeyValuePair<string, string>> prms, string name, string value) {
        int at = IndexOf(prms, name);
        if (at >= 0) prms[at] = KeyValuePair.Create(name, value); else prms.Add(KeyValuePair.Create(name, value));
    }

    // Splits on whitespace like Python's str.split() (includes U+001C..U+001F).
    private static string[] SplitWs(string s) {
        var parts = new List<string>();
        var cur = new StringBuilder();
        foreach (char c in s) {
            if (char.IsWhiteSpace(c) || c is >= '\u001c' and <= '\u001f') { if (cur.Length > 0) { parts.Add(cur.ToString()); cur.Clear(); } }
            else cur.Append(c);
        }
        if (cur.Length > 0) parts.Add(cur.ToString());
        return parts.ToArray();
    }

    private static int Hex(char c) => c is >= '0' and <= '9' ? c - '0' : c is >= 'a' and <= 'f' ? c - 'a' + 10 : c is >= 'A' and <= 'F' ? c - 'A' + 10 : -1;

    private static string DecodeExtended(string v) {
        var m = ExtValue.Match(v);
        if (!m.Success) throw new FormatException("bad extended value");
        string cs = m.Groups[1].Value.ToLowerInvariant();
        if (cs != "utf-8" && cs != "iso-8859-1") throw new FormatException("unsupported charset");
        var raw = Encoding.UTF8.GetBytes(m.Groups[3].Value);
        var bytes = new List<byte>(raw.Length);
        for (int i = 0; i < raw.Length; i++) {
            if (raw[i] == '%') {
                if (i + 2 >= raw.Length || Hex((char)raw[i + 1]) < 0 || Hex((char)raw[i + 2]) < 0) throw new FormatException("bad percent-encoding");
                bytes.Add((byte)(Hex((char)raw[i + 1]) * 16 + Hex((char)raw[i + 2])));
                i += 2;
            } else bytes.Add(raw[i]);
        }
        if (cs == "iso-8859-1") return Encoding.Latin1.GetString(bytes.ToArray());
        try { return new UTF8Encoding(false, true).GetString(bytes.ToArray()); }
        catch (DecoderFallbackException) { throw new FormatException("invalid UTF-8"); }
    }
}
