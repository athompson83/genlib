// SPDX-License-Identifier: Apache-2.0
using System.Text;
using System.Text.RegularExpressions;

namespace Genlib.Validation;

/// <summary>A parsed data: URL: lowercased media type, ordered parameters (names lowercased, first wins), base64 flag and body bytes.</summary>
public sealed record DataUriParts(string Mime, IReadOnlyList<KeyValuePair<string, string>> Params, bool Base64, byte[] Data);

/// <summary>
/// data: URLs (RFC 2397 with simplified WHATWG fetch rules). An empty or invalid media type becomes text/plain with charset US-ASCII;
/// bodies are percent-decoded to bytes (invalid '%' stays literal); base64 bodies ignore ASCII whitespace, drop up to two trailing
/// '=' and must then be only A-Z a-z 0-9 + / with a length that is not 1 mod 4. Errors throw <see cref="FormatException"/>.
/// </summary>
public static class DataUri {
    private const string Token = @"[!#$%&'*+\-.^_`|~0-9A-Za-z]+";
    private static readonly Regex Base64Suffix = new(@";\s*base64\s*$", RegexOptions.IgnoreCase | RegexOptions.CultureInvariant);
    private static readonly Regex MediaType = new(@"\A" + Token + "/" + Token + @"\z", RegexOptions.CultureInvariant);
    private static readonly Regex BuildType = new(@"\A" + Token + "/" + Token + @"(\s*;\s*" + Token + @"=[^;,\s]+)*\z", RegexOptions.CultureInvariant);
    private static readonly UTF8Encoding StrictUtf8 = new(false, true);

    /// <summary>Parses a data: URL; throws FormatException when it is not one, has no comma or has invalid base64.</summary>
    public static DataUriParts Parse(string url) {
        ArgumentNullException.ThrowIfNull(url);
        if (url.Length < 5 || !url[..5].Equals("data:", StringComparison.OrdinalIgnoreCase)) throw new FormatException("not a data: URL");
        string rest = url[5..];
        int comma = rest.IndexOf(',');
        if (comma < 0) throw new FormatException("missing comma");
        string header = rest[..comma].Trim(), body = rest[(comma + 1)..];
        bool isB64 = false;
        var m = Base64Suffix.Match(header);
        if (m.Success) { isB64 = true; header = header[..m.Index]; }
        var parts = header.Split(';');
        string mime = parts[0].Trim().ToLowerInvariant();
        var prms = new List<KeyValuePair<string, string>>();
        for (int i = 1; i < parts.Length; i++) {
            int eq = parts[i].IndexOf('=');
            if (eq < 0) continue;
            string k = parts[i][..eq].Trim().ToLowerInvariant();
            if (k.Length > 0 && !prms.Exists(p => p.Key == k)) prms.Add(KeyValuePair.Create(k, parts[i][(eq + 1)..].Trim()));
        }
        if (!MediaType.IsMatch(mime)) {
            mime = "text/plain";
            if (!prms.Exists(p => p.Key == "charset")) prms.Insert(0, KeyValuePair.Create("charset", "US-ASCII"));
        }
        byte[] data = PercentDecode(body);
        if (isB64) {
            var s = new List<byte>(data.Length);
            foreach (byte b in data) if (b is not ((byte)'\t' or (byte)'\n' or (byte)'\f' or (byte)'\r' or (byte)' ')) s.Add(b);
            int n = s.Count;
            if (n >= 2 && s[n - 1] == '=' && s[n - 2] == '=') n -= 2;
            else if (n >= 1 && s[n - 1] == '=') n -= 1;
            if (n % 4 == 1) throw new FormatException("invalid base64");
            var sb = new StringBuilder(n + 2);
            for (int i = 0; i < n; i++) {
                byte b = s[i];
                if (!(b is >= (byte)'A' and <= (byte)'Z' or >= (byte)'a' and <= (byte)'z' or >= (byte)'0' and <= (byte)'9' or (byte)'+' or (byte)'/')) throw new FormatException("invalid base64");
                sb.Append((char)b);
            }
            while (sb.Length % 4 != 0) sb.Append('=');
            data = Convert.FromBase64String(sb.ToString());
        }
        return new DataUriParts(mime, prms, isB64, data);
    }

    /// <summary>
    /// Builds a data: URL. <paramref name="base64"/> null picks base64 unless the type is textual (text/*, +json, +xml,
    /// application/json|xml|javascript) and the bytes are valid UTF-8; throws FormatException for an invalid media type.
    /// </summary>
    public static string Build(byte[] data, string mime = "application/octet-stream", bool? base64 = null) {
        ArgumentNullException.ThrowIfNull(data);
        ArgumentNullException.ThrowIfNull(mime);
        if (!BuildType.IsMatch(mime)) throw new FormatException("invalid media type");
        bool useB64;
        if (base64 is bool forced) useB64 = forced;
        else {
            string bt = mime.Split(';')[0].Trim().ToLowerInvariant();
            bool textual = bt.StartsWith("text/", StringComparison.Ordinal) || bt.EndsWith("+json", StringComparison.Ordinal) || bt.EndsWith("+xml", StringComparison.Ordinal)
                || bt is "application/json" or "application/xml" or "application/javascript";
            bool utf8;
            try { StrictUtf8.GetString(data); utf8 = true; } catch (DecoderFallbackException) { utf8 = false; }
            useB64 = !(textual && utf8);
        }
        if (useB64) return "data:" + mime + ";base64," + Convert.ToBase64String(data);
        var sb = new StringBuilder("data:").Append(mime).Append(',');
        const string keep = "-_.!~*'();/?:@&=+$,";
        foreach (byte b in data) {
            if (b is >= (byte)'A' and <= (byte)'Z' or >= (byte)'a' and <= (byte)'z' or >= (byte)'0' and <= (byte)'9' || keep.IndexOf((char)b) >= 0) sb.Append((char)b);
            else sb.Append('%').Append(b.ToString("X2"));
        }
        return sb.ToString();
    }

    private static int Hex(byte b) => b is >= (byte)'0' and <= (byte)'9' ? b - '0'
        : b is >= (byte)'a' and <= (byte)'f' ? b - 'a' + 10
        : b is >= (byte)'A' and <= (byte)'F' ? b - 'A' + 10 : -1;

    private static byte[] PercentDecode(string s) {
        var b = Encoding.UTF8.GetBytes(s);
        var output = new List<byte>(b.Length);
        int i = 0;
        while (i < b.Length) {
            if (b[i] == 0x25 && i + 2 < b.Length && Hex(b[i + 1]) >= 0 && Hex(b[i + 2]) >= 0) {
                output.Add((byte)(Hex(b[i + 1]) * 16 + Hex(b[i + 2])));
                i += 3;
            } else { output.Add(b[i]); i++; }
        }
        return output.ToArray();
    }
}
