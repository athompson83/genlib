// SPDX-License-Identifier: Apache-2.0
/// Descriptive statistics on a non-empty list of finite numbers: count, sum, min, max, mean, median, sample variance
/// (n-1; 0 for one value), standard deviation and percentiles by linear interpolation between closest ranks (numpy
/// default / R type 7). Mean and variance use the two-pass algorithm. [histogram] buckets values by strictly increasing
/// edges, the last bucket including its upper edge. Failures throw [StatsException].
library;

import 'dart:math' as math;

/// An empty input, a non-finite value, a percentile outside 0..100 or bad histogram edges.
class StatsException implements Exception {
  final String message;
  const StatsException(this.message);
  @override
  String toString() => 'StatsException: $message';
}

/// The result of [summary].
class StatsSummary {
  final int count;
  final double sum, min, max, mean, median, variance, stddev, p25, p75, p90, p95, p99;
  const StatsSummary({
    required this.count,
    required this.sum,
    required this.min,
    required this.max,
    required this.mean,
    required this.median,
    required this.variance,
    required this.stddev,
    required this.p25,
    required this.p75,
    required this.p90,
    required this.p95,
    required this.p99,
  });
}

/// Bucket counts plus the values below the first edge and above the last.
class Histogram {
  final List<int> counts;
  final int below, above;
  const Histogram(this.counts, this.below, this.above);
}

void _check(List<num> xs) {
  if (xs.isEmpty) throw const StatsException('empty');
  for (final x in xs) {
    if (!x.isFinite) throw const StatsException('not finite');
  }
}

double _sum(List<num> xs) {
  var s = 0.0;
  for (final x in xs) {
    s += x;
  }
  return s;
}

/// The [q]th percentile (0..100) of [xs] with linear interpolation (R type 7).
double percentile(List<num> xs, num q) {
  _check(xs);
  if (!(q >= 0 && q <= 100)) throw const StatsException('q');
  final s = [for (final x in xs) x.toDouble()]..sort();
  final h = (s.length - 1) * q / 100;
  final lo = h.floor();
  if (lo + 1 >= s.length) return s.last;
  return s[lo] + (h - lo) * (s[lo + 1] - s[lo]);
}

/// Count, sum, extremes, mean, median, sample variance, stddev and the 25/75/90/95/99th percentiles of [xs].
StatsSummary summary(List<num> xs) {
  _check(xs);
  final n = xs.length;
  final total = _sum(xs);
  final mean = total / n;
  var squares = 0.0;
  for (final x in xs) {
    squares += (x - mean) * (x - mean);
  }
  final variance = n > 1 ? squares / (n - 1) : 0.0;
  return StatsSummary(
    count: n,
    sum: total,
    min: xs.reduce(math.min).toDouble(),
    max: xs.reduce(math.max).toDouble(),
    mean: mean,
    median: percentile(xs, 50),
    variance: variance,
    stddev: math.sqrt(variance),
    p25: percentile(xs, 25),
    p75: percentile(xs, 75),
    p90: percentile(xs, 90),
    p95: percentile(xs, 95),
    p99: percentile(xs, 99),
  );
}

/// Counts [xs] into buckets edges[i] <= x < edges[i+1] (the last bucket also takes x == edges.last).
Histogram histogram(List<num> xs, List<num> edges) {
  _check(xs);
  if (edges.length < 2 || edges.any((e) => !e.isFinite)) throw const StatsException('edges');
  for (var i = 1; i < edges.length; i++) {
    if (edges[i] <= edges[i - 1]) throw const StatsException('edges');
  }
  final counts = List.filled(edges.length - 1, 0);
  var below = 0, above = 0;
  for (final x in xs) {
    if (x < edges.first) {
      below++;
    } else if (x > edges.last) {
      above++;
    } else if (x == edges.last) {
      counts[counts.length - 1]++;
    } else {
      var lo = 0, hi = edges.length - 1;
      while (hi - lo > 1) {
        final mid = (lo + hi) >> 1;
        if (edges[mid] <= x) {
          lo = mid;
        } else {
          hi = mid;
        }
      }
      counts[lo]++;
    }
  }
  return Histogram(counts, below, above);
}
