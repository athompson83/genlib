// SPDX-License-Identifier: Apache-2.0
using System.Globalization;
using System.Numerics;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Text.RegularExpressions;

namespace Genlib.Validation;

/// <summary>
/// Logic-less Mustache-subset templates over JSON-like data (<see cref="JsonNode"/>). <c>{{path}}</c> is HTML-escaped (&amp; &lt;
/// &gt; " ' when <c>escape</c> is true), <c>{{{path}}}</c> is raw, <c>{{#path}}..{{/path}}</c> renders once per list item ('.' is the
/// item; names look up the item, then outer scopes) or once for a truthy value (an object pushes a scope), <c>{{^path}}..{{/path}}</c>
/// renders for a missing or falsy value, <c>{{! comment }}</c> is dropped. Paths use names and [n]. Values: null '', booleans
/// 'true'/'false', integers in decimal, integral floats without '.0', other floats as the shortest round-trip (Python repr form),
/// strings as is. No partials, delimiters or lambdas. Malformed tags, bad names, mismatched or unclosed sections, a stray '{{' and
/// rendering a list or object throw <see cref="FormatException"/>.
/// </summary>
public static class TemplateRender {
    private static readonly Regex Tag = new(@"\{\{(\{)?\s*([#^/!]?)\s*(.*?)\s*(\})?\}\}", RegexOptions.Singleline | RegexOptions.CultureInvariant);
    private static readonly Regex Name = new(@"\A(?:\.|[A-Za-z_][A-Za-z0-9_-]*(?:\.[A-Za-z_][A-Za-z0-9_-]*|\[(?:0|[1-9][0-9]*)\])*)\z", RegexOptions.CultureInvariant);
    private static readonly Regex Part = new(@"[A-Za-z_][A-Za-z0-9_-]*|\[[0-9]+\]", RegexOptions.CultureInvariant);

    private sealed record Node(string Kind, string Text, List<Node>? Children = null);

    /// <summary>Renders <paramref name="template"/> against <paramref name="data"/>; throws FormatException for malformed templates or list/object values.</summary>
    public static string Render(string template, JsonNode? data, bool escape = true) {
        ArgumentNullException.ThrowIfNull(template);
        var sb = new StringBuilder();
        Run(ParseTemplate(template), new List<JsonNode?> { data }, escape, sb);
        return sb.ToString();
    }

    private static List<Node> ParseTemplate(string t) {
        int pos = 0;
        var root = new List<Node>();
        var stack = new List<(string Name, List<Node> Nodes)> { ("", root) };
        foreach (Match m in Tag.Matches(t)) {
            if (m.Index > pos) stack[^1].Nodes.Add(new Node("text", t[pos..m.Index]));
            bool triple = m.Groups[1].Success, close = m.Groups[4].Success;
            string sig = m.Groups[2].Value, name = m.Groups[3].Value;
            if (sig == "!") { pos = m.Index + m.Length; continue; }
            if (triple != close || (triple && sig.Length > 0)) throw new FormatException("bad triple-brace tag");
            if (!Name.IsMatch(name)) throw new FormatException($"bad tag name '{name}'");
            if (sig == "#" || sig == "^") {
                var node = new Node(sig == "#" ? "section" : "inverted", name, new List<Node>());
                stack[^1].Nodes.Add(node);
                stack.Add((name, node.Children!));
            } else if (sig == "/") {
                if (stack.Count == 1 || stack[^1].Name != name) throw new FormatException("mismatched close tag");
                stack.RemoveAt(stack.Count - 1);
            } else {
                stack[^1].Nodes.Add(new Node(triple ? "raw" : "var", name));
            }
            pos = m.Index + m.Length;
        }
        string rest = t[pos..];
        if (rest.Contains("{{", StringComparison.Ordinal)) throw new FormatException("unclosed tag");
        if (rest.Length > 0) stack[^1].Nodes.Add(new Node("text", rest));
        if (stack.Count > 1) throw new FormatException("unclosed section");
        return root;
    }

    private static void Run(List<Node> nodes, List<JsonNode?> stack, bool escape, StringBuilder output) {
        foreach (var n in nodes) {
            switch (n.Kind) {
                case "text": output.Append(n.Text); break;
                case "var":
                case "raw": {
                    string s = Format(Lookup(stack, n.Text));
                    output.Append(escape && n.Kind == "var" ? Escape(s) : s);
                    break;
                }
                case "section": {
                    var v = Lookup(stack, n.Text);
                    if (v is JsonArray list) {
                        foreach (var item in list) Run(n.Children!, new List<JsonNode?>(stack) { item }, escape, output);
                    } else if (Truthy(v)) {
                        var next = new List<JsonNode?>(stack);
                        if (v is JsonObject) next.Add(v);
                        Run(n.Children!, next, escape, output);
                    }
                    break;
                }
                default:
                    if (!Truthy(Lookup(stack, n.Text))) Run(n.Children!, stack, escape, output);
                    break;
            }
        }
    }

