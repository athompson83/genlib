# SPDX-License-Identifier: Apache-2.0
import unittest

from geo import bounding_box, geohash_decode, geohash_encode, haversine_meters


class GeoTests(unittest.TestCase):
    def test_haversine_vectors(self):
        self.assertEqual(round(haversine_meters(51.5074, -0.1278, 48.8566, 2.3522)), 343557)
        self.assertEqual(round(haversine_meters(10, 10, 10, 10)), 0)
        self.assertEqual(round(haversine_meters(0, 0, 0, 180)), 20015114)

    def test_geohash_vectors_and_decode(self):
        for lat, lon, precision, want in ((37.7749, -122.4194, 9, "9q8yyk8yt"), (0, 0, 5, "s0000"),
                                          (-33.8688, 151.2093, 7, "r3gx2f7")):
            self.assertEqual(geohash_encode(lat, lon, precision), want)
            cell = geohash_decode(want)
            self.assertLessEqual(abs(cell.lat - lat), cell.lat_error)
            self.assertLessEqual(abs(cell.lon - lon), cell.lon_error)
        self.assertEqual(geohash_decode("S0000"), geohash_decode("s0000"))

    def test_bounding_box(self):
        box = bounding_box(51.5, -0.12, 10000)
        self.assertLess(box.min_lat, 51.5)
        self.assertGreater(box.max_lon, -0.12)
        for lat, lon in ((box.max_lat, -0.12), (box.min_lat, -0.12), (51.5, box.max_lon), (51.5, box.min_lon)):
            self.assertGreaterEqual(haversine_meters(51.5, -0.12, lat, lon), 10000 - 1)
        polar = bounding_box(89.95, 0, 10000)
        self.assertEqual((polar.min_lon, polar.max_lon, polar.max_lat), (-180.0, 180.0, 90.0))

    def test_validation(self):
        for args in ((91, 0, 0, 0), (0, 181, 0, 0), (0, 0, -90.5, 0)):
            with self.assertRaises(ValueError):
                haversine_meters(*args)
        for bad in ("", "abc!", "a", "0123456789bcd"):
            with self.assertRaises(ValueError):
                geohash_decode(bad)
        for precision in (0, 13):
            with self.assertRaises(ValueError):
                geohash_encode(0, 0, precision)
        with self.assertRaises(ValueError):
            bounding_box(0, 0, -1)


if __name__ == "__main__":
    unittest.main()
