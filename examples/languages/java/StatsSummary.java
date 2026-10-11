// SPDX-License-Identifier: Apache-2.0

import java.util.Arrays;

/**
 * Descriptive statistics on a non-empty array of finite numbers: two-pass mean and sample variance (n-1; 0 for one
 * value), percentiles by linear interpolation between closest ranks (numpy default, R type 7) and a histogram over
 * strictly increasing edges. Empty input, NaN or infinity, q outside 0..100 and bad edges throw
 * IllegalArgumentException.
 */
public final class StatsSummary {
    /** The summary fields; variance is the sample variance and stddev its square root. */
    public record Summary(int count, double sum, double min, double max, double mean, double median, double variance,
                          double stddev, double p25, double p75, double p90, double p95, double p99) {}

    /** Bucket counts plus the values below the first edge and above the last. */
    public record Histogram(int[] counts, int below, int above) {}

    private StatsSummary() {}

    private static void check(double[] xs) {
        if (xs.length == 0) throw new IllegalArgumentException("empty");
        for (double x : xs) if (!Double.isFinite(x)) throw new IllegalArgumentException("not finite");
    }

    private static double sortedPercentile(double[] s, double q) {
        double h = (s.length - 1) * q / 100;
        int lo = (int) Math.floor(h);
        if (lo + 1 >= s.length) return s[s.length - 1];
        return s[lo] + (h - lo) * (s[lo + 1] - s[lo]);
    }

    /** The q-th percentile (0 <= q <= 100) with linear interpolation. */
    public static double percentile(double[] xs, double q) {
        check(xs);
        if (!(q >= 0 && q <= 100)) throw new IllegalArgumentException("q");
        double[] s = xs.clone();
        Arrays.sort(s);
        return sortedPercentile(s, q);
    }

    /** Count, sum, min, max, mean, median, sample variance, stddev and p25/p75/p90/p95/p99. */
    public static Summary summary(double[] xs) {
        check(xs);
        int n = xs.length;
        double sum = 0;
        for (double x : xs) sum += x;
        double mean = sum / n;
        double ss = 0;
        for (double x : xs) ss += (x - mean) * (x - mean);
        double var = n > 1 ? ss / (n - 1) : 0.0;
        double[] s = xs.clone();
        Arrays.sort(s);
        return new Summary(n, sum, s[0], s[n - 1], mean, sortedPercentile(s, 50), var, Math.sqrt(var),
            sortedPercentile(s, 25), sortedPercentile(s, 75), sortedPercentile(s, 90), sortedPercentile(s, 95), sortedPercentile(s, 99));
    }

    /** Counts edges[i] <= x < edges[i+1] per bucket (the last bucket includes its upper edge). */
    public static Histogram histogram(double[] xs, double[] edges) {
        check(xs);
        if (edges.length < 2) throw new IllegalArgumentException("edges");
        for (int i = 0; i < edges.length; i++) {
            if (!Double.isFinite(edges[i]) || (i > 0 && !(edges[i] > edges[i - 1]))) throw new IllegalArgumentException("edges");
        }
        int[] counts = new int[edges.length - 1];
        int below = 0;
        int above = 0;
        double last = edges[edges.length - 1];
        for (double x : xs) {
            if (x < edges[0]) below++;
            else if (x > last) above++;
            else if (x == last) counts[counts.length - 1]++;
            else {
                int lo = 0;
                int hi = edges.length - 1;
                while (hi - lo > 1) {
                    int mid = (lo + hi) >>> 1;
                    if (edges[mid] <= x) lo = mid; else hi = mid;
                }
                counts[lo]++;
            }
        }
        return new Histogram(counts, below, above);
    }
}
