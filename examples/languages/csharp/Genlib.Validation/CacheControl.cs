// SPDX-License-Identifier: Apache-2.0
using System.Globalization;
using System.Text;
using System.Text.RegularExpressions;

namespace Genlib.Validation;

/// <summary>
/// A Cache-Control directive value, tagged as exactly one of: a bare flag (<see cref="IsFlag"/>), an integer delta
/// (<see cref="Number"/>) or a string (<see cref="Text"/>).
/// </summary>
public readonly record struct CacheValue {
    private CacheValue(bool flag, long? number, string? text) { IsFlag = flag; Number = number; Text = text; }

    /// <summary>True for a directive without a value ("no-store").</summary>
    public bool IsFlag { get; }
    /// <summary>The integer value of a delta directive ("max-age=600"), else null.</summary>
    public long? Number { get; }
    /// <summary>The string value of any other directive with a value, else null.</summary>
    public string? Text { get; }

    /// <summary>A bare directive.</summary>
    public static CacheValue Flag { get; } = new(true, null, null);
    /// <summary>An integer value.</summary>
    public static CacheValue Of(long number) => new(false, number, null);
    /// <summary>A string value.</summary>
    public static CacheValue Of(string text) => new(false, null, text ?? throw new ArgumentNullException(nameof(text)));

    /// <summary>"true", the number, or the string quoted with backslash escapes (for display and tests).</summary>
    public override string ToString() => IsFlag ? "true" : Number is long n ? n.ToString(CultureInfo.InvariantCulture)
        : "\"" + Text!.Replace("\\", "\\\\").Replace("\"", "\\\"") + "\"";
}

/// <summary>
/// Cache-Control (RFC 9111) parse and format. Names are lowercased and the first occurrence wins; delta directives (max-age,
/// s-maxage, stale-while-revalidate, stale-if-error, max-stale, min-fresh) must be ASCII digits (quoted digits accepted) and become
/// integers, otherwise they are dropped (a bare max-stale is a flag). Unparseable items are skipped up to the next comma. An
/// unterminated quote throws <see cref="FormatException"/>.
/// </summary>
public static class CacheControl {
    private static readonly HashSet<string> Delta = new() { "max-age", "s-maxage", "stale-while-revalidate", "stale-if-error", "max-stale", "min-fresh" };
    private static readonly Regex TokenRun = new(@"\G[!#$%&'*+\-.^_`|~0-9A-Za-z]+", RegexOptions.CultureInvariant);
    private static readonly Regex Token = new(@"\A[!#$%&'*+\-.^_`|~0-9A-Za-z]+\z", RegexOptions.CultureInvariant);

    /// <summary>Parses a Cache-Control header into ordered (directive, value) pairs with unique names.</summary>
    public static List<KeyValuePair<string, CacheValue>> Parse(string s) {
        ArgumentNullException.ThrowIfNull(s);
        var output = new List<KeyValuePair<string, CacheValue>>();
        int i = 0, n = s.Length;
        while (i < n) {
            while (i < n && (s[i] is ' ' or '\t' or ',')) i++;
            if (i >= n) break;
            var m = TokenRun.Match(s, i);
            if (!m.Success) {
                int c = s.IndexOf(',', i);
                i = c < 0 ? n : c;
                continue;
            }
            string name = m.Value.ToLowerInvariant();
            i += m.Length;
            string? val = null;
            while (i < n && (s[i] == ' ' || s[i] == '\t')) i++;
            if (i < n && s[i] == '=') {
                i++;
                while (i < n && (s[i] == ' ' || s[i] == '\t')) i++;
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
                    var t = TokenRun.Match(s, i);
                    val = t.Success ? t.Value : "";
                    i += t.Success ? t.Length : 0;
                }
            }
            int next = s.IndexOf(',', i);
            i = next < 0 ? n : next;
            CacheValue value;
            if (Delta.Contains(name)) {
                if (val is null) {
                    if (name != "max-stale") continue;
                    value = CacheValue.Flag;
                } else {
                    if (val.Length == 0 || !val.All(ch => ch is >= '0' and <= '9')) continue;
                    // Values beyond the 64-bit range saturate (the reference uses unbounded integers).
                    value = CacheValue.Of(long.TryParse(val, NumberStyles.None, CultureInfo.InvariantCulture, out long num) ? num : long.MaxValue);
                }
            } else value = val is null ? CacheValue.Flag : CacheValue.Of(val);
            if (output.FindIndex(p => p.Key == name) < 0) output.Add(KeyValuePair.Create(name, value));
        }
        return output;
    }

    /// <summary>Formats directives in order: flags as the name, numbers as name=N, strings quoted only when not a token.</summary>
    public static string Format(IEnumerable<KeyValuePair<string, CacheValue>> directives) {
        ArgumentNullException.ThrowIfNull(directives);
        var parts = new List<string>();
        foreach (var (k, v) in directives) {
            if (v.IsFlag) parts.Add(k);
            else if (v.Number is long num) parts.Add(k + "=" + num.ToString(CultureInfo.InvariantCulture));
            else parts.Add(Token.IsMatch(v.Text ?? "") ? k + "=" + v.Text : k + "=" + v.ToString());
        }
        return string.Join(", ", parts);
    }

    /// <summary>Freshness lifetime in seconds: 0 for no-store/no-cache, shared caches prefer s-maxage, else max-age, else null.</summary>
    public static long? Freshness(IEnumerable<KeyValuePair<string, CacheValue>> directives, bool shared = false) {
        ArgumentNullException.ThrowIfNull(directives);
        var d = new Dictionary<string, CacheValue>();
        foreach (var (k, v) in directives) d.TryAdd(k, v);
        if (d.ContainsKey("no-store") || d.ContainsKey("no-cache")) return 0;
        if (shared && d.TryGetValue("s-maxage", out var s) && s.Number is long sm) return sm;
        return d.TryGetValue("max-age", out var m) && m.Number is long ma ? ma : null;
    }
}
