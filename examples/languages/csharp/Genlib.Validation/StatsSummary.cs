// SPDX-License-Identifier: Apache-2.0
namespace Genlib.Validation;

/// <summary>Descriptive statistics of a non-empty sample (variance is the sample variance, n-1; 0 for one value).</summary>
public sealed record StatsResult(int Count, double Sum, double Min, double Max, double Mean, double Median, double Variance,
    double Stddev, double P25, double P75, double P90, double P95, double P99);

/// <summary>Histogram bucket counts plus the values below the first edge and above the last.</summary>
public sealed record HistogramResult(IReadOnlyList<int> Counts, int Below, int Above);

/// <summary>
/// Descriptive statistics on a non-empty list of finite numbers. Percentiles interpolate linearly between closest ranks
/// (numpy default / R type 7); mean and variance use the two-pass algorithm. Empty input, NaN/infinity, q outside 0..100 and
/// bad edges throw <see cref="ArgumentException"/>.
/// </summary>
public static class StatsSummary {
    private static void CheckValues(IReadOnlyList<double> xs) {
        ArgumentNullException.ThrowIfNull(xs);
        if (xs.Count == 0) throw new ArgumentException("empty");
        foreach (double x in xs) if (!double.IsFinite(x)) throw new ArgumentException("not finite");
    }

    private static double SortedPercentile(double[] s, double q) {
        double h = (s.Length - 1) * q / 100;
        int lo = (int)Math.Floor(h);
        if (lo + 1 >= s.Length) return s[^1];
        return s[lo] + (h - lo) * (s[lo + 1] - s[lo]);
    }

    /// <summary>The q-th percentile (0 &lt;= q &lt;= 100) by linear interpolation: h = (n-1)q/100, x[lo] + (h-lo)(x[lo+1]-x[lo]).</summary>
    public static double Percentile(IReadOnlyList<double> xs, double q) {
        CheckValues(xs);
        if (!(q >= 0 && q <= 100)) throw new ArgumentException("q");
        var s = xs.ToArray();
        Array.Sort(s);
        return SortedPercentile(s, q);
    }

    /// <summary>Count, sum, min, max, mean, median, sample variance, standard deviation and the 25/75/90/95/99th percentiles.</summary>
    public static StatsResult Summary(IReadOnlyList<double> xs) {
        CheckValues(xs);
        int n = xs.Count;
        double sum = 0;
        foreach (double x in xs) sum += x;
        double mean = sum / n;
        double sq = 0;
        foreach (double x in xs) sq += (x - mean) * (x - mean);
        double variance = n > 1 ? sq / (n - 1) : 0.0;
        var s = xs.ToArray();
        Array.Sort(s);
        return new StatsResult(n, sum, s[0], s[^1], mean, SortedPercentile(s, 50), variance, Math.Sqrt(variance),
            SortedPercentile(s, 25), SortedPercentile(s, 75), SortedPercentile(s, 90), SortedPercentile(s, 95), SortedPercentile(s, 99));
    }

    /// <summary>Counts values per bucket edges[i] &lt;= x &lt; edges[i+1] (the last bucket includes its upper edge); edges must be finite and strictly increasing.</summary>
    public static HistogramResult Histogram(IReadOnlyList<double> xs, IReadOnlyList<double> edges) {
        CheckValues(xs);
        ArgumentNullException.ThrowIfNull(edges);
        if (edges.Count < 2 || edges.Any(e => !double.IsFinite(e))) throw new ArgumentException("edges");
        for (int i = 1; i < edges.Count; i++) if (!(edges[i] > edges[i - 1])) throw new ArgumentException("edges");
        var counts = new int[edges.Count - 1];
        int below = 0, above = 0;
        foreach (double x in xs) {
            if (x < edges[0]) below++;
            else if (x > edges[^1]) above++;
            else if (x == edges[^1]) counts[^1]++;
            else {
                int lo = 0, hi = edges.Count - 1;
                while (hi - lo > 1) {
                    int mid = (lo + hi) / 2;
                    if (edges[mid] <= x) lo = mid; else hi = mid;
                }
                counts[lo]++;
            }
        }
        return new HistogramResult(counts, below, above);
    }
}
