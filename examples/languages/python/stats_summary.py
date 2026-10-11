# SPDX-License-Identifier: Apache-2.0
"""Descriptive statistics for a non-empty list of finite numbers.

summary() returns count, sum, min, max, mean, median, sample variance (n - 1, 0 for one value),
stddev and the 25th/75th/90th/95th/99th percentiles. Mean and variance use the two-pass algorithm.
percentile() is linear interpolation between closest ranks (numpy's default, R type 7):
h = (n-1) q / 100, result = x[floor h] + (h - floor h)(x[floor h + 1] - x[floor h]). histogram() counts
edges[i] <= x < edges[i+1], the last bucket also takes x == edges[-1], and values outside go to
below/above. Empty input, NaN/infinity, q outside 0..100 and non-increasing edges raise.
"""

import math
from dataclasses import dataclass


class StatsError(ValueError):
    """Raised for empty or non-finite input, a bad percentile or bad histogram edges."""


@dataclass(frozen=True)
class Summary:
    """Descriptive statistics of a sample."""
    count: int
    sum: float
    min: float
    max: float
    mean: float
    median: float
    variance: float
    stddev: float
    p25: float
    p75: float
    p90: float
    p95: float
    p99: float


@dataclass(frozen=True)
class Histogram:
    """Bucket counts plus the values below the first and above the last edge."""
    counts: list[int]
    below: int
    above: int


def _check(xs) -> None:
    if not xs:
        raise StatsError("empty input")
    for x in xs:
        if isinstance(x, bool) or not isinstance(x, (int, float)) or not math.isfinite(x):
            raise StatsError("values must be finite numbers")


def _pct(s: list, q: float) -> float:
    h = (len(s) - 1) * q / 100
    lo = math.floor(h)
    if lo + 1 >= len(s):
        return float(s[-1])
    return float(s[lo] + (h - lo) * (s[lo + 1] - s[lo]))


def percentile(xs, q: float) -> float:
    """The q-th percentile (0..100) by linear interpolation (R type 7)."""
    _check(xs)
    if isinstance(q, bool) or not isinstance(q, (int, float)) or not 0 <= q <= 100:
        raise StatsError("q must be between 0 and 100")
    return _pct(sorted(xs), q)


def summary(xs) -> Summary:
    """Count, sum, extremes, mean, median, sample variance, stddev and percentiles."""
    _check(xs)
    n = len(xs)
    total = float(sum(xs))
    mean = total / n
    var = sum((x - mean) ** 2 for x in xs) / (n - 1) if n > 1 else 0.0
    s = sorted(xs)
    return Summary(n, total, float(s[0]), float(s[-1]), mean, _pct(s, 50), var, math.sqrt(var),
                   _pct(s, 25), _pct(s, 75), _pct(s, 90), _pct(s, 95), _pct(s, 99))


def histogram(xs, edges) -> Histogram:
    """Counts per [edges[i], edges[i+1]) bucket, the last one closed, plus below/above."""
    _check(xs)
    if len(edges) < 2 or any(not math.isfinite(e) for e in edges) or any(b <= a for a, b in zip(edges, edges[1:])):
        raise StatsError("edges must be finite, strictly increasing and at least two")
    counts = [0] * (len(edges) - 1)
    below = above = 0
    for x in xs:
        if x < edges[0]:
            below += 1
        elif x > edges[-1]:
            above += 1
        elif x == edges[-1]:
            counts[-1] += 1
        else:
            lo, hi = 0, len(edges) - 1
            while hi - lo > 1:
                mid = (lo + hi) // 2
                if edges[mid] <= x:
                    lo = mid
                else:
                    hi = mid
            counts[lo] += 1
    return Histogram(counts, below, above)
