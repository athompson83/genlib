// SPDX-License-Identifier: Apache-2.0
using System.Globalization;
using System.Text;
using System.Text.Json.Nodes;

namespace Genlib.Validation;

/// <summary>
/// Dotted paths into JSON-like data (<see cref="JsonNode"/>; null is JSON null), such as <c>user.addresses[0].city</c> or
/// <c>a["x.y"]</c>. Grammar: names separated by '.' (running to the next '.' or '[', never empty), <c>[n]</c> indexes (no leading
/// zeros except 0) and <c>["..."]</c> keys with \" and \\ escapes; "" is the root. Parse errors throw <see cref="FormatException"/>.
/// <see cref="Set"/> and <see cref="Delete"/> return new structures and never mutate their input.
/// </summary>
public static class DottedPath {
    /// <summary>Parses a path into segments: <see cref="string"/> keys and <see cref="int"/> indexes; throws FormatException on bad syntax or an index above int.MaxValue.</summary>
    public static List<object> Parse(string path) {
        ArgumentNullException.ThrowIfNull(path);
        var output = new List<object>();
        int i = 0, n = path.Length;
        while (i < n) {
            char c = path[i];
            if (c == '[') {
                if (i + 1 < n && path[i + 1] == '"') {
                    int j = i + 2;
                    var buf = new StringBuilder();
                    while (true) {
                        if (j >= n) throw new FormatException("unterminated quoted key");
                        if (path[j] == '\\' && j + 1 < n) { buf.Append(path[j + 1]); j += 2; continue; }
                        if (path[j] == '"') break;
                        buf.Append(path[j]); j++;
                    }
                    if (j + 1 >= n || path[j + 1] != ']') throw new FormatException("expected ]");
                    output.Add(buf.ToString());
                    i = j + 2;
                } else {
                    int j = i + 1;
                    while (j < n && path[j] >= '0' && path[j] <= '9') j++;
                    int digits = j - i - 1;
                    if (digits == 0 || j >= n || path[j] != ']' || (digits > 1 && path[i + 1] == '0')) throw new FormatException("bad index");
                    if (!int.TryParse(path.AsSpan(i + 1, digits), NumberStyles.None, CultureInfo.InvariantCulture, out int index)) throw new FormatException("index too large");
                    output.Add(index);
                    i = j + 1;
                }
                bool needName = false;
                if (i < n && path[i] == '.') { i++; needName = true; }
                if (needName && i >= n) throw new FormatException("trailing dot");
                continue;
            }
            if (c == '.') throw new FormatException("empty segment");
            int end = i;
            while (end < n && path[end] != '.' && path[end] != '[') end++;
            output.Add(path[i..end]);
            i = end;
            if (i < n && path[i] == '.') {
                i++;
                if (i >= n) throw new FormatException("trailing dot");
            }
        }
        return output;
    }

    /// <summary>The value at <paramref name="path"/>, or <paramref name="fallback"/> when a key or index is missing or the walk meets the wrong type.</summary>
    public static JsonNode? Get(JsonNode? data, string path, JsonNode? fallback = null) {
        var cur = data;
        foreach (var k in Parse(path)) if (!Step(cur, k, out cur)) return fallback;
        return cur;
    }

    /// <summary>True when <paramref name="path"/> exists in <paramref name="data"/> (a JSON null value counts as present).</summary>
    public static bool Has(JsonNode? data, string path) {
        var cur = data;
        foreach (var k in Parse(path)) if (!Step(cur, k, out cur)) return false;
        return true;
    }

    /// <summary>
    /// A copy of <paramref name="data"/> with <paramref name="value"/> at <paramref name="path"/>: missing containers are created
    /// (objects before keys, arrays before indexes), index == length appends; an index beyond the length or a step through a scalar
    /// throws ArgumentException. Path "" returns a copy of the value.
    /// </summary>
    public static JsonNode? Set(JsonNode? data, string path, JsonNode? value) => SetAt(data, Parse(path), 0, value);

    /// <summary>A copy of <paramref name="data"/> without the key or index at <paramref name="path"/> (arrays shift); missing gives an unchanged copy; "" gives null.</summary>
    public static JsonNode? Delete(JsonNode? data, string path) {
        var keys = Parse(path);
        if (keys.Count == 0) return null;
        return DeleteAt(data, keys, 0);
    }

    private static bool Step(JsonNode? cur, object key, out JsonNode? next) {
        next = null;
        if (key is int i) {
            if (cur is JsonArray a && i < a.Count) { next = a[i]; return true; }
            return false;
        }
        if (cur is JsonObject o && o.TryGetPropertyValue((string)key, out next)) return true;
        next = null;
        return false;
    }

    private static JsonNode? SetAt(JsonNode? cur, List<object> keys, int at, JsonNode? value) {
        if (at == keys.Count) return value?.DeepClone();
        var k = keys[at];
        if (cur is null) cur = k is int ? new JsonArray() : new JsonObject();
        if (k is int i) {
            if (cur is not JsonArray list) throw new ArgumentException("index on a non-list");
            if (i > list.Count) throw new ArgumentException("index out of range");
            var copy = (JsonArray)list.DeepClone();
            var child = i < copy.Count ? copy[i] : null;
            var v = SetAt(child, keys, at + 1, value);
            if (i == copy.Count) copy.Add(v);
            else copy[i] = v;
            return copy;
        }
        if (cur is not JsonObject obj) throw new ArgumentException("key on a non-object");
        var newObj = (JsonObject)obj.DeepClone();
        newObj.TryGetPropertyValue((string)k, out var existing);
        newObj[(string)k] = SetAt(existing, keys, at + 1, value);
        return newObj;
    }

    private static JsonNode? DeleteAt(JsonNode? cur, List<object> keys, int at) {
        var k = keys[at];
        if (!Step(cur, k, out var child)) return cur?.DeepClone();
        var copy = cur!.DeepClone();
        bool last = at + 1 == keys.Count;
        if (k is int i) {
            var list = (JsonArray)copy;
            if (last) list.RemoveAt(i);
            else list[i] = DeleteAt(child, keys, at + 1);
        } else {
            var obj = (JsonObject)copy;
            if (last) obj.Remove((string)k);
            else obj[(string)k] = DeleteAt(child, keys, at + 1);
        }
        return copy;
    }
}
