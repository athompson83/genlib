# SPDX-License-Identifier: Apache-2.0
import unittest

from geometry import centroid, point_in_polygon, ring_area_square_meters, signed_area, simplify

SQUARE = [[0, 0], [4, 0], [4, 4], [0, 4]]
CONCAVE = [[0, 0], [6, 0], [6, 6], [3, 3], [0, 6]]
LINE = [[0, 0], [1, 0.1], [2, -0.1], [3, 5], [4, 6], [5, 7], [6, 8.1], [7, 9], [8, 9], [9, 9]]
PIP = [(SQUARE, [2, 2], True), (SQUARE, [5, 2], False), (SQUARE, [4, 2], True), (SQUARE, [0, 0], True),
       (SQUARE, [2, 4.000001], False), (CONCAVE, [3, 4], False), (CONCAVE, [3, 2], True), (CONCAVE, [1, 5], True),
       (CONCAVE, [3, 3], True)]
SIMPLIFY = [(LINE, 1, [[0, 0], [2, -0.1], [3, 5], [7, 9], [9, 9]]),
            (LINE, 0.05, [[0, 0], [1, 0.1], [2, -0.1], [3, 5], [6, 8.1], [7, 9], [9, 9]]),
            ([[0, 0], [5, 5]], 1, [[0, 0], [5, 5]])]
RING_AREA = [([[0, 0], [1, 0], [1, 1], [0, 1]], 12391399902.070992),
             ([[-0.13, 51.5], [-0.12, 51.5], [-0.12, 51.51], [-0.13, 51.51]], 771337.3090775362)]


class GeometryTests(unittest.TestCase):
    def test_point_in_polygon(self):
        for ring, point, expected in PIP:
            self.assertEqual(point_in_polygon(point, ring), expected, (ring, point))
            self.assertEqual(point_in_polygon(point, ring + [ring[0]]), expected)
        with self.assertRaises(ValueError):
            point_in_polygon([0, 0], [[0, 0], [1, 1], [0, 0]])

    def test_area_and_centroid(self):
        self.assertEqual(signed_area(SQUARE), 16.0)
        self.assertEqual(signed_area(list(reversed(SQUARE))), -16.0)
        self.assertEqual(signed_area(CONCAVE), 27.0)
        for ring, expected in ((SQUARE, [2.0, 2.0]), (CONCAVE, [3.0, 2.3333333333333335])):
            for a, b in zip(centroid(ring), expected):
                self.assertAlmostEqual(a, b, delta=1e-9)
        with self.assertRaises(ValueError):
            centroid([[0, 0], [1, 1], [2, 2]])

    def test_simplify(self):
        for points, tolerance, expected in SIMPLIFY:
            self.assertEqual(simplify(points, tolerance), expected)
        self.assertEqual(simplify([[1, 1]], 0), [[1, 1]])
        with self.assertRaises(ValueError):
            simplify(LINE, -1)

    def test_ring_area(self):
        for ring, expected in RING_AREA:
            self.assertLessEqual(abs(ring_area_square_meters(ring) - expected) / expected, 1e-9)


if __name__ == "__main__":
    unittest.main()
