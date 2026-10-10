# SPDX-License-Identifier: Apache-2.0
# Vectors generated from the Genlib wave 9 shared vector set; do not edit the literals by hand.
import unittest

from vector_math import cosine, dot, mmr, norm, normalize, top_k

PAIRS = [[[1, 2, 3], [4, 5, 6], 32, 0.9746318461970762],
 [[1, 0], [0, 1], 0, 0.0],
 [[1, 1], [-1, -1], -2, -0.9999999999999998],
 [[0, 0], [1, 2], 0, 0.0],
 [[3, 4], [3, 4], 25, 1.0],
 [[0.5, -1.5, 2], [2, 0.25, -1], -1.375, -0.23969749850222494]]
NORM = [[[3, 4], 5.0], [[0, 0, 0], 0.0], [[1, 1, 1, 1], 2.0], [[-2.5], 2.5]]
NORMALIZE = [[[3, 4], [0.6, 0.8]], [[0, 5], [0.0, 1.0]], [[1, 1, 1, 1], [0.5, 0.5, 0.5, 0.5]]]
TOP_K = [[[1, 0], [[1, 0], [0.99, 0.1], [0, 1], [0.7, 0.7], [-1, 0]], 0, []],
 [[1, 0], [[1, 0], [0.99, 0.1], [0, 1], [0.7, 0.7], [-1, 0]], 1, [[0, 1.0]]],
 [[1, 0],
  [[1, 0], [0.99, 0.1], [0, 1], [0.7, 0.7], [-1, 0]],
  3,
  [[0, 1.0], [1, 0.9949371890224981], [3, 0.7071067811865476]]],
 [[1, 0],
  [[1, 0], [0.99, 0.1], [0, 1], [0.7, 0.7], [-1, 0]],
  10,
  [[0, 1.0], [1, 0.9949371890224981], [3, 0.7071067811865476], [2, 0.0], [4, -1.0]]],
 [[0.2, 0.5, 0.1],
  [[0.1, 0.4, 0.2], [0.9, 0.1, 0.0], [0.2, 0.5, 0.1], [0.0, 0.0, 1.0], [0.3, 0.3, 0.3], [0.21, 0.49, 0.12]],
  3,
  [[2, 1.0], [5, 0.9990003934498585], [0, 0.956182887467515]]]]
MMR = [[[1, 0], [[1, 0], [0.99, 0.1], [0, 1], [0.7, 0.7], [-1, 0]], 3, 0.5, [0, 1, 4]],
 [[1, 0], [[1, 0], [0.99, 0.1], [0, 1], [0.7, 0.7], [-1, 0]], 3, 1.0, [0, 1, 3]],
 [[1, 0], [[1, 0], [0.99, 0.1], [0, 1], [0.7, 0.7], [-1, 0]], 3, 0.0, [0, 4, 2]],
 [[1, 0], [[1, 0], [0.99, 0.1], [0, 1], [0.7, 0.7], [-1, 0]], 5, 0.7, [0, 1, 3, 2, 4]],
 [[0.2, 0.5, 0.1],
  [[0.1, 0.4, 0.2], [0.9, 0.1, 0.0], [0.2, 0.5, 0.1], [0.0, 0.0, 1.0], [0.3, 0.3, 0.3], [0.21, 0.49, 0.12]],
  3,
  0.5,
  [2, 0, 1]],
 [[0.2, 0.5, 0.1],
  [[0.1, 0.4, 0.2], [0.9, 0.1, 0.0], [0.2, 0.5, 0.1], [0.0, 0.0, 1.0], [0.3, 0.3, 0.3], [0.21, 0.49, 0.12]],
  4,
  0.3,
  [2, 3, 1, 4]]]


class VectorMathTest(unittest.TestCase):
    def test_pairs(self):
        for a, b, d, c in PAIRS:
            self.assertAlmostEqual(dot(a, b), d, delta=1e-9)
            self.assertAlmostEqual(cosine(a, b), c, delta=1e-9)

    def test_norm_normalize(self):
        for a, n in NORM:
            self.assertAlmostEqual(norm(a), n, delta=1e-9)
        for a, expected in NORMALIZE:
            for x, y in zip(normalize(a), expected, strict=True):
                self.assertAlmostEqual(x, y, delta=1e-9)

    def test_top_k_and_mmr(self):
        for q, vs, k, expected in TOP_K:
            got = top_k(q, vs, k)
            self.assertEqual([i for i, _ in got], [i for i, _ in expected])
            for (_, s), (_, e) in zip(got, expected):
                self.assertAlmostEqual(s, e, delta=1e-9)
        for q, vs, k, lam, expected in MMR:
            self.assertEqual(mmr(q, vs, k, lam), expected)

    def test_invalid(self):
        for call in (lambda: cosine([1, 2], [1, 2, 3]), lambda: dot([], []), lambda: normalize([0, 0]),
                     lambda: top_k([1], [[1]], -1), lambda: mmr([1], [[1]], 1, 1.5)):
            with self.assertRaises(ValueError):
                call()


if __name__ == "__main__":
    unittest.main()
