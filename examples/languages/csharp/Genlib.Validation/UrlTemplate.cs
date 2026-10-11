// SPDX-License-Identifier: Apache-2.0
using System.Globalization;
using System.Text;
using System.Text.RegularExpressions;

namespace Genlib.Validation;

/// <summary>
/// RFC 6570 URI Template expansion, levels 1-4. Variable values are a <see cref="string"/>, a list of strings
/// (<see cref="IEnumerable{T}"/> of string) or an ordered map (<see cref="IEnumerable{T}"/> of <see cref="KeyValuePair{TKey,TValue}"/>
/// of strings, insertion order kept); a missing name, null, an empty list or an empty map is undefined. Unreserved characters are
/// kept; the + and # operators also keep reserved characters and existing %XX triplets, and literal text copies %XX triplets as-is; everything else is UTF-8 percent-encoded
/// with uppercase hex. Prefixes (:n) count code points. Invalid templates throw <see cref="FormatException"/>.
/// </summary>
public static class UrlTemplate {
    private sealed record Op(string First, string Sep, bool Named, string IfEmpty, bool AllowReserved);

    private static readonly Dictionary<char, Op> Ops = new() {
        ['\0'] = new("", ",", false, "", false), ['+'] = new("", ",", false, "", true), ['#'] = new("#", ",", false, "", true),
        ['.'] = new(".", ".", false, "", false), ['/'] = new("/", "/", false, "", false), [';'] = new(";", ";", true, "", false),
        ['?'] = new("?", "&", true, "=", false), ['&'] = new("&", "&", true, "=", false),
    };
    private const string Reserved = ":/?#[]@!$&'()*+,;=";
    private static readonly Regex VarName = new(@"^(?:[A-Za-z0-9_]|%[0-9A-Fa-f]{2})(?:\.?(?:[A-Za-z0-9_]|%[0-9A-Fa-f]{2}))*\z", RegexOptions.CultureInvariant);
    private static readonly Regex VarSpec = new(@"^([^:*]+)(?::([0-9]+)|(\*))?\z", RegexOptions.CultureInvariant);

    /// <summary>Expands <paramref name="template"/> with <paramref name="variables"/>; throws FormatException for an invalid template or a prefix on a list or map.</summary>
    public static string ExpandTemplate(string template, IReadOnlyDictionary<string, object?> variables) {
        ArgumentNullException.ThrowIfNull(template);
        ArgumentNullException.ThrowIfNull(variables);
        var output = new StringBuilder();
        int i = 0;
        while (i < template.Length) {
            char c = template[i];
            if (c == '{') {
                int j = template.IndexOf('}', i);
                if (j < 0) throw new FormatException("unclosed expression");
                output.Append(Expand(template[(i + 1)..j], variables));
                i = j + 1;
            } else if (c == '}') {
                throw new FormatException("stray }");
            } else if (c == '%' && i + 2 < template.Length && IsHex(template[i + 1]) && IsHex(template[i + 2])) {
                // RFC 6570 section 3.1: a pct-encoded triplet in a literal is copied as-is.
                output.Append(template, i, 3);
                i += 3;
            } else {
                int len = char.IsHighSurrogate(c) && i + 1 < template.Length && char.IsLowSurrogate(template[i + 1]) ? 2 : 1;
                // Other literal characters are encoded one code point at a time (a lone '%' becomes %25).
                output.Append(Encode(template.Substring(i, len), true));
                i += len;
            }
        }
        return output.ToString();
    }

