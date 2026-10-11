// SPDX-License-Identifier: Apache-2.0
using System.Text;

namespace Genlib.Validation;

/// <summary>
/// INI files (the common subset of git config, PHP and Python configparser defaults). Parsing gives ordered sections of ordered
/// (key, value) pairs; section "" (keys before any header) is always present and first. Lines are trimmed; blank, ';' and '#'
/// lines are skipped; '[name]' starts or continues a section; 'key = value' or 'key: value' splits at the first '=' or ':'; a value
/// in double quotes is unquoted with \\ \" \n \t escapes, otherwise ' ;' or ' #' (space or tab) starts an inline comment; a bare
/// 'key' has value ""; a duplicate key keeps its first position with the last value. CRLF is accepted. Keys and names keep their
/// case. Errors throw <see cref="FormatException"/> whose message starts with "line N:" (1-based).
/// </summary>
public static class IniParse {
    /// <summary>Parses INI text into ordered sections (section "" first) of ordered unique (key, value) pairs.</summary>
    public static List<KeyValuePair<string, List<KeyValuePair<string, string>>>> Parse(string text) {
        ArgumentNullException.ThrowIfNull(text);
        var output = new List<KeyValuePair<string, List<KeyValuePair<string, string>>>> { KeyValuePair.Create("", new List<KeyValuePair<string, string>>()) };
        var cur = output[0].Value;
        var lines = text.Replace("\r\n", "\n").Split('\n');
        for (int no = 1; no <= lines.Length; no++) {
            string s = lines[no - 1].Trim();
            if (s.Length == 0 || s[0] == ';' || s[0] == '#') continue;
            if (s[0] == '[') {
                if (!s.EndsWith(']')) throw new FormatException($"line {no}: unterminated section header");
                string name = s[1..^1].Trim();
                if (name.Length == 0 || name.Contains(']')) throw new FormatException($"line {no}: bad section name");
                int found = output.FindIndex(kv => kv.Key == name);
                if (found < 0) { output.Add(KeyValuePair.Create(name, new List<KeyValuePair<string, string>>())); found = output.Count - 1; }
                cur = output[found].Value;
                continue;
            }
            int eq = s.IndexOf('='), colon = s.IndexOf(':');
            int at = eq < 0 ? colon : colon < 0 ? eq : Math.Min(eq, colon);
            string key, val;
            if (at >= 0) { key = s[..at].Trim(); val = s[(at + 1)..].Trim(); }
            else { key = s; val = ""; }
            if (key.Length == 0) throw new FormatException($"line {no}: empty key");
            if (val.StartsWith('"')) {
                var buf = new StringBuilder();
                bool closed = false;
                for (int j = 1; j < val.Length;) {
                    char c = val[j];
                    if (c == '\\' && j + 1 < val.Length) {
                        char e = val[j + 1];
                        buf.Append(e == 'n' ? '\n' : e == 't' ? '\t' : e);
                        j += 2;
                        continue;
                    }
                    if (c == '"') { closed = true; break; }
                    buf.Append(c); j++;
                }
                if (!closed) throw new FormatException($"line {no}: unterminated quote");
                val = buf.ToString();
            } else {
                int cut = -1;
                foreach (var marker in new[] { " ;", " #", "\t;", "\t#" }) {
                    int k = val.IndexOf(marker, StringComparison.Ordinal);
                    if (k >= 0 && (cut < 0 || k < cut)) cut = k;
                }
                if (cut >= 0) val = val[..cut].TrimEnd();
            }
            int existing = cur.FindIndex(kv => kv.Key == key);
            if (existing >= 0) cur[existing] = KeyValuePair.Create(key, val);
            else cur.Add(KeyValuePair.Create(key, val));
        }
        return output;
    }

    /// <summary>Writes sections as INI text: section "" first without a header, then '[name]' blocks separated by a blank line; values needing it are quoted with escapes.</summary>
    public static string Stringify(IEnumerable<KeyValuePair<string, IEnumerable<KeyValuePair<string, string>>>> data) {
        ArgumentNullException.ThrowIfNull(data);
        var sections = data.ToList();
        var blocks = new List<string>();
        foreach (var (name, kv) in sections) {
            if (name != "") continue;
            var pairs = kv.ToList();
            if (pairs.Count > 0) blocks.Add(string.Join("\n", pairs.Select(p => $"{p.Key} = {Quote(p.Value)}")));
            break;
        }
        foreach (var (name, kv) in sections) {
            if (name == "") continue;
            blocks.Add(string.Join("\n", new[] { $"[{name}]" }.Concat(kv.Select(p => $"{p.Key} = {Quote(p.Value)}"))));
        }
        return string.Join("\n\n", blocks) + (blocks.Count > 0 ? "\n" : "");
    }

    /// <summary>Writes the result of <see cref="Parse"/> (or any ordered sections of pairs) as INI text.</summary>
    public static string Stringify(IEnumerable<KeyValuePair<string, List<KeyValuePair<string, string>>>> data) =>
        Stringify(data.Select(kv => KeyValuePair.Create(kv.Key, (IEnumerable<KeyValuePair<string, string>>)kv.Value)));

    private static string Quote(string v) {
        if (v.Length == 0 || v != v.Trim() || v.IndexOfAny(new[] { ';', '#', '"', '\\', '\n', '\t' }) >= 0)
            return "\"" + v.Replace("\\", "\\\\").Replace("\"", "\\\"").Replace("\n", "\\n").Replace("\t", "\\t") + "\"";
        return v;
    }
}
