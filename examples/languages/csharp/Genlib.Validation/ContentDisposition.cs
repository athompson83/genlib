// SPDX-License-Identifier: Apache-2.0
using System.Text;
using System.Text.RegularExpressions;

namespace Genlib.Validation;

/// <summary>A parsed Content-Disposition: lowercased type, sanitized filename (or null) and ordered parameters (names lowercased).</summary>
public sealed record ContentDispositionInfo(string Type, string? Filename, IReadOnlyList<KeyValuePair<string, string>> Params);

/// <summary>
/// Content-Disposition (RFC 6266 + RFC 8187) build and parse with filename sanitizing: '/', '\', '"' and control characters become
/// '_', spaces and dots are trimmed at both ends and an empty result becomes "download". Non-ASCII names get an ASCII fallback plus
/// filename*=UTF-8''pct. Malformed headers throw <see cref="FormatException"/>.
/// </summary>
public static class ContentDisposition {
    private static readonly Regex TypeToken = new(@"\A\s*([!#$%&'*+\-.^_`|~0-9A-Za-z]+)\s*", RegexOptions.CultureInvariant);
    private static readonly Regex TokenRun = new(@"\G[!#$%&'*+\-.^_`|~0-9A-Za-z]+", RegexOptions.CultureInvariant);
    private static readonly Regex Bare = new(@"\G[^;\s]*", RegexOptions.CultureInvariant);
    private static readonly Regex ExtValue = new(@"\A([A-Za-z0-9!#$&+\-^_`{}~]+)'([A-Za-z0-9-]*)'(.*)\z", RegexOptions.CultureInvariant);
    private const string AttrChar = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!#$&+-.^_`|~";

    /// <summary>Makes a filename safe to send or save: replaces / \ " and control characters with '_', trims spaces and dots, empty -> "download".</summary>
    public static string SanitizeFilename(string name) {
        ArgumentNullException.ThrowIfNull(name);
        var sb = new StringBuilder(name.Length);
        foreach (char c in name) sb.Append(c is '/' or '\\' or '"' || c < 0x20 || c == 0x7f ? '_' : c);
        string output = sb.ToString().Trim(' ', '.');
        return output.Length == 0 ? "download" : output;
    }

    /// <summary>Builds an attachment (or inline) Content-Disposition header for a sanitized filename.</summary>
    public static string Build(string filename, bool inline = false) {
        string name = SanitizeFilename(filename);
        string kind = inline ? "inline" : "attachment";
        bool ascii = true;
        foreach (char c in name) if (c < 0x20 || c >= 0x7f) { ascii = false; break; }
        if (ascii) return $"{kind}; filename=\"{name}\"";
        var fallback = new StringBuilder();
        var enc = new StringBuilder();
        Span<byte> buf = stackalloc byte[4];
        foreach (var rune in name.EnumerateRunes()) {
            int v = rune.Value;
            fallback.Append(v is >= 0x20 and < 0x7f ? (char)v : '_');
            if (v < 0x80 && AttrChar.IndexOf((char)v) >= 0) enc.Append((char)v);
            else {
                int len = rune.EncodeToUtf8(buf);
                for (int j = 0; j < len; j++) enc.Append('%').Append(buf[j].ToString("X2"));
            }
        }
        return $"{kind}; filename=\"{fallback}\"; filename*=UTF-8''{enc}";
    }

    /// <summary>Parses a Content-Disposition header; filename* wins over filename and the returned filename is sanitized.</summary>
    public static ContentDispositionInfo Parse(string s) {
        ArgumentNullException.ThrowIfNull(s);
        var m = TypeToken.Match(s);
        if (!m.Success) throw new FormatException("missing disposition type");
        string kind = m.Groups[1].Value.ToLowerInvariant();
        int i = m.Length, n = s.Length;
        var prms = new List<KeyValuePair<string, string>>();
        void Ws() { while (i < n && (s[i] == ' ' || s[i] == '\t')) i++; }
        while (i < n) {
            if (s[i] != ';') throw new FormatException("expected ;");
            i++;
            Ws();
            if (i >= n) break;
            var mm = TokenRun.Match(s, i);
            if (!mm.Success) throw new FormatException("expected parameter");
            string name = mm.Value.ToLowerInvariant();
            i += mm.Length;
            Ws();
            if (i >= n || s[i] != '=') throw new FormatException("expected =");
            i++;
            Ws();
            string val;
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
            Ws();
            if (name.EndsWith('*')) Set(prms, name[..^1], DecodeExtended(val));
            else if (prms.FindIndex(p => p.Key == name) < 0) prms.Add(KeyValuePair.Create(name, val));
        }
        int at = prms.FindIndex(p => p.Key == "filename");
        return new ContentDispositionInfo(kind, at >= 0 ? SanitizeFilename(prms[at].Value) : null, prms);
    }

    private static void Set(List<KeyValuePair<string, string>> prms, string name, string value) {
        int at = prms.FindIndex(p => p.Key == name);
        if (at >= 0) prms[at] = KeyValuePair.Create(name, value); else prms.Add(KeyValuePair.Create(name, value));
    }

    private static int Hex(byte c) => c is >= (byte)'0' and <= (byte)'9' ? c - '0' : c is >= (byte)'a' and <= (byte)'f' ? c - 'a' + 10 : c is >= (byte)'A' and <= (byte)'F' ? c - 'A' + 10 : -1;

    private static string DecodeExtended(string v) {
        var m = ExtValue.Match(v);
        string cs = m.Success ? m.Groups[1].Value.ToLowerInvariant() : "";
        if (cs != "utf-8" && cs != "iso-8859-1") throw new FormatException("bad extended value");
        var raw = Encoding.UTF8.GetBytes(m.Groups[3].Value);
        var bytes = new List<byte>(raw.Length);
        for (int i = 0; i < raw.Length; i++) {
            if (raw[i] == '%') {
                if (i + 2 >= raw.Length || Hex(raw[i + 1]) < 0 || Hex(raw[i + 2]) < 0) throw new FormatException("bad percent-encoding");
                bytes.Add((byte)(Hex(raw[i + 1]) * 16 + Hex(raw[i + 2])));
                i += 2;
            } else bytes.Add(raw[i]);
        }
        if (cs == "iso-8859-1") return Encoding.Latin1.GetString(bytes.ToArray());
        try { return new UTF8Encoding(false, true).GetString(bytes.ToArray()); }
        catch (DecoderFallbackException) { throw new FormatException("invalid UTF-8"); }
    }
}
