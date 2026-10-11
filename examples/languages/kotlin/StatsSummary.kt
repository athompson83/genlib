// SPDX-License-Identifier: Apache-2.0

/**
 * Descriptive statistics on a non-empty list of finite numbers: two-pass mean and sample variance (n-1; 0 for one
 * value), percentiles by linear interpolation between closest ranks (numpy default, R type 7) and a histogram over
 * strictly increasing edges. Empty input, NaN or infinity, q outside 0..100 and bad edges throw
 * IllegalArgumentException.
 */
object StatsSummary {
    /** The summary fields; variance is the sample variance and stddev its square root. */
    data class Summary(
        val count: Int, val sum: Double, val min: Double, val max: Double, val mean: Double, val median: Double,
        val variance: Double, val stddev: Double, val p25: Double, val p75: Double, val p90: Double, val p95: Double, val p99: Double,
    )

    /** Bucket counts plus the values below the first edge and above the last. */
    data class Histogram(val counts: List<Int>, val below: Int, val above: Int)

    private fun check(xs: List<Double>) {
        require(xs.isNotEmpty()) { "empty" }
        require(xs.all { it.isFinite() }) { "not finite" }
    }

    private fun sortedPercentile(s: List<Double>, q: Double): Double {
        val h = (s.size - 1) * q / 100
        val lo = Math.floor(h).toInt()
        if (lo + 1 >= s.size) return s[s.size - 1]
        return s[lo] + (h - lo) * (s[lo + 1] - s[lo])
    }

    /** The q-th percentile (0 <= q <= 100) with linear interpolation. */
    fun percentile(xs: List<Double>, q: Double): Double {
        check(xs)
        require(q >= 0 && q <= 100) { "q" }
        return sortedPercentile(xs.sorted(), q)
    }

    /** Count, sum, min, max, mean, median, sample variance, stddev and p25/p75/p90/p95/p99. */
    fun summary(xs: List<Double>): Summary {
        check(xs)
        val n = xs.size
        var sum = 0.0
        for (x in xs) sum += x
        val mean = sum / n
        var ss = 0.0
        for (x in xs) ss += (x - mean) * (x - mean)
        val v = if (n > 1) ss / (n - 1) else 0.0
        val s = xs.sorted()
        return Summary(n, sum, s[0], s[n - 1], mean, sortedPercentile(s, 50.0), v, Math.sqrt(v),
            sortedPercentile(s, 25.0), sortedPercentile(s, 75.0), sortedPercentile(s, 90.0), sortedPercentile(s, 95.0), sortedPercentile(s, 99.0))
    }

    /** Counts edges[i] <= x < edges[i+1] per bucket (the last bucket includes its upper edge). */
    fun histogram(xs: List<Double>, edges: List<Double>): Histogram {
        check(xs)
        require(edges.size >= 2 && edges.all { it.isFinite() } && (1 until edges.size).all { edges[it] > edges[it - 1] }) { "edges" }
        val counts = IntArray(edges.size - 1)
        var below = 0
        var above = 0
        val last = edges[edges.size - 1]
        for (x in xs) {
            when {
                x < edges[0] -> below++
                x > last -> above++
                x == last -> counts[counts.size - 1]++
                else -> {
                    var lo = 0
                    var hi = edges.size - 1
                    while (hi - lo > 1) {
                        val mid = (lo + hi) ushr 1
                        if (edges[mid] <= x) lo = mid else hi = mid
                    }
                    counts[lo]++
                }
            }
        }
        return Histogram(counts.toList(), below, above)
    }
}