    private static JsonNode? Lookup(List<JsonNode?> stack, string path) {
        if (path == ".") return stack[^1];
        var parts = Part.Matches(path).Select(m => m.Value).ToList();
        for (int s = stack.Count - 1; s >= 0; s--) {
            if (stack[s] is JsonObject scope && scope.TryGetPropertyValue(parts[0], out var cur)) {
                foreach (var p in parts.Skip(1)) {
                    if (p[0] == '[') {
                        bool ok = int.TryParse(p.AsSpan(1, p.Length - 2), NumberStyles.None, CultureInfo.InvariantCulture, out int i);
                        cur = ok && cur is JsonArray a && i < a.Count ? a[i] : null;
                    } else {
                        cur = cur is JsonObject o && o.TryGetPropertyValue(p, out var x) ? x : null;
                    }
                    if (cur is null) return null;
                }
                return cur;
            }
        }
        return null;
    }

    private static bool Truthy(JsonNode? v) {
        switch (v) {
            case null: return false;
            case JsonArray a: return a.Count > 0;
            case JsonObject o: return o.Count > 0;
            case JsonValue jv:
                switch (jv.GetValueKind()) {
                    case JsonValueKind.False: case JsonValueKind.Null: return false;
                    case JsonValueKind.String: return jv.GetValue<string>().Length > 0;
                    case JsonValueKind.Number: return ToDouble(jv) != 0;
                    default: return true;
                }
            default: return true;
        }
    }

    private static string Escape(string s) =>
        s.Replace("&", "&amp;").Replace("<", "&lt;").Replace(">", "&gt;").Replace("\"", "&quot;").Replace("'", "&#39;");

    private static string Format(JsonNode? v) {
        if (v is null) return "";
        if (v is not JsonValue jv) throw new FormatException("cannot render a list or object");
        switch (jv.GetValueKind()) {
            case JsonValueKind.Null: return "";
            case JsonValueKind.True: return "true";
            case JsonValueKind.False: return "false";
            case JsonValueKind.String: return jv.GetValue<string>();
            case JsonValueKind.Number:
                if (jv.TryGetValue<long>(out long l)) return l.ToString(CultureInfo.InvariantCulture);
                if (jv.TryGetValue<int>(out int i32)) return i32.ToString(CultureInfo.InvariantCulture);
                if (jv.TryGetValue<JsonElement>(out var el) && IsIntegerLiteral(el.GetRawText())) return el.GetRawText();
                double d = ToDouble(jv);
                if (double.IsFinite(d) && Math.Floor(d) == d) return new BigInteger(d).ToString(CultureInfo.InvariantCulture);
                return PythonRepr(d);
            default: throw new FormatException("cannot render a list or object");
        }
    }

    private static bool IsIntegerLiteral(string raw) => raw.Length > 0 && raw.TrimStart('-').All(char.IsAsciiDigit);

    private static double ToDouble(JsonValue jv) {
        if (jv.TryGetValue<double>(out double d)) return d;
        return double.Parse(jv.ToJsonString(), NumberStyles.Float, CultureInfo.InvariantCulture);
    }

    // Python repr of a non-integral double: shortest round-trip digits, scientific notation when the decimal exponent is < -4 or >= 16.
    private static string PythonRepr(double d) {
        if (double.IsNaN(d)) return "nan";
        if (double.IsInfinity(d)) return d > 0 ? "inf" : "-inf";
        string r = d.ToString("E16", CultureInfo.InvariantCulture);
        // Find the shortest round-trip digit string by trying increasing precision.
        for (int p = 0; p <= 16; p++) {
            string candidate = d.ToString("E" + p, CultureInfo.InvariantCulture);
            if (double.Parse(candidate, NumberStyles.Float, CultureInfo.InvariantCulture) == d) { r = candidate; break; }
        }
        bool negative = r[0] == '-';
        if (negative) r = r[1..];
        int e = r.IndexOf('E');
        string digits = r[..e].Replace(".", "");
        int exp = int.Parse(r[(e + 1)..], NumberStyles.AllowLeadingSign, CultureInfo.InvariantCulture);
        digits = digits.TrimEnd('0');
        if (digits.Length == 0) digits = "0";
        string body;
        if (exp < -4 || exp >= 16) {
            string mant = digits.Length > 1 ? digits[0] + "." + digits[1..] : digits;
            body = mant + "e" + (exp < 0 ? "-" : "+") + Math.Abs(exp).ToString("00", CultureInfo.InvariantCulture);
        } else if (exp < 0) {
            body = "0." + new string('0', -exp - 1) + digits;
        } else if (digits.Length > exp + 1) {
            body = digits[..(exp + 1)] + "." + digits[(exp + 1)..];
        } else {
            body = digits + new string('0', exp + 1 - digits.Length) + ".0";
        }
        return (negative ? "-" : "") + body;
    }
}
