// SPDX-License-Identifier: Apache-2.0
using System.Text;

namespace Genlib.Validation;

/// <summary>
/// Glob matching for '/'-separated paths. '*' matches any run of non-'/' code points, '?' one code point, '[...]' one code point
/// from a class ('!' or '^' negates, ranges a-z, ']' first is literal, backslash escapes); none of them cross '/'. A whole-segment
/// '**' matches zero or more segments (without <c>dot</c> it does not descend into segments starting with '.'); '{a,b}'
/// alternatives (no nesting) are expanded first; backslash escapes the next character. A segment starting with '.' is matched
/// only by a pattern segment starting with a literal '.' unless <c>dot</c>. Case-sensitive. Invalid patterns throw
/// <see cref="FormatException"/>: empty pattern, unterminated '[' or '{', nested '{', unmatched '}', trailing backslash.
/// </summary>
public static class GlobMatch {
    /// <summary>True when <paramref name="path"/> matches the glob <paramref name="pattern"/>; throws FormatException for an invalid pattern.</summary>
    public static bool Match(string pattern, string path, bool dot = false) {
        ArgumentNullException.ThrowIfNull(pattern);
        ArgumentNullException.ThrowIfNull(path);
        Validate(pattern);
        foreach (var alt in ExpandBraces(pattern)) {
            if (MatchOne(alt, path, dot)) return true;
        }
        return false;
    }

    /// <summary>The paths (in input order) that match <paramref name="pattern"/>.</summary>
    public static List<string> Filter(string pattern, IEnumerable<string> paths, bool dot = false) {
        ArgumentNullException.ThrowIfNull(paths);
        Validate(pattern);
        var output = new List<string>();
        foreach (var p in paths) if (Match(pattern, p, dot)) output.Add(p);
        return output;
    }

    private static void Validate(string pattern) {
        ArgumentNullException.ThrowIfNull(pattern);
        if (pattern.Length == 0) throw new FormatException("empty pattern");
        int trailing = 0;
        for (int t = pattern.Length - 1; t >= 0 && pattern[t] == '\\'; t--) trailing++;
        if (trailing % 2 == 1) throw new FormatException("trailing backslash");
        int k = 0;
        while (k < pattern.Length) {
            if (pattern[k] == '\\') { k += 2; continue; }
            if (pattern[k] == '[') {
                int j = k + 1;
                if (j < pattern.Length && (pattern[j] == '!' || pattern[j] == '^')) j++;
                if (j < pattern.Length && pattern[j] == ']') j++;
                while (j < pattern.Length && pattern[j] != ']') j += pattern[j] == '\\' ? 2 : 1;
                if (j >= pattern.Length) throw new FormatException("unterminated [");
                k = j;
            }
            k++;
        }
    }

    private static List<string> ExpandBraces(string p) {
        int i = -1, k = 0;
        while (k < p.Length) {
            if (p[k] == '\\') { k += 2; continue; }
            if (p[k] == '{') { i = k; break; }
            if (p[k] == '}') throw new FormatException("unmatched }");
            k++;
        }
        if (i < 0) return new List<string> { p };
        int j = i + 1;
        var parts = new List<string>();
        var cur = new StringBuilder();
        bool closed = false;
        while (j < p.Length) {
            char c = p[j];
            if (c == '\\') { cur.Append(p.AsSpan(j, Math.Min(2, p.Length - j))); j += 2; continue; }
            if (c == '{') throw new FormatException("nested braces are not supported");
            if (c == ',') { parts.Add(cur.ToString()); cur.Clear(); j++; continue; }
            if (c == '}') { parts.Add(cur.ToString()); closed = true; break; }
            cur.Append(c);
            j++;
        }
        if (!closed) throw new FormatException("unterminated {");
        var result = new List<string>();
        foreach (var alt in parts) result.AddRange(ExpandBraces(p[..i] + alt + p[(j + 1)..]));
        return result;
    }

