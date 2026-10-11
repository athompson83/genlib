# SPDX-License-Identifier: Apache-2.0
# Vectors generated from the Genlib wave 12 shared vector set; do not edit the literals by hand.
import unittest
from interval_merge import IntervalError, contains, gaps, intersect, merge, overlaps, subtract, total

MERGE = [
    [[[1, 3], [2, 6], [8, 10], [15, 18], [18, 20]], [[1, 6], [8, 10], [15, 20]]],
    [[[5, 7], [1, 2], [2, 3]], [[1, 3], [5, 7]]],
    [[], []],
    [[[-5, -1], [-3, 4]], [[-5, 4]]],
]

INTERSECT = [
    [[[1, 3], [2, 6], [8, 10], [15, 18], [18, 20]], [[0, 2], [5, 9], [17, 30]], [[1, 2], [5, 6], [8, 9], [17, 20]]],
    [[[1, 2]], [[2, 3]], []],
    [[[0, 100]], [[10, 20], [30, 40]], [[10, 20], [30, 40]]],
]

SUBTRACT = [
    [[[1, 3], [2, 6], [8, 10], [15, 18], [18, 20]], [[0, 2], [5, 9], [17, 30]], [[2, 5], [9, 10], [15, 17]]],
    [[[0, 10]], [[2, 3], [5, 7]], [[0, 2], [3, 5], [7, 10]]],
    [[[0, 10]], [[0, 10]], []],
    [[[0, 10]], [], [[0, 10]]],
]

GAPS = [
    [[[1, 3], [2, 6], [8, 10], [15, 18], [18, 20]], 0, 25, [[0, 1], [6, 8], [10, 15], [20, 25]]],
    [[], 3, 5, [[3, 5]]],
]

TOTAL = [
    [[[1, 3], [2, 6], [8, 10], [15, 18], [18, 20]], 12],
    [[[0, 2], [5, 9], [17, 30]], 19],
]

OVERLAPS = [
    [[1, 3], [2, 4], True],
    [[1, 3], [3, 4], False],
    [[5, 9], [6, 7], True],
    [[1, 2], [5, 6], False],
]

CONTAINS = [
    [[[1, 3], [2, 6], [8, 10], [15, 18], [18, 20]], 6, False],
    [[[1, 3], [2, 6], [8, 10], [15, 18], [18, 20]], 5, True],
    [[[1, 3], [2, 6], [8, 10], [15, 18], [18, 20]], 20, False],
    [[[1, 3], [2, 6], [8, 10], [15, 18], [18, 20]], 19, True],
    [[[1, 3], [2, 6], [8, 10], [15, 18], [18, 20]], 0, False],
]

INVALID = [
    [[3, 3]],
    [[5, 1]],
]


class IntervalMergeTest(unittest.TestCase):
    def test_set_operations(self):
        for xs, expected in MERGE:
            self.assertEqual(merge(xs), expected, xs)
        for a, b, expected in INTERSECT:
            self.assertEqual(intersect(a, b), expected, (a, b))
        for a, b, expected in SUBTRACT:
            self.assertEqual(subtract(a, b), expected, (a, b))
        for xs, lo, hi, expected in GAPS:
            self.assertEqual(gaps(xs, lo, hi), expected, (xs, lo, hi))
        for xs, expected in TOTAL:
            self.assertEqual(total(xs), expected, xs)

    def test_predicates(self):
        for x, y, expected in OVERLAPS:
            self.assertEqual(overlaps(x, y), expected, (x, y))
        for xs, p, expected in CONTAINS:
            self.assertEqual(contains(xs, p), expected, p)

    def test_invalid(self):
        for xs in INVALID:
            with self.assertRaises(IntervalError, msg=xs):
                merge(xs)
        with self.assertRaises(IntervalError):
            gaps([], 5, 5)
        with self.assertRaises(IntervalError):
            overlaps([1, 2], [3, 3])
        self.assertEqual(merge([[-(2**53), 2**53]]), [[-(2**53), 2**53]])


if __name__ == "__main__":
    unittest.main()
