// SPDX-License-Identifier: Apache-2.0

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * Glob matching for '/'-separated paths: '*', '?', '[...]' (never crossing '/'), whole-segment '**', '{a,b}'
 * alternatives and backslash escapes. A segment starting with '.' needs a literal '.' in the pattern unless dot is set.
 * Matching is case-sensitive and works on Unicode code points. Malformed patterns throw IllegalArgumentException.
 */
public final class GlobMatch {
    private GlobMatch() {}

    /** True when path matches the glob pattern; hidden segments are skipped by wildcards. */
    public static boolean globMatch(String pattern, String path) { return globMatch(pattern, path, false); }

    /** True when path matches the glob pattern; dot=true lets wildcards match segments starting with '.'. */
    public static boolean globMatch(String pattern, String path, boolean dot) {
        if (pattern.isEmpty()) throw new IllegalArgumentException("empty pattern");
        int trailing = 0;
        for (int k = pattern.length() - 1; k >= 0 && pattern.charAt(k) == '\\'; k--) trailing++;
        if (trailing % 2 == 1) throw new IllegalArgumentException("trailing backslash");
        int k = 0;
        while (k < pattern.length()) {
            char c = pattern.charAt(k);
            if (c == '\\') { k += 2; continue; }
            if (c == '[') {
                int j = k + 1;
                if (j < pattern.length() && (pattern.charAt(j) == '!' || pattern.charAt(j) == '^')) j++;
                if (j < pattern.length() && pattern.charAt(j) == ']') j++;
                while (j < pattern.length() && pattern.charAt(j) != ']') j += pattern.charAt(j) == '\\' ? 2 : 1;
                if (j >= pattern.length()) throw new IllegalArgumentException("unterminated [");
                k = j;
            }
            k++;
        }
        int[] p = path.codePoints().toArray();
        for (String alt : expandBraces(pattern)) if (matchOne(alt, p, dot)) return true;
        return false;
    }

    /** The paths that match the pattern, in their original order. */
    public static List<String> globFilter(String pattern, List<String> paths) { return globFilter(pattern, paths, false); }

    /** The paths that match the pattern, in their original order; dot as in globMatch. */
    public static List<String> globFilter(String pattern, List<String> paths, boolean dot) {
        List<String> out = new ArrayList<>();
        for (String s : paths) if (globMatch(pattern, s, dot)) out.add(s);
        return out;
    }

    private static List<String> expandBraces(String p) {
        int i = -1;
        int k = 0;
        while (k < p.length()) {
            char c = p.charAt(k);
            if (c == '\\') { k += 2; continue; }
            if (c == '{') { i = k; break; }
            if (c == '}') throw new IllegalArgumentException("unmatched }");
            k++;
        }
        List<String> res = new ArrayList<>();
        if (i < 0) { res.add(p); return res; }
        int j = i + 1;
        List<String> parts = new ArrayList<>();
        StringBuilder cur = new StringBuilder();
        boolean closed = false;
        while (j < p.length()) {
            char c = p.charAt(j);
            if (c == '\\') { cur.append(p, j, Math.min(j + 2, p.length())); j += 2; continue; }
            if (c == '{') throw new IllegalArgumentException("nested braces are not supported");
            if (c == ',') { parts.add(cur.toString()); cur.setLength(0); j++; continue; }
            if (c == '}') { parts.add(cur.toString()); closed = true; break; }
            cur.append(c);
            j++;
        }
        if (!closed) throw new IllegalArgumentException("unterminated {");
        for (String alt : parts) res.addAll(expandBraces(p.substring(0, i) + alt + p.substring(j + 1)));
        return res;
    }

    private static List<int[]> splitSegments(int[] p) {
        List<int[]> segs = new ArrayList<>();
        List<Integer> cur = new ArrayList<>();
        int k = 0;
        while (k < p.length) {
            if (p[k] == '\\' && k + 1 < p.length) { cur.add(p[k]); cur.add(p[k + 1]); k += 2; continue; }
            if (p[k] == '/') { segs.add(toArray(cur)); cur.clear(); k++; continue; }
            cur.add(p[k]);
            k++;
        }
        segs.add(toArray(cur));
        return segs;
    }

