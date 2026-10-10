// SPDX-License-Identifier: Apache-2.0

/** Edit distances and similarity scores over Unicode code points (not UTF-16 units or bytes). */
public final class StringSimilarity {
    private StringSimilarity() {}

    private static int[] cps(String s) {
        if (s == null) throw new IllegalArgumentException("strings are required");
        return s.codePoints().toArray();
    }

    /** Levenshtein distance (insert, delete, substitute cost 1). */
    public static int levenshtein(String a, String b) {
        int[] x = cps(a), y = cps(b);
        int[] prev = new int[y.length + 1];
        for (int j = 0; j <= y.length; j++) prev[j] = j;
        for (int i = 1; i <= x.length; i++) {
            int[] cur = new int[y.length + 1];
            cur[0] = i;
            for (int j = 1; j <= y.length; j++) cur[j] = Math.min(Math.min(prev[j] + 1, cur[j - 1] + 1), prev[j - 1] + (x[i - 1] == y[j - 1] ? 0 : 1));
            prev = cur;
        }
        return prev[y.length];
    }

    /** Optimal string alignment distance: Levenshtein plus adjacent transposition (cost 1), no substring edited twice. */
    public static int damerauOsa(String a, String b) {
        int[] x = cps(a), y = cps(b);
        int n = x.length, m = y.length;
        int[][] d = new int[n + 1][m + 1];
        for (int i = 0; i <= n; i++) d[i][0] = i;
        for (int j = 0; j <= m; j++) d[0][j] = j;
        for (int i = 1; i <= n; i++) {
            for (int j = 1; j <= m; j++) {
                int c = x[i - 1] == y[j - 1] ? 0 : 1;
                d[i][j] = Math.min(Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1), d[i - 1][j - 1] + c);
                if (i > 1 && j > 1 && x[i - 1] == y[j - 2] && x[i - 2] == y[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
            }
        }
        return d[n][m];
    }

    /** Jaro similarity in [0, 1]; two empty strings give 1, one empty string gives 0. */
    public static double jaro(String a, String b) {
        int[] x = cps(a), y = cps(b);
        if (x.length == 0 && y.length == 0) return 1.0;
        if (x.length == 0 || y.length == 0) return 0.0;
        int w = Math.max(Math.max(x.length, y.length) / 2 - 1, 0);
        boolean[] mx = new boolean[x.length], my = new boolean[y.length];
        int m = 0;
        for (int i = 0; i < x.length; i++) {
            for (int j = Math.max(0, i - w); j < Math.min(y.length, i + w + 1); j++) {
                if (!my[j] && y[j] == x[i]) { mx[i] = true; my[j] = true; m++; break; }
            }
        }
        if (m == 0) return 0.0;
        int t = 0, k = 0;
        for (int i = 0; i < x.length; i++) {
            if (!mx[i]) continue;
            while (!my[k]) k++;
            if (x[i] != y[k]) t++;
            k++;
        }
        return ((double) m / x.length + (double) m / y.length + (m - t / 2.0) / m) / 3;
    }

    /** Jaro-Winkler similarity with prefix scale 0.1 and a common prefix of at most 4 code points. */
    public static double jaroWinkler(String a, String b) {
        double j = jaro(a, b);
        int[] x = cps(a), y = cps(b);
        int l = 0;
        while (l < 4 && l < x.length && l < y.length && x[l] == y[l]) l++;
        return j + l * 0.1 * (1 - j);
    }

    /** 1 - levenshtein / max(length) (1 for two empty strings). */
    public static double similarityRatio(String a, String b) {
        int n = Math.max(cps(a).length, cps(b).length);
        return n == 0 ? 1.0 : 1 - (double) levenshtein(a, b) / n;
    }
}