    private static List<string> SplitSegments(string p) {
        var segs = new List<string>();
        var cur = new StringBuilder();
        int k = 0;
        while (k < p.Length) {
            if (p[k] == '\\' && k + 1 < p.Length) { cur.Append(p, k, 2); k += 2; continue; }
            if (p[k] == '/') { segs.Add(cur.ToString()); cur.Clear(); k++; continue; }
            cur.Append(p[k]);
            k++;
        }
        segs.Add(cur.ToString());
        return segs;
    }

    private static int[] CodePoints(string s) {
        var list = new List<int>(s.Length);
        foreach (var r in s.EnumerateRunes()) list.Add(r.Value);
        return list.ToArray();
    }

    private static bool MatchOne(string pattern, string path, bool dot) {
        var ps = SplitSegments(pattern);
        var ss = path.Split('/');
        var memo = new sbyte[ps.Count + 1, ss.Length + 1];
        bool M(int i, int j) {
            if (memo[i, j] != 0) return memo[i, j] > 0;
            bool r;
            if (i == ps.Count) r = j == ss.Length;
            else if (ps[i] == "**") {
                r = false;
                for (int k = j; k <= ss.Length; k++) {
                    if (k > j && !dot && ss[k - 1].StartsWith('.')) break;
                    if (M(i + 1, k)) { r = true; break; }
                }
            } else if (j >= ss.Length) r = false;
            else r = SegMatch(ps[i], ss[j], dot) && M(i + 1, j + 1);
            memo[i, j] = (sbyte)(r ? 1 : -1);
            return r;
        }
        return M(0, 0);
    }

    private static bool SegMatch(string patText, string text, bool dot) {
        if (!dot && text.StartsWith('.') && !patText.StartsWith('.') && !patText.StartsWith("\\.")) return false;
        int[] pat = CodePoints(patText), s = CodePoints(text);
        var memo = new sbyte[pat.Length + 1, s.Length + 1];
        bool M(int pi0, int si0) {
            if (memo[pi0, si0] != 0) return memo[pi0, si0] > 0;
            bool r = Run(pi0, si0);
            memo[pi0, si0] = (sbyte)(r ? 1 : -1);
            return r;
        }
        bool Run(int pi, int si) {
            while (pi < pat.Length) {
                int c = pat[pi];
                if (c == '*') {
                    while (pi < pat.Length && pat[pi] == '*') pi++;
                    if (pi == pat.Length) return true;
                    for (int k = si; k <= s.Length; k++) if (M(pi, k)) return true;
                    return false;
                }
                if (si >= s.Length) return false;
                if (c == '?') { pi++; si++; continue; }
                if (c == '[') {
                    int j = pi + 1;
                    bool neg = false;
                    if (j < pat.Length && (pat[j] == '!' || pat[j] == '^')) { neg = true; j++; }
                    bool hit = false, first = true;
                    while (true) {
                        if (j >= pat.Length) throw new FormatException("unterminated [");
                        if (pat[j] == ']' && !first) break;
                        first = false;
                        int a = pat[j];
                        if (a == '\\' && j + 1 < pat.Length) { j++; a = pat[j]; }
                        int lo = a, hi = a;
                        if (j + 2 < pat.Length && pat[j + 1] == '-' && pat[j + 2] != ']') {
                            int b = pat[j + 2];
                            if (b == '\\' && j + 3 < pat.Length) { j++; b = pat[j + 2]; }
                            hi = b;
                            j += 3;
                        } else j++;
                        if (lo <= s[si] && s[si] <= hi) hit = true;
                    }
                    if (hit == neg) return false;
                    pi = j + 1;
                    si++;
                    continue;
                }
                if (c == '\\') {
                    if (pi + 1 >= pat.Length) throw new FormatException("trailing backslash");
                    pi++;
                    c = pat[pi];
                }
                if (s[si] != c) return false;
                pi++;
                si++;
            }
            return si == s.Length;
        }
        return M(0, 0);
    }
}