    private static string Expand(string expr, IReadOnlyDictionary<string, object?> variables) {
        if (expr.Length == 0) throw new FormatException("empty expression");
        char op = "+#./;?&".Contains(expr[0]) ? expr[0] : '\0';
        if ("=,!@|".Contains(expr[0])) throw new FormatException("reserved operator: " + expr[0]);
        string body = op == '\0' ? expr : expr[1..];
        var o = Ops[op];
        bool allow = o.AllowReserved;
        var parts = new List<string>();
        foreach (var spec in body.Split(',')) {
            var (name, prefix, explode) = ParseVarSpec(spec);
            variables.TryGetValue(name, out var value);
            if (value is null) continue;
            if (value is string s) {
                string v = prefix is int p ? PrefixCodePoints(s, p) : s;
                parts.Add(o.Named ? Encode(name, allow) + (v.Length == 0 ? o.IfEmpty : "=" + Encode(v, allow)) : Encode(v, allow));
                continue;
            }
            if (value is IEnumerable<KeyValuePair<string, string>> map) {
                var pairs = map.ToList();
                if (pairs.Count == 0) continue;
                if (prefix is not null) throw new FormatException("prefix on composite value: " + name);
                if (!explode) {
                    string joined = string.Join(",", pairs.Select(kv => Encode(kv.Key, allow) + "," + Encode(kv.Value, allow)));
                    parts.Add(o.Named ? Encode(name, allow) + "=" + joined : joined);
                } else {
                    parts.Add(string.Join(o.Sep, pairs.Select(kv => Encode(kv.Key, allow)
                        + (o.Named ? (kv.Value.Length == 0 ? o.IfEmpty : "=" + Encode(kv.Value, allow)) : "=" + Encode(kv.Value, allow)))));
                }
                continue;
            }
            if (value is IEnumerable<string> list) {
                var items = list.ToList();
                if (items.Count == 0) continue;
                if (prefix is not null) throw new FormatException("prefix on composite value: " + name);
                if (!explode) {
                    string joined = string.Join(",", items.Select(x => Encode(x, allow)));
                    parts.Add(o.Named ? Encode(name, allow) + "=" + joined : joined);
                } else if (o.Named) {
                    parts.Add(string.Join(o.Sep, items.Select(x => Encode(name, allow) + (x.Length == 0 ? o.IfEmpty : "=" + Encode(x, allow)))));
                } else {
                    parts.Add(string.Join(o.Sep, items.Select(x => Encode(x, allow))));
                }
                continue;
            }
            throw new ArgumentException("unsupported value type for " + name);
        }
        return parts.Count > 0 ? o.First + string.Join(o.Sep, parts) : "";
    }

    private static (string Name, int? Prefix, bool Explode) ParseVarSpec(string spec) {
        var m = VarSpec.Match(spec);
        if (!m.Success || !VarName.IsMatch(m.Groups[1].Value)) throw new FormatException("bad varspec: " + spec);
        int? prefix = null;
        if (m.Groups[2].Success) {
            string digits = m.Groups[2].Value;
            if (digits.StartsWith('0') || digits.Length > 4) throw new FormatException("bad prefix: " + spec);
            prefix = int.Parse(digits, CultureInfo.InvariantCulture);
        }
        return (m.Groups[1].Value, prefix, m.Groups[3].Success);
    }

    private static string PrefixCodePoints(string s, int count) {
        var sb = new StringBuilder();
        int n = 0;
        foreach (var r in s.EnumerateRunes()) {
            if (n++ >= count) break;
            sb.Append(r.ToString());
        }
        return sb.ToString();
    }

    private static bool IsHex(char c) => c is >= '0' and <= '9' or >= 'A' and <= 'F' or >= 'a' and <= 'f';

    private static string Encode(string s, bool allowReserved) {
        var sb = new StringBuilder();
        int i = 0;
        while (i < s.Length) {
            char c = s[i];
            if (allowReserved && c == '%' && i + 2 < s.Length && IsHex(s[i + 1]) && IsHex(s[i + 2])) {
                sb.Append(s, i, 3); i += 3; continue;
            }
            if (c is >= 'A' and <= 'Z' or >= 'a' and <= 'z' or >= '0' and <= '9' or '-' or '.' or '_' or '~' || (allowReserved && Reserved.Contains(c))) {
                sb.Append(c); i++; continue;
            }
            int len = char.IsHighSurrogate(c) && i + 1 < s.Length && char.IsLowSurrogate(s[i + 1]) ? 2 : 1;
            foreach (byte b in Encoding.UTF8.GetBytes(s.Substring(i, len))) sb.Append('%').Append(b.ToString("X2", CultureInfo.InvariantCulture));
            i += len;
        }
        return sb.ToString();
    }
}
