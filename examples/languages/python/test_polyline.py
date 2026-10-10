# SPDX-License-Identifier: Apache-2.0
import unittest

from polyline import decode_polyline, encode_polyline

GOOGLE = [(38.5, -120.2), (40.7, -120.95), (43.252, -126.453)]
P6 = [(47.6062, -122.3321), (47.6205, -122.3493)]


class PolylineTests(unittest.TestCase):
    def close(self, actual, expected, precision):
        self.assertEqual(len(actual), len(expected))
        for (a, b), (c, d) in zip(actual, expected):
            self.assertLessEqual(abs(a - c), 0.5 * 10 ** -precision)
            self.assertLessEqual(abs(b - d), 0.5 * 10 ** -precision)

    def test_vectors(self):
        self.assertEqual(encode_polyline(GOOGLE), "_p~iF~ps|U_ulLnnqC_mqNvxq`@")
        self.close(decode_polyline("_p~iF~ps|U_ulLnnqC_mqNvxq`@"), GOOGLE, 5)
        self.assertEqual(encode_polyline(P6, 6), "ozsxyAf{pihFw|Z~q`@")
        self.close(decode_polyline("ozsxyAf{pihFw|Z~q`@", 6), P6, 6)
        self.assertEqual(encode_polyline([]), "")
        self.assertEqual(decode_polyline(""), [])

    def test_round_trip_and_rounding(self):
        pts = [(0.000005, -0.000005), (-89.99999, 179.99999), (12.345674, -98.765436)]
        self.close(decode_polyline(encode_polyline(pts)), pts, 5)
        self.assertEqual(decode_polyline(encode_polyline([(0.000005, -0.000005)])), [(0.00001, -0.00001)])

    def test_rejects(self):
        for bad in ("_p~iF~ps|U_", "_p~iF", " ??", "\x7f?"):
            with self.assertRaises(ValueError, msg=repr(bad)):
                decode_polyline(bad)
        with self.assertRaises(ValueError):
            encode_polyline([(float("nan"), 0)])
        with self.assertRaises(ValueError):
            encode_polyline(GOOGLE, -1)


if __name__ == "__main__":
    unittest.main()
