// SPDX-License-Identifier: Apache-2.0
namespace Genlib.Validation;

/// <summary>Edit distances and similarity scores over Unicode code points (not UTF-16 units or bytes).</summary>
public static class StringSimilarity {
    /// <summary>Levenshtein distance (insert, delete, substitute each cost 1).</summary>
    public static int Levenshtein(string a, string b) {
        int[] x = CodePoints(a), y = CodePoints(b);
        var prev = Enumerable.Range(0, y.Length + 1).ToArray();
        var cur = new int[y.Length + 1];
        for (int i = 1; i <= x.Length; i++) {
            cur[0] = i;
            for (int j = 1; j <= y.Length; j++)
                cur[j] = Math.Min(Math.Min(prev[j] + 1, cur[j - 1] + 1), prev[j - 1] + (x[i - 1] == y[j - 1] ? 0 : 1));
            (prev, cur) = (cur, prev);
        }
        return prev[y.Length];
    }

    /// <summary>Optimal string alignment distance: Levenshtein plus adjacent transposition at cost 1.</summary>
    public static int DamerauOsa(string a, string b) {
        int[] x = CodePoints(a), y = CodePoints(b);
        int n = x.Length, m = y.Length;
        var d = new int[n + 1, m + 1];
        for (int i = 0; i <= n; i++) d[i, 0] = i;
        for (int j = 0; j <= m; j++) d[0, j] = j;
        for (int i = 1; i <= n; i++) {
            for (int j = 1; j <= m; j++) {
                int cost = x[i - 1] == y[j - 1] ? 0 : 1;
                d[i, j] = Math.Min(Math.Min(d[i - 1, j] + 1, d[i, j - 1] + 1), d[i - 1, j - 1] + cost);
                if (i > 1 && j > 1 && x[i - 1] == y[j - 2] && x[i - 2] == y[j - 1]) d[i, j] = Math.Min(d[i, j], d[i - 2, j - 2] + 1);
            }
        }
        return d[n, m];
    }

    /// <summary>Jaro similarity in [0, 1]; two empty strings score 1 and one empty string scores 0.</summary>
    public static double Jaro(string a, string b) => Jaro(CodePoints(a), CodePoints(b));

    /// <summary>Jaro-Winkler similarity with prefix scale 0.1 and a common prefix of at most 4 code points.</summary>
    public static double JaroWinkler(string a, string b) {
        int[] x = CodePoints(a), y = CodePoints(b);
        double j = Jaro(x, y);
        int l = 0;
        while (l < 4 && l < x.Length && l < y.Length && x[l] == y[l]) l++;
        return j + l * 0.1 * (1 - j);
    }

    /// <summary>1 - levenshtein / max(length); 1 for two empty strings.</summary>
    public static double SimilarityRatio(string a, string b) {
        int n = Math.Max(CodePoints(a).Length, CodePoints(b).Length);
        return n == 0 ? 1.0 : 1 - (double)Levenshtein(a, b) / n;
    }

    private static double Jaro(int[] a, int[] b) {
        if (a.Length == 0 && b.Length == 0) return 1.0;
        if (a.Length == 0 || b.Length == 0) return 0.0;
        int w = Math.Max(Math.Max(a.Length, b.Length) / 2 - 1, 0);
        var ma = new bool[a.Length];
        var mb = new bool[b.Length];
        int matches = 0;
        for (int i = 0; i < a.Length; i++) {
            for (int j = Math.Max(0, i - w); j < Math.Min(b.Length, i + w + 1); j++) {
                if (!mb[j] && b[j] == a[i]) { ma[i] = mb[j] = true; matches++; break; }
            }
        }
        if (matches == 0) return 0.0;
        int t = 0, k = 0;
        for (int i = 0; i < a.Length; i++) {
            if (!ma[i]) continue;
            while (!mb[k]) k++;
            if (a[i] != b[k]) t++;
            k++;
        }
        double m = matches;
        return (m / a.Length + m / b.Length + (m - t / 2.0) / m) / 3;
    }

    private static int[] CodePoints(string s) {
        ArgumentNullException.ThrowIfNull(s);
        var result = new List<int>(s.Length);
        for (int i = 0; i < s.Length; i++) {
            if (char.IsHighSurrogate(s[i]) && i + 1 < s.Length && char.IsLowSurrogate(s[i + 1])) { result.Add(char.ConvertToUtf32(s[i], s[i + 1])); i++; }
            else result.Add(s[i]);
        }
        return result.ToArray();
    }
}
