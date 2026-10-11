// SPDX-License-Identifier: Apache-2.0
// Descriptive statistics on a non-empty list of finite numbers: count, sum, min, max, mean, median, sample variance
// (n-1; 0 for one value), standard deviation and percentiles by linear interpolation between closest ranks (numpy
// default / R type 7). Mean and variance use the two-pass algorithm. histogram buckets values by strictly increasing
// edges, the last bucket including its upper edge.

public enum StatsSummaryError: Error, Equatable {
    case invalidInput(String)
}

public enum StatsSummary {
    /// The result of summary(_:).
    public struct Summary: Equatable {
        public let count: Int
        public let sum, min, max, mean, median, variance, stddev, p25, p75, p90, p95, p99: Double
    }

    /// Bucket counts plus the values below the first edge and above the last.
    public struct Histogram: Equatable {
        public let counts: [Int]
        public let below: Int
        public let above: Int
    }

    private static func check(_ xs: [Double]) throws {
        guard !xs.isEmpty else { throw StatsSummaryError.invalidInput("empty") }
        guard xs.allSatisfy(\.isFinite) else { throw StatsSummaryError.invalidInput("not finite") }
    }

    /// The qth percentile (0...100) with linear interpolation (R type 7).
    public static func percentile(_ xs: [Double], _ q: Double) throws -> Double {
        try check(xs)
        guard q >= 0, q <= 100 else { throw StatsSummaryError.invalidInput("q") }
        let s = xs.sorted()
        let h = Double(s.count - 1) * q / 100
        let lo = Int(h.rounded(.down))
        if lo + 1 >= s.count { return s[s.count - 1] }
        return s[lo] + (h - Double(lo)) * (s[lo + 1] - s[lo])
    }

    /// Count, sum, extremes, mean, median, sample variance, stddev and the 25/75/90/95/99th percentiles.
    public static func summary(_ xs: [Double]) throws -> Summary {
        try check(xs)
        let n = xs.count
        let total = xs.reduce(0, +)
        let mean = total / Double(n)
        let squares = xs.reduce(0) { $0 + ($1 - mean) * ($1 - mean) }
        let variance = n > 1 ? squares / Double(n - 1) : 0
        return Summary(
            count: n, sum: total, min: xs.min()!, max: xs.max()!, mean: mean, median: try percentile(xs, 50),
            variance: variance, stddev: variance.squareRoot(), p25: try percentile(xs, 25), p75: try percentile(xs, 75),
            p90: try percentile(xs, 90), p95: try percentile(xs, 95), p99: try percentile(xs, 99))
    }

    /// Counts values into buckets edges[i] <= x < edges[i+1] (the last bucket also takes x == edges.last).
    public static func histogram(_ xs: [Double], _ edges: [Double]) throws -> Histogram {
        try check(xs)
        guard edges.count >= 2, edges.allSatisfy(\.isFinite), zip(edges, edges.dropFirst()).allSatisfy({ $0 < $1 }) else {
            throw StatsSummaryError.invalidInput("edges")
        }
        var counts = Array(repeating: 0, count: edges.count - 1), below = 0, above = 0
        for x in xs {
            if x < edges[0] {
                below += 1
            } else if x > edges[edges.count - 1] {
                above += 1
            } else if x == edges[edges.count - 1] {
                counts[counts.count - 1] += 1
            } else {
                var lo = 0, hi = edges.count - 1
                while hi - lo > 1 {
                    let mid = (lo + hi) / 2
                    if edges[mid] <= x { lo = mid } else { hi = mid }
                }
                counts[lo] += 1
            }
        }
        return Histogram(counts: counts, below: below, above: above)
    }
}