    private static int[] toArray(List<Integer> xs) {
        int[] a = new int[xs.size()];
        for (int i = 0; i < a.length; i++) a[i] = xs.get(i);
        return a;
    }

    private static boolean isStar(int[] seg) { return seg.length == 2 && seg[0] == '*' && seg[1] == '*'; }

    private static boolean matchOne(String pattern, int[] path, boolean dot) {
        List<int[]> ps = splitSegments(pattern.codePoints().toArray());
        List<int[]> ss = new ArrayList<>();
        int start = 0;
        for (int i = 0; i <= path.length; i++) {
            if (i == path.length || path[i] == '/') { ss.add(java.util.Arrays.copyOfRange(path, start, i)); start = i + 1; }
        }
        return segs(ps, ss, 0, 0, dot, new HashMap<>());
    }

    private static boolean segs(List<int[]> ps, List<int[]> ss, int i, int j, boolean dot, Map<Long, Boolean> memo) {
        long key = ((long) i << 32) | j;
        Boolean got = memo.get(key);
        if (got != null) return got;
        boolean r;
        if (i == ps.size()) r = j == ss.size();
        else if (isStar(ps.get(i))) {
            r = false;
            for (int k = j; k <= ss.size(); k++) {
                if (k > j && !dot && startsWithDot(ss.get(k - 1))) break;
                if (segs(ps, ss, i + 1, k, dot, memo)) { r = true; break; }
            }
        } else if (j >= ss.size()) r = false;
        else r = segMatch(ps.get(i), ss.get(j), dot) && segs(ps, ss, i + 1, j + 1, dot, memo);
        memo.put(key, r);
        return r;
    }

    private static boolean startsWithDot(int[] s) { return s.length > 0 && s[0] == '.'; }

    private static boolean segMatch(int[] pat, int[] s, boolean dot) {
        if (!dot && startsWithDot(s) && !startsWithDot(pat) && !(pat.length > 1 && pat[0] == '\\' && pat[1] == '.')) return false;
        return m(pat, s, 0, 0, new HashMap<>());
    }

    private static boolean m(int[] pat, int[] s, int pi, int si, Map<Long, Boolean> memo) {
        long key = ((long) pi << 32) | si;
        Boolean got = memo.get(key);
        if (got != null) return got;
        boolean r = mRaw(pat, s, pi, si, memo);
        memo.put(key, r);
        return r;
    }

    private static boolean mRaw(int[] pat, int[] s, int pi, int si, Map<Long, Boolean> memo) {
        while (pi < pat.length) {
            int c = pat[pi];
            if (c == '*') {
                while (pi < pat.length && pat[pi] == '*') pi++;
                if (pi == pat.length) return true;
                for (int k = si; k <= s.length; k++) if (m(pat, s, pi, k, memo)) return true;
                return false;
            }
            if (si >= s.length) return false;
            if (c == '?') { pi++; si++; continue; }
            if (c == '[') {
                int j = pi + 1;
                boolean neg = false;
                if (j < pat.length && (pat[j] == '!' || pat[j] == '^')) { neg = true; j++; }
                boolean first = true;
                boolean hit = false;
                while (true) {
                    if (j >= pat.length) throw new IllegalArgumentException("unterminated [");
                    if (pat[j] == ']' && !first) break;
                    first = false;
                    int a = pat[j];
                    if (a == '\\' && j + 1 < pat.length) { j++; a = pat[j]; }
                    int lo = a;
                    int hi = a;
                    if (j + 2 < pat.length && pat[j + 1] == '-' && pat[j + 2] != ']') {
                        int b = pat[j + 2];
                        if (b == '\\' && j + 3 < pat.length) { j++; b = pat[j + 2]; }
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
                if (pi + 1 >= pat.length) throw new IllegalArgumentException("trailing backslash");
                c = pat[pi + 1];
                pi++;
            }
            if (s[si] != c) return false;
            pi++;
            si++;
        }
        return si == s.length;
    }
}
