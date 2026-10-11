// SPDX-License-Identifier: Apache-2.0

import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;

/** Natural sort ("file2" before "file10"): ASCII digit runs compare by value, text runs by ASCII-folded code points. */
public final class NaturalSort {
    private NaturalSort() {}

    private record Run(boolean digit, int[] cps) {}

    private static boolean isDigit(int c) { return c >= '0' && c <= '9'; }

    private static List<Run> runs(int[] s) {
        List<Run> out = new ArrayList<>();
        int i = 0;
        while (i < s.length) {
            int j = i;
            boolean digit = isDigit(s[i]);
            while (j < s.length && isDigit(s[j]) == digit) j++;
            out.add(new Run(digit, Arrays.copyOfRange(s, i, j)));
            i = j;
        }
        return out;
    }

    private static int[] fold(int[] s) {
        int[] out = s.clone();
        for (int i = 0; i < out.length; i++) if (out[i] >= 'A' && out[i] <= 'Z') out[i] += 32;
        return out;
    }

    private static int sign(int c) { return Integer.signum(c); }

    private static int[] stripZeros(int[] s) {
        int i = 0;
        while (i < s.length && s[i] == '0') i++;
        return i == s.length ? new int[] {'0'} : Arrays.copyOfRange(s, i, s.length);
    }

    /** -1, 0 or 1: run by run (digit runs by value and before text runs), then fewer runs, fewer leading zeros, code points. */
    public static int naturalCompare(String a, String b) {
        int[] ca = a.codePoints().toArray();
        int[] cb = b.codePoints().toArray();
        List<Run> ra = runs(ca);
        List<Run> rb = runs(cb);
        int n = Math.min(ra.size(), rb.size());
        for (int i = 0; i < n; i++) {
            Run x = ra.get(i);
            Run y = rb.get(i);
            int c;
            if (x.digit() && y.digit()) {
                int[] na = stripZeros(x.cps());
                int[] nb = stripZeros(y.cps());
                c = Integer.compare(na.length, nb.length);
                if (c == 0) c = Arrays.compare(na, nb);
            } else if (x.digit() != y.digit()) {
                c = x.digit() ? -1 : 1;
            } else {
                c = Arrays.compare(fold(x.cps()), fold(y.cps()));
            }
            if (c != 0) return sign(c);
        }
        int c = Integer.compare(ra.size(), rb.size());
        if (c != 0) return sign(c);
        for (int i = 0; i < n; i++) {
            if (ra.get(i).digit() && rb.get(i).digit()) {
                c = Integer.compare(ra.get(i).cps().length, rb.get(i).cps().length);
                if (c != 0) return sign(c);
            }
        }
        return sign(Arrays.compare(ca, cb));
    }

    /** A new list sorted with naturalCompare (stable). */
    public static List<String> naturalSort(List<String> items) {
        List<String> out = new ArrayList<>(items);
        out.sort(NaturalSort::naturalCompare);
        return out;
    }
}
