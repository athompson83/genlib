# SPDX-License-Identifier: Apache-2.0
import unittest

from tile_math import lon_lat_to_mercator, lon_lat_to_tile, quadkey_to_tile, tile_bounds, tile_to_quadkey

TILES = [(-122.4194, 37.7749, 12, 655, 1583), (0, 0, 0, 0, 0), (2.3522, 48.8566, 15, 16598, 11273),
         (179.9999, -89.9, 3, 7, 7), (-180, 85.1, 2, 0, 0)]
BOUNDS = [(0, 0, 0, [-180.0, -85.0511287798066, 180.0, 85.0511287798066]),
          (655, 1583, 12, [-122.431640625, 37.718590325588146, -122.34375, 37.78808138412046]),
          (1, 1, 1, [0.0, -85.0511287798066, 180.0, 0.0])]
QUADKEYS = [(3, 5, 3, "213"), (655, 1583, 12, "023010203333"), (0, 0, 1, "0")]
MERCATOR = [(0, 0, [0.0, -7.081154551613622e-10]), (-122.4194, 37.7749, [-13627665.271218073, 4547675.354340557]),
            (180, 85.05112877980659, [20037508.342789244, 20037508.342789244])]


class TileMathTests(unittest.TestCase):
    def test_tiles(self):
        for lon, lat, z, x, y in TILES:
            self.assertEqual(lon_lat_to_tile(lon, lat, z), (x, y))
        for args in ((0, 0, 25), (0, 0, -1), (181, 0, 1), (float("nan"), 0, 1), (0, float("inf"), 1), (0, 0, 1.5)):
            with self.assertRaises(ValueError, msg=repr(args)):
                lon_lat_to_tile(*args)

    def test_bounds(self):
        for x, y, z, expected in BOUNDS:
            for a, b in zip(tile_bounds(x, y, z), expected):
                self.assertAlmostEqual(a, b, delta=1e-9)
        for args in ((1, 0, 0), (0, 2, 1), (-1, 0, 3)):
            with self.assertRaises(ValueError):
                tile_bounds(*args)

    def test_quadkeys(self):
        for x, y, z, key in QUADKEYS:
            self.assertEqual(tile_to_quadkey(x, y, z), key)
            self.assertEqual(quadkey_to_tile(key), (x, y, z))
        self.assertEqual(quadkey_to_tile(""), (0, 0, 0))
        self.assertEqual(tile_to_quadkey(0, 0, 0), "")
        with self.assertRaises(ValueError):
            quadkey_to_tile("0124")

    def test_mercator(self):
        for lon, lat, expected in MERCATOR:
            for a, b in zip(lon_lat_to_mercator(lon, lat), expected):
                self.assertAlmostEqual(a, b, delta=1e-6)
        with self.assertRaises(ValueError):
            lon_lat_to_mercator(0, 85.06)


if __name__ == "__main__":
    unittest.main()
