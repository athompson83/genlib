// SPDX-License-Identifier: Apache-2.0
using System.Globalization;
using System.Numerics;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;

namespace Genlib.Validation;

/// <summary>A JSON Pointer or JSON Patch failure: bad pointer, missing target, failed test or malformed operation.</summary>
public sealed class JsonPatchException(string message) : Exception(message);

/// <summary>
/// RFC 6901 JSON Pointer, RFC 6902 JSON Patch, RFC 7396 JSON Merge Patch and a deterministic patch generator over
/// System.Text.Json.Nodes values (a C# <c>null</c> <see cref="JsonNode"/> is JSON null). Every operation returns a new value
/// and never changes its inputs. Numbers compare numerically (1 equals 1.0) and booleans are never numbers; whole numbers
/// print without a decimal point and other numbers in .NET's shortest round-trip form.
/// </summary>
public static class JsonPatch {
    // ---- values

    private static bool IsNumber(JsonNode? n) => n is JsonValue v && v.GetValueKind() == JsonValueKind.Number;

    // Exact decimal when it fits, else a double.
    private static (bool IsDecimal, decimal Dec, double Dbl) Number(JsonNode n) {
        string raw = n.ToJsonString();
        if (decimal.TryParse(raw, NumberStyles.Float, CultureInfo.InvariantCulture, out decimal d)) return (true, d, 0);
        return (false, 0, double.Parse(raw, NumberStyles.Float, CultureInfo.InvariantCulture));
    }

    /// <summary>Deep equality: numbers compare numerically, booleans are never numbers and object member order is ignored.</summary>
    public static bool DeepEqual(JsonNode? a, JsonNode? b) {
        if (a is null || b is null) return a is null && b is null;
        if (IsNumber(a) && IsNumber(b)) {
            var (x, y) = (Number(a), Number(b));
            return x.IsDecimal && y.IsDecimal ? x.Dec == y.Dec : ToDouble(x) == ToDouble(y);
        }
        switch (a) {
            case JsonObject oa when b is JsonObject ob:
                if (oa.Count != ob.Count) return false;
                foreach (var (k, v) in oa) if (!ob.TryGetPropertyValue(k, out var w) || !DeepEqual(v, w)) return false;
                return true;
            case JsonArray la when b is JsonArray lb:
                if (la.Count != lb.Count) return false;
                for (int i = 0; i < la.Count; i++) if (!DeepEqual(la[i], lb[i])) return false;
                return true;
            case JsonValue va when b is JsonValue vb:
                var (ka, kb) = (va.GetValueKind(), vb.GetValueKind());
                if (ka != kb) return false;
                return ka != JsonValueKind.String || va.GetValue<string>() == vb.GetValue<string>();
            default:
                return false;
        }
    }

    private static double ToDouble((bool IsDecimal, decimal Dec, double Dbl) n) => n.IsDecimal ? (double)n.Dec : n.Dbl;

    private static JsonNode? Copy(JsonNode? n) => n?.DeepClone();

    // Code point order (string.CompareOrdinal orders UTF-16 code units, which differs above U+FFFF).
    private static int CompareCodePoints(string a, string b) {
        int i = 0, j = 0;
        while (i < a.Length && j < b.Length) {
            int x = NextCodePoint(a, ref i), y = NextCodePoint(b, ref j);
            if (x != y) return x < y ? -1 : 1;
        }
        return (a.Length - i).CompareTo(b.Length - j);
    }

    private static int NextCodePoint(string s, ref int i) {
        if (char.IsHighSurrogate(s[i]) && i + 1 < s.Length && char.IsLowSurrogate(s[i + 1])) { int cp = char.ConvertToUtf32(s[i], s[i + 1]); i += 2; return cp; }
        return s[i++];
    }

    /// <summary>
    /// Compact JSON with object keys in code point order; whole numbers print without a decimal point; strings escape only
    /// \" \\ \b \f \n \r \t and other characters below U+0020 (\u00XX, lowercase hex).
    /// </summary>
    public static string Canonical(JsonNode? value) {
        var sb = new StringBuilder();
        WriteCanonical(sb, value);
        return sb.ToString();
    }

    private static void WriteCanonical(StringBuilder sb, JsonNode? value) {
        switch (value) {
            case null: sb.Append("null"); break;
            case JsonObject o:
                sb.Append('{');
                bool first = true;
                foreach (var key in o.Select(p => p.Key).OrderBy(k => k, Comparer<string>.Create(CompareCodePoints))) {
                    if (!first) sb.Append(',');
                    first = false;
                    WriteString(sb, key);
                    sb.Append(':');
                    WriteCanonical(sb, o[key]);
                }
                sb.Append('}');
                break;
            case JsonArray a:
                sb.Append('[');
                for (int i = 0; i < a.Count; i++) { if (i > 0) sb.Append(','); WriteCanonical(sb, a[i]); }
                sb.Append(']');
                break;
            case JsonValue v:
                switch (v.GetValueKind()) {
                    case JsonValueKind.String: WriteString(sb, v.GetValue<string>()); break;
                    case JsonValueKind.True: sb.Append("true"); break;
                    case JsonValueKind.False: sb.Append("false"); break;
                    case JsonValueKind.Number: sb.Append(NumberText(v)); break;
                    default: sb.Append("null"); break;
                }
                break;
        }
    }

