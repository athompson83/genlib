// SPDX-License-Identifier: Apache-2.0

import java.util.ArrayList;
import java.util.Arrays;
import java.util.Comparator;
import java.util.List;

/**
 * Integer half-open intervals [start, end) as long[] {start, end} pairs with start < end (otherwise
 * IllegalArgumentException). Every list result is sorted and non-overlapping, with touching intervals merged.
 * Touching intervals do not overlap. Inputs are never mutated.
 */
public final class IntervalMerge {
    private IntervalMerge() {}

    private static void validate(long[][] xs) {
        for (long[] x : xs) if (x.length != 2 || x[0] >= x[1]) throw new IllegalArgumentException("bad interval");
    }

    /** Sorts and merges overlapping or touching intervals. */
    public static long[][] merge(long[][] xs) {
        validate(xs);
        long[][] sorted = new long[xs.length][];
        for (int i = 0; i < xs.length; i++) sorted[i] = xs[i].clone();
        Arrays.sort(sorted, Comparator.<long[]>comparingLong(x -> x[0]).thenComparingLong(x -> x[1]));
        List<long[]> out = new ArrayList<>();
        for (long[] x : sorted) {
            if (!out.isEmpty() && x[0] <= out.get(out.size() - 1)[1]) {
                long[] last = out.get(out.size() - 1);
                last[1] = Math.max(last[1], x[1]);
            } else out.add(x);
        }
        return out.toArray(new long[0][]);
    }

    /** The parts covered by both a and b. */
    public static long[][] intersect(long[][] a, long[][] b) {
        long[][] x = merge(a);
        long[][] y = merge(b);
        List<long[]> out = new ArrayList<>();
        int i = 0;
        int j = 0;
        while (i < x.length && j < y.length) {
            long s = Math.max(x[i][0], y[j][0]);
            long e = Math.min(x[i][1], y[j][1]);
            if (s < e) out.add(new long[] {s, e});
            if (x[i][1] < y[j][1]) i++; else j++;
        }
        return merge(out.toArray(new long[0][]));
    }

    /** The parts of a not covered by b. */
    public static long[][] subtract(long[][] a, long[][] b) {
        long[][] x = merge(a);
        long[][] y = merge(b);
        List<long[]> out = new ArrayList<>();
        for (long[] iv : x) {
            long cur = iv[0];
            long e = iv[1];
            for (long[] bv : y) {
                if (bv[1] <= cur || bv[0] >= e) continue;
                if (bv[0] > cur) out.add(new long[] {cur, bv[0]});
                cur = Math.max(cur, bv[1]);
                if (cur >= e) break;
            }
            if (cur < e) out.add(new long[] {cur, e});
        }
        return out.toArray(new long[0][]);
    }

    /** The parts of [lo, hi) not covered by xs; lo must be below hi. */
    public static long[][] gaps(long[][] xs, long lo, long hi) {
        if (lo >= hi) throw new IllegalArgumentException("bad bounds");
        return subtract(new long[][] {{lo, hi}}, xs);
    }

    /** The covered length after merging. */
    public static long total(long[][] xs) {
        long t = 0;
        for (long[] x : merge(xs)) t += x[1] - x[0];
        return t;
    }

    /** True when the two intervals share at least one point. */
    public static boolean overlaps(long[] x, long[] y) {
        validate(new long[][] {x, y});
        return x[0] < y[1] && y[0] < x[1];
    }

    /** True when some interval holds p (start inclusive, end exclusive). */
    public static boolean contains(long[][] xs, long p) {
        for (long[] x : merge(xs)) if (x[0] <= p && p < x[1]) return true;
        return false;
    }
}
