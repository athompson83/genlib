# SPDX-License-Identifier: Apache-2.0
# Vectors generated from the Genlib wave 12 shared vector set; do not edit the literals by hand.
import unittest
import math

from stats_summary import StatsError, histogram, percentile, summary

SUMMARY = [
    [[1], {'count': 1, 'sum': 1.0, 'min': 1.0, 'max': 1.0, 'mean': 1.0, 'median': 1.0, 'variance': 0.0, 'stddev': 0.0, 'p25': 1.0, 'p75': 1.0, 'p90': 1.0, 'p95': 1.0, 'p99': 1.0}],
    [[1, 2], {'count': 2, 'sum': 3.0, 'min': 1.0, 'max': 2.0, 'mean': 1.5, 'median': 1.5, 'variance': 0.5, 'stddev': 0.7071067811865476, 'p25': 1.25, 'p75': 1.75, 'p90': 1.9, 'p95': 1.95, 'p99': 1.99}],
    [[3, 1, 2], {'count': 3, 'sum': 6.0, 'min': 1.0, 'max': 3.0, 'mean': 2.0, 'median': 2.0, 'variance': 1.0, 'stddev': 1.0, 'p25': 1.5, 'p75': 2.5, 'p90': 2.8, 'p95': 2.9, 'p99': 2.98}],
    [[2, 4, 4, 4, 5, 5, 7, 9], {'count': 8, 'sum': 40.0, 'min': 2.0, 'max': 9.0, 'mean': 5.0, 'median': 4.5, 'variance': 4.571428571428571, 'stddev': 2.138089935299395, 'p25': 4.0, 'p75': 5.5, 'p90': 7.6, 'p95': 8.3, 'p99': 8.86}],
    [[1.5, 2.5, -3.25, 10, 0], {'count': 5, 'sum': 10.75, 'min': -3.25, 'max': 10.0, 'mean': 2.15, 'median': 1.5, 'variance': 23.9875, 'stddev': 4.897703543498729, 'p25': 0.0, 'p75': 2.5, 'p90': 7.000000000000001, 'p95': 8.499999999999998, 'p99': 9.7}],
    [[10, 20, 30, 40, 50, 60, 70, 80, 90, 100], {'count': 10, 'sum': 550.0, 'min': 10.0, 'max': 100.0, 'mean': 55.0, 'median': 55.0, 'variance': 916.6666666666666, 'stddev': 30.276503540974915, 'p25': 32.5, 'p75': 77.5, 'p90': 91.0, 'p95': 95.5, 'p99': 99.1}],
    [[1000000004.0, 1000000007.0, 1000000013.0, 1000000016.0], {'count': 4, 'sum': 4000000040.0, 'min': 1000000004.0, 'max': 1000000016.0, 'mean': 1000000010.0, 'median': 1000000010.0, 'variance': 30.0, 'stddev': 5.477225575051661, 'p25': 1000000006.25, 'p75': 1000000013.75, 'p90': 1000000015.1, 'p95': 1000000015.55, 'p99': 1000000015.91}],
]

PERCENTILE = [
    [[2, 4, 4, 4, 5, 5, 7, 9], 0, 2.0],
    [[2, 4, 4, 4, 5, 5, 7, 9], 10, 3.4],
    [[2, 4, 4, 4, 5, 5, 7, 9], 33.3, 4.0],
    [[2, 4, 4, 4, 5, 5, 7, 9], 50, 4.5],
    [[2, 4, 4, 4, 5, 5, 7, 9], 99.9, 8.986],
    [[2, 4, 4, 4, 5, 5, 7, 9], 100, 9.0],
    [[1.5, 2.5, -3.25, 10, 0], 0, -3.25],
    [[1.5, 2.5, -3.25, 10, 0], 10, -1.95],
    [[1.5, 2.5, -3.25, 10, 0], 33.3, 0.4979999999999998],
    [[1.5, 2.5, -3.25, 10, 0], 50, 1.5],
    [[1.5, 2.5, -3.25, 10, 0], 99.9, 9.970000000000002],
    [[1.5, 2.5, -3.25, 10, 0], 100, 10.0],
    [[10, 20, 30, 40, 50, 60, 70, 80, 90, 100], 0, 10.0],
    [[10, 20, 30, 40, 50, 60, 70, 80, 90, 100], 10, 19.0],
    [[10, 20, 30, 40, 50, 60, 70, 80, 90, 100], 33.3, 39.97],
    [[10, 20, 30, 40, 50, 60, 70, 80, 90, 100], 50, 55.0],
    [[10, 20, 30, 40, 50, 60, 70, 80, 90, 100], 99.9, 99.91],
    [[10, 20, 30, 40, 50, 60, 70, 80, 90, 100], 100, 100.0],
]

HISTOGRAM = [
    [[1, 2, 2.5, 3, 5, 9, -1, 10, 11], [0, 2, 5, 10], {'counts': [1, 3, 3], 'below': 1, 'above': 1}],
    [[0.5], [0, 1], {'counts': [1], 'below': 0, 'above': 0}],
]

INVALID_SUMMARY = [
    [],
]

INVALID_PERCENTILE = [
    [[1, 2], -1],
    [[1, 2], 100.5],
]

INVALID_EDGES = [
    [0],
    [1, 1],
    [2, 1],
]


def close(a, b):
    return math.isclose(a, b, rel_tol=1e-9, abs_tol=1e-12)


class StatsSummaryTest(unittest.TestCase):
    def test_summary(self):
        for xs, expected in SUMMARY:
            got = summary(xs)
            for key, value in expected.items():
                self.assertTrue(close(getattr(got, key), value), (xs, key, getattr(got, key), value))
            self.assertEqual(got.count, expected["count"])

    def test_percentile(self):
        for xs, q, expected in PERCENTILE:
            self.assertTrue(close(percentile(xs, q), expected), (xs, q))

    def test_histogram(self):
        for xs, edges, expected in HISTOGRAM:
            h = histogram(xs, edges)
            self.assertEqual({"counts": h.counts, "below": h.below, "above": h.above}, expected)

    def test_invalid(self):
        for xs in INVALID_SUMMARY:
            with self.assertRaises(StatsError):
                summary(xs)
        for xs, q in INVALID_PERCENTILE:
            with self.assertRaises(StatsError, msg=q):
                percentile(xs, q)
        for edges in INVALID_EDGES:
            with self.assertRaises(StatsError, msg=edges):
                histogram([1], edges)
        for bad in [[float("nan")], [1, float("inf")], [True]]:
            with self.assertRaises(StatsError, msg=bad):
                summary(bad)


if __name__ == "__main__":
    unittest.main()