    private static string NumberText(JsonNode n) {
        var (isDec, dec, dbl) = Number(n);
        if (isDec) return dec == decimal.Truncate(dec) ? decimal.Truncate(dec).ToString("0", CultureInfo.InvariantCulture) : ((double)dec).ToString("R", CultureInfo.InvariantCulture);
        return dbl == Math.Floor(dbl) ? new BigInteger(dbl).ToString(CultureInfo.InvariantCulture) : dbl.ToString("R", CultureInfo.InvariantCulture);
    }

    private static void WriteString(StringBuilder sb, string s) {
        sb.Append('"');
        foreach (char c in s) {
            switch (c) {
                case '"': sb.Append("\\\""); break;
                case '\\': sb.Append("\\\\"); break;
                case '\b': sb.Append("\\b"); break;
                case '\f': sb.Append("\\f"); break;
                case '\n': sb.Append("\\n"); break;
                case '\r': sb.Append("\\r"); break;
                case '\t': sb.Append("\\t"); break;
                default:
                    if (c < 0x20) sb.Append("\\u00").Append(((int)c).ToString("x2", CultureInfo.InvariantCulture));
                    else sb.Append(c);
                    break;
            }
        }
        sb.Append('"');
    }

    // ---- RFC 6901 pointers

    private static List<string> ParsePointer(JsonNode? node) {
        if (node is not JsonValue v || v.GetValueKind() != JsonValueKind.String) throw new JsonPatchException("pointer must be a string");
        return ParsePointer(v.GetValue<string>());
    }

    private static List<string> ParsePointer(string p) {
        var tokens = new List<string>();
        if (p.Length == 0) return tokens;
        if (p[0] != '/') throw new JsonPatchException("pointer must be empty or start with \"/\"");
        foreach (var t in p[1..].Split('/')) {
            for (int i = 0; i < t.Length; i++)
                if (t[i] == '~' && (i + 1 >= t.Length || (t[i + 1] != '0' && t[i + 1] != '1'))) throw new JsonPatchException("bad escape in pointer");
            tokens.Add(t.Replace("~1", "/").Replace("~0", "~"));
        }
        return tokens;
    }

    private static string EscapeToken(string t) => t.Replace("~", "~0").Replace("/", "~1");

    private static int Index(string token, int n, bool allowEnd) {
        if (allowEnd && token == "-") return n;
        bool digits = token.Length > 0 && token.All(char.IsAsciiDigit) && (token == "0" || token[0] != '0');
        if (!digits) throw new JsonPatchException("bad array index " + token);
        if (!int.TryParse(token, NumberStyles.None, CultureInfo.InvariantCulture, out int i) || i > n || (i == n && !allowEnd))
            throw new JsonPatchException("array index out of range");
        return i;
    }

    private static JsonNode? Get(JsonNode? doc, IEnumerable<string> tokens) {
        var cur = doc;
        foreach (var t in tokens) {
            if (cur is JsonObject o) {
                if (!o.TryGetPropertyValue(t, out var next)) throw new JsonPatchException("no member " + t);
                cur = next;
            } else if (cur is JsonArray a) cur = a[Index(t, a.Count, false)];
            else throw new JsonPatchException("cannot index a scalar");
        }
        return cur;
    }

    /// <summary>The value at an RFC 6901 pointer ("" is the whole document), as a copy. Throws <see cref="JsonPatchException"/>.</summary>
    public static JsonNode? GetPointer(JsonNode? doc, string pointer) => Copy(Get(doc, ParsePointer(pointer)));

    // ---- RFC 6902 patches

    private static JsonNode? Add(JsonNode? doc, List<string> tokens, JsonNode? value) {
        if (tokens.Count == 0) return value;
        var parent = Get(doc, tokens.Take(tokens.Count - 1));
        string last = tokens[^1];
        if (parent is JsonObject o) o[last] = value;
        else if (parent is JsonArray a) a.Insert(Index(last, a.Count, true), value);
        else throw new JsonPatchException("cannot add to a scalar");
        return doc;
    }

    private static JsonNode? Remove(JsonNode? doc, List<string> tokens) {
        if (tokens.Count == 0) throw new JsonPatchException("cannot remove the root");
        var parent = Get(doc, tokens.Take(tokens.Count - 1));
        string last = tokens[^1];
        if (parent is JsonObject o) {
            if (!o.TryGetPropertyValue(last, out var value)) throw new JsonPatchException("no member " + last);
            o.Remove(last);
            return value;
        }
        if (parent is JsonArray a) {
            int i = Index(last, a.Count, false);
            var value = a[i];
            a.RemoveAt(i);
            return value;
        }
        throw new JsonPatchException("cannot remove from a scalar");
    }

