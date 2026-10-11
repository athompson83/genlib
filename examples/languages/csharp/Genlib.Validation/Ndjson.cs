// SPDX-License-Identifier: Apache-2.0
using System.Globalization;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;

namespace Genlib.Validation;

/// <summary>A newline-delimited JSON line that is not one complete JSON value; <see cref="Line"/> is 1-based.</summary>
public sealed class NdjsonException : FormatException {
    /// <summary>The 1-based line number of the bad line.</summary>
    public int Line { get; }

    /// <summary>Creates the error for <paramref name="line"/>.</summary>
    public NdjsonException(int line, Exception? inner = null) : base("line " + line.ToString(CultureInfo.InvariantCulture), inner) { Line = line; }
}

/// <summary>
/// Newline-delimited JSON over <see cref="JsonNode"/> (null is JSON null). Parsing splits on \n, drops a trailing \r, skips lines
/// that are empty or only spaces/tabs and parses each other line with System.Text.Json (duplicate keys: the last wins).
/// Stringifying writes each value compactly with keys in insertion order, escaping only " \ and U+0000-U+001F (\b \f \n \r \t or
/// lowercase \u00xx) and keeping non-ASCII as is, each followed by \n. Only integer numbers are supported when writing
/// (the reference serializer has no float form).
/// </summary>
public static class Ndjson {
    private static readonly JsonDocumentOptions Options = new() { MaxDepth = 256 };

    /// <summary>Parses NDJSON text into its values; throws <see cref="NdjsonException"/> naming the 1-based line of a bad line.</summary>
    public static List<JsonNode?> ParseNdjson(string text) {
        ArgumentNullException.ThrowIfNull(text);
        var output = new List<JsonNode?>();
        var lines = text.Split('\n');
        for (int i = 0; i < lines.Length; i++) {
            string line = lines[i];
            if (line.EndsWith('\r')) line = line[..^1];
            if (line.Trim(' ', '\t').Length == 0) continue;
            try {
                using var doc = JsonDocument.Parse(line, Options);
                output.Add(ToNode(doc.RootElement));
            } catch (JsonException e) {
                throw new NdjsonException(i + 1, e);
            }
        }
        return output;
    }

    private static JsonNode? ToNode(JsonElement e) {
        switch (e.ValueKind) {
            case JsonValueKind.Null: return null;
            case JsonValueKind.True: return JsonValue.Create(true);
            case JsonValueKind.False: return JsonValue.Create(false);
            case JsonValueKind.String: return JsonValue.Create(e.GetString()!);
            case JsonValueKind.Number:
                // Integers that fit in 64 bits become long; anything else keeps its exact source text.
                if (e.TryGetInt64(out long l)) return JsonValue.Create(l);
                return JsonNode.Parse(e.GetRawText());
            case JsonValueKind.Array: {
                var arr = new JsonArray();
                foreach (var item in e.EnumerateArray()) arr.Add(ToNode(item));
                return arr;
            }
            default: {
                var obj = new JsonObject();
                foreach (var p in e.EnumerateObject()) obj[p.Name] = ToNode(p.Value);
                return obj;
            }
        }
    }

    /// <summary>Serializes each value compactly on its own line, each followed by \n ("" for no values); throws ArgumentException for non-integer numbers.</summary>
    public static string StringifyNdjson(IEnumerable<JsonNode?> values) {
        ArgumentNullException.ThrowIfNull(values);
        var sb = new StringBuilder();
        foreach (var v in values) { Write(sb, v); sb.Append('\n'); }
        return sb.ToString();
    }

    private static void Write(StringBuilder sb, JsonNode? v) {
        switch (v) {
            case null: sb.Append("null"); return;
            case JsonArray arr:
                sb.Append('[');
                for (int i = 0; i < arr.Count; i++) { if (i > 0) sb.Append(','); Write(sb, arr[i]); }
                sb.Append(']');
                return;
            case JsonObject obj: {
                sb.Append('{');
                bool first = true;
                foreach (var kv in obj) {
                    if (!first) sb.Append(',');
                    first = false;
                    WriteString(sb, kv.Key); sb.Append(':'); Write(sb, kv.Value);
                }
                sb.Append('}');
                return;
            }
            case JsonValue val:
                switch (val.GetValueKind()) {
                    case JsonValueKind.True: sb.Append("true"); return;
                    case JsonValueKind.False: sb.Append("false"); return;
                    case JsonValueKind.Null: sb.Append("null"); return;
                    case JsonValueKind.String: WriteString(sb, val.GetValue<string>()); return;
                    case JsonValueKind.Number:
                        if (val.TryGetValue(out long l)) { sb.Append(l.ToString(CultureInfo.InvariantCulture)); return; }
                        string raw = val.ToJsonString();
                        if (IsIntegerText(raw)) { sb.Append(raw); return; }
                        throw new ArgumentException("only integer numbers are supported");
                }
                break;
        }
        throw new ArgumentException("unsupported value");
    }

    private static bool IsIntegerText(string raw) {
        int start = raw.StartsWith('-') ? 1 : 0;
        return raw.Length > start && raw.Skip(start).All(char.IsAsciiDigit);
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
                    if (c < 0x20) sb.Append("\\u").Append(((int)c).ToString("x4", CultureInfo.InvariantCulture));
                    else sb.Append(c);
                    break;
            }
        }
        sb.Append('"');
    }
}
