// SPDX-License-Identifier: Apache-2.0
using System.Text;

namespace Genlib.Validation;

/// <summary>
/// WHATWG application/x-www-form-urlencoded query strings. Parsing strips one leading '?', splits on '&amp;', skips empty pieces,
/// splits at the first '=', turns '+' into a space and percent-decodes bytes (invalid '%' sequences stay literal) before UTF-8
/// decoding with U+FFFD replacement. Stringify keeps A-Z a-z 0-9 * - . _, writes a space as '+' and everything else as uppercase %XX.
/// </summary>
public static class QueryString {
    /// <summary>Parses a query string into ordered (name, value) pairs, keeping duplicates.</summary>
    public static List<KeyValuePair<string, string>> Parse(string s) {
        ArgumentNullException.ThrowIfNull(s);
        if (s.StartsWith('?')) s = s[1..];
        var pairs = new List<KeyValuePair<string, string>>();
        foreach (var piece in s.Split('&')) {
            if (piece.Length == 0) continue;
            int eq = piece.IndexOf('=');
            string n = eq < 0 ? piece : piece[..eq];
            string v = eq < 0 ? "" : piece[(eq + 1)..];
            pairs.Add(KeyValuePair.Create(Decode(n), Decode(v)));
        }
        return pairs;
    }

    /// <summary>Serializes (name, value) pairs as name=value joined by '&amp;'.</summary>
    public static string Stringify(IEnumerable<KeyValuePair<string, string>> pairs) {
        ArgumentNullException.ThrowIfNull(pairs);
        var sb = new StringBuilder();
        bool first = true;
        foreach (var p in pairs) {
            if (!first) sb.Append('&');
            first = false;
            Encode(sb, p.Key);
            sb.Append('=');
            Encode(sb, p.Value);
        }
        return sb.ToString();
    }

    /// <summary>All values for <paramref name="name"/> in order (exact, case-sensitive match).</summary>
    public static List<string> GetAll(IEnumerable<KeyValuePair<string, string>> pairs, string name) {
        ArgumentNullException.ThrowIfNull(pairs);
        var output = new List<string>();
        foreach (var p in pairs) if (p.Key == name) output.Add(p.Value);
        return output;
    }

    private static int Hex(byte b) => b is >= (byte)'0' and <= (byte)'9' ? b - '0'
        : b is >= (byte)'a' and <= (byte)'f' ? b - 'a' + 10
        : b is >= (byte)'A' and <= (byte)'F' ? b - 'A' + 10 : -1;

    private static string Decode(string s) {
        var b = Encoding.UTF8.GetBytes(s.Replace('+', ' '));
        var output = new List<byte>(b.Length);
        int i = 0;
        while (i < b.Length) {
            if (b[i] == 0x25 && i + 2 < b.Length &&Hex(b[i + 1]) >= 0 && Hex(b[i + 2]) >= 0) {
                output.Add((byte)(Hex(b[i + 1]) * 16 + Hex(b[i + 2])));
                i += 3;
            } else { output.Add(b[i]); i++; }
        }
        return Encoding.UTF8.GetString(output.ToArray());
    }

    private static void Encode(StringBuilder sb, string s) {
        foreach (byte b in Encoding.UTF8.GetBytes(s)) {
            if (b is >= (byte)'A' and <= (byte)'Z' or >= (byte)'a' and <= (byte)'z' or >= (byte)'0' and <= (byte)'9' or (byte)'*' or (byte)'-' or (byte)'.' or (byte)'_') sb.Append((char)b);
            else if (b == 0x20) sb.Append('+');
            else sb.Append('%').Append(b.ToString("X2"));
        }
    }
}
