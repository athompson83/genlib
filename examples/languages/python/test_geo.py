# SPDX-License-Identifier: Apache-2.0
import math
import unittest

from geo import EARTH_RADIUS_M, bounding_box, geohash_decode, geohash_encode, haversine_meters


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

    def test_bounding_box_longitude_extent(self):
        # Regression: half-width is asin(sin(r) / cos(lat)), not 2 * asin(sin(r / 2) / cos(lat)).
        box = bounding_box(60, 0, 0.1 * EARTH_RADIUS_M)
        half_width = math.radians(box.max_lon)
        want = math.asin(math.sin(0.1) / math.cos(math.radians(60)))
        self.assertLessEqual(abs(half_width - want), 1e-6 * want)
        self.assertLess(abs(half_width - 0.20101), 1e-5)
        self.assertAlmostEqual(box.min_lon, -box.max_lon, places=12)

    def test_bounding_box_contains_circle(self):
        for c_lat in (0, 45, 60, 75, -70):
            for radius in (1_000, 100_000, 1_000_000):
                box = bounding_box(c_lat, 0, radius)
                d = radius / EARTH_RADIUS_M
                p1 = math.radians(c_lat)
                for i in range(360):
                    t = math.radians(i)
                    p2 = math.asin(math.sin(p1) * math.cos(d) + math.cos(p1) * math.sin(d) * math.cos(t))
                    l2 = math.atan2(math.sin(t) * math.sin(d) * math.cos(p1),
                                    math.cos(d) - math.sin(p1) * math.sin(p2))
                    lat, lon = math.degrees(p2), math.degrees(l2)
                    self.assertTrue(box.min_lat - 1e-9 <= lat <= box.max_lat + 1e-9
                                    and box.min_lon - 1e-9 <= lon <= box.max_lon + 1e-9,
                                    f"center {c_lat}, radius {radius}, bearing {i}: {lat},{lon} outside {box}")

    def test_bounding_box_antimeridian_spans_all_longitudes(self):
        for c_lon, bearing in ((179.9, 90), (-179.9, 270)):
            box = bounding_box(10, c_lon, 50_000)
            self.assertEqual((box.min_lon, box.max_lon), (-180.0, 180.0))
            d, p1, t = 50_000 / EARTH_RADIUS_M, math.radians(10), math.radians(bearing)
            p2 = math.asin(math.sin(p1) * math.cos(d) + math.cos(p1) * math.sin(d) * math.cos(t))
            l2 = math.radians(c_lon) + math.atan2(math.sin(t) * math.sin(d) * math.cos(p1),
                                                  math.cos(d) - math.sin(p1) * math.sin(p2))
            lat, lon = math.degrees(p2), (math.degrees(l2) + 540) % 360 - 180
            self.assertGreater(abs(lon), 179.5)
            self.assertTrue(box.min_lat <= lat <= box.max_lat and box.min_lon <= lon <= box.max_lon, (lat, lon, box))

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
