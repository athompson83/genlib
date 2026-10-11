// SPDX-License-Identifier: Apache-2.0
using System.Text;
using System.Text.RegularExpressions;

namespace Genlib.Validation;

/// <summary>
/// .env file parser. Blank and '#' lines are skipped, an <c>export </c> prefix is allowed, keys match
/// <c>[A-Za-z_][A-Za-z0-9_.]*</c>. Unquoted values are trimmed and ' #' starts an inline comment; single-quoted values are literal;
/// double-quoted values may span lines and decode \n \r \t \" \\ \$. Later keys override earlier ones but keep the first position.
/// CRLF is accepted. Optional expansion of ${NAME} and ${NAME:-default} in unquoted and double-quoted values (earlier keys first,
/// then <c>vars</c>; empty counts as missing for :-; an escaped \$ is never expanded). Errors throw <see cref="FormatException"/>
/// whose message starts with "line N:" (1-based).
/// </summary>
public static class Dotenv {
    private static readonly Regex Key = new(@"\A[A-Za-z_][A-Za-z0-9_.]*\z", RegexOptions.CultureInvariant);
    private static readonly Regex InlineComment = new(@"\s#", RegexOptions.CultureInvariant);
    private static readonly Regex Reference = new(@"(?<!\x00)\$\{([A-Za-z_][A-Za-z0-9_.]*)(:-([^}]*))?\}", RegexOptions.CultureInvariant);

    /// <summary>Parses .env text into ordered (key, value) pairs with unique keys; throws FormatException("line N: ...") on errors.</summary>
    public static List<KeyValuePair<string, string>> Parse(string text, bool expand = false, IReadOnlyDictionary<string, string>? vars = null) {
        ArgumentNullException.ThrowIfNull(text);
        var lines = text.Replace("\r\n", "\n").Split('\n');
        var keys = new List<string>();
        var values = new Dictionary<string, string>();
        var single = new Dictionary<string, bool>();
        int i = 0;
        while (i < lines.Length) {
            string line = lines[i];
            int no = i + 1;
            i++;
            string s = line.Trim();
            if (s.Length == 0 || s.StartsWith('#')) continue;
            if (s.StartsWith("export ", StringComparison.Ordinal)) s = s[7..].TrimStart();
            int eq = s.IndexOf('=');
            if (eq < 0) throw new FormatException($"line {no}: expected KEY=VALUE");
            string key = s[..eq].Trim();
            string rest = s[(eq + 1)..].TrimStart();
            if (!Key.IsMatch(key)) throw new FormatException($"line {no}: invalid key '{key}'");
            string val, tail;
            bool isSingle = false;
            if (rest.StartsWith('\'')) {
                int end = rest.IndexOf('\'', 1);
                if (end < 0) throw new FormatException($"line {no}: unterminated single quote");
                val = rest[1..end];
                tail = rest[(end + 1)..];
                isSingle = true;
            } else if (rest.StartsWith('"')) {
                string buf = rest[1..];
                var sb = new StringBuilder();
                int j = 0;
                while (true) {
                    bool closed = false;
                    while (j < buf.Length) {
                        char c = buf[j];
                        if (c == '\\' && j + 1 < buf.Length) {
                            char n = buf[j + 1];
                            sb.Append(n switch {
                                'n' => "\n", 'r' => "\r", 't' => "\t", '"' => "\"", '\\' => "\\", '$' => "\0$",
                                _ => "\\" + n,
                            });
                            j += 2;
                            continue;
                        }
                        if (c == '"') { closed = true; break; }
                        sb.Append(c);
                        j++;
                    }
                    if (closed) { tail = buf[(j + 1)..]; break; }
                    if (i >= lines.Length) throw new FormatException($"line {no}: unterminated double quote");
                    sb.Append('\n');
                    buf = lines[i];
                    i++;
                    j = 0;
                }
                val = sb.ToString();
            } else {
                var m = InlineComment.Match(rest);
                val = (m.Success ? rest[..m.Index] : rest).Trim();
                tail = "";
            }
            string t = tail.Trim();
            if (t.Length > 0 && !t.StartsWith('#')) throw new FormatException($"line {no}: unexpected text after closing quote");
            if (!values.ContainsKey(key)) keys.Add(key);
            values[key] = val;
            single[key] = isSingle;
        }
        if (expand) {
            var done = new Dictionary<string, string>();
            foreach (var k in keys) {
                string v = values[k];
                if (!single[k]) {
                    v = Reference.Replace(v, m => {
                        string name = m.Groups[1].Value;
                        string? got = done.TryGetValue(name, out var d) ? d : vars != null && vars.TryGetValue(name, out var e) ? e : null;
                        if (!string.IsNullOrEmpty(got)) return got;
                        return m.Groups[2].Success ? m.Groups[3].Value : "";
                    });
                }
                done[k] = v;
            }
            values = done;
        }
        var output = new List<KeyValuePair<string, string>>(keys.Count);
        foreach (var k in keys) output.Add(KeyValuePair.Create(k, values[k].Replace("\0$", "$")));
        return output;
    }
}