    /// <summary>
    /// Applies an RFC 6902 patch atomically and returns a new document; <paramref name="doc"/> is never changed. Throws
    /// <see cref="JsonPatchException"/> for a malformed patch, a missing target or a failed test.
    /// </summary>
    public static JsonNode? ApplyPatch(JsonNode? doc, JsonNode? patch) {
        if (patch is not JsonArray ops) throw new JsonPatchException("patch must be an array");
        var result = Copy(doc);
        foreach (var item in ops) {
            if (item is not JsonObject op || !op.TryGetPropertyValue("op", out var kindNode) || kindNode is not JsonValue kv || kv.GetValueKind() != JsonValueKind.String)
                throw new JsonPatchException("operation needs \"op\"");
            if (!op.TryGetPropertyValue("path", out var pathNode)) throw new JsonPatchException("operation needs \"path\"");
            string kind = kv.GetValue<string>();
            var path = ParsePointer(pathNode);
            if (kind is "add" or "replace" or "test" && !op.ContainsKey("value")) throw new JsonPatchException(kind + " needs \"value\"");
            if (kind is "move" or "copy" && !op.ContainsKey("from")) throw new JsonPatchException(kind + " needs \"from\"");
            switch (kind) {
                case "add": result = Add(result, path, Copy(op["value"])); break;
                case "remove": Remove(result, path); break;
                case "replace":
                    Get(result, path);
                    if (path.Count == 0) result = Copy(op["value"]);
                    else { Remove(result, path); result = Add(result, path, Copy(op["value"])); }
                    break;
                case "move": {
                    var from = ParsePointer(op["from"]);
                    if (from.SequenceEqual(path)) { Get(result, path); break; }
                    if (path.Count >= from.Count && path.Take(from.Count).SequenceEqual(from)) throw new JsonPatchException("cannot move a value into itself");
                    var value = Remove(result, from);
                    result = Add(result, path, value);
                    break;
                }
                case "copy": result = Add(result, path, Copy(Get(result, ParsePointer(op["from"])))); break;
                case "test":
                    if (!DeepEqual(Get(result, path), op["value"])) throw new JsonPatchException("test failed at " + pathNode!.GetValue<string>());
                    break;
                default: throw new JsonPatchException("unknown op " + kind);
            }
        }
        return result;
    }

    /// <summary>RFC 7396 merge patch; returns a new value.</summary>
    public static JsonNode? MergePatch(JsonNode? target, JsonNode? patch) {
        if (patch is not JsonObject p) return Copy(patch);
        var output = target is JsonObject ? (JsonObject)target.DeepClone() : new JsonObject();
        foreach (var (k, v) in p) {
            if (v is null) output.Remove(k);
            else {
                output.TryGetPropertyValue(k, out var existing);
                output[k] = MergePatch(existing, v);
            }
        }
        return output;
    }

    /// <summary>
    /// A deterministic RFC 6902 patch turning <paramref name="a"/> into <paramref name="b"/>: objects member by member in code
    /// point order, arrays index by index (then removals from the end and appends), otherwise a replace.
    /// </summary>
    public static JsonArray CreatePatch(JsonNode? a, JsonNode? b) {
        var ops = new JsonArray();
        Create(a, b, "", ops);
        return ops;
    }

    private static JsonObject Op(string kind, string path, JsonNode? value = null, bool withValue = false) {
        var o = new JsonObject { ["op"] = kind, ["path"] = path };
        if (withValue) o["value"] = Copy(value);
        return o;
    }

    private static void Create(JsonNode? a, JsonNode? b, string path, JsonArray ops) {
        if (DeepEqual(a, b)) return;
        if (a is JsonObject oa && b is JsonObject ob) {
            var keys = oa.Select(p => p.Key).Union(ob.Select(p => p.Key)).OrderBy(k => k, Comparer<string>.Create(CompareCodePoints));
            foreach (var k in keys) {
                string p = path + "/" + EscapeToken(k);
                if (!ob.ContainsKey(k)) ops.Add(Op("remove", p));
                else if (!oa.ContainsKey(k)) ops.Add(Op("add", p, ob[k], true));
                else Create(oa[k], ob[k], p, ops);
            }
            return;
        }
        if (a is JsonArray la && b is JsonArray lb) {
            for (int i = 0; i < Math.Min(la.Count, lb.Count); i++) Create(la[i], lb[i], path + "/" + i, ops);
            for (int i = la.Count - 1; i >= lb.Count; i--) ops.Add(Op("remove", path + "/" + i));
            for (int i = la.Count; i < lb.Count; i++) ops.Add(Op("add", path + "/" + i, lb[i], true));
            return;
        }
        ops.Add(Op("replace", path, b, true));
    }
}
