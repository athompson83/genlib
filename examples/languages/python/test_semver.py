# SPDX-License-Identifier: Apache-2.0
import random
import unittest

from semver import Version, compare, parse, satisfies, sort_versions

SORTED = ["0.9.9", "1.0.0-alpha", "1.0.0-alpha.1", "1.0.0-alpha.beta", "1.0.0-beta", "1.0.0-beta.2",
          "1.0.0-beta.11", "1.0.0-rc.1", "1.0.0", "1.0.0+build.5", "2.0.0"]
SATISFIES = [
    ("1.2.3", "^1.0.0", True), ("2.0.0", "^1.0.0", False), ("0.2.5", "^0.2.3", True),
    ("0.3.0", "^0.2.3", False), ("0.0.4", "^0.0.3", False), ("1.2.9", "~1.2.3", True),
    ("1.3.0", "~1.2.3", False), ("1.5.0", "1.x", True), ("1.5.0", ">=1.2.0 <1.5.0", False),
    ("1.4.9", ">=1.2.0 <1.5.0", True), ("3.1.0", "^1.0.0 || ^3.0.0", True),
    ("1.2.3-beta.2", "^1.2.3-beta.1", True), ("1.2.4-beta.1", "^1.2.3-beta.1", False),
    ("1.3.0-rc.1", "^1.2.0", False), ("1.2.0", "1.0.0 - 1.2.0", True), ("1.2.1", "1.0.0 - 1.2.0", False),
    ("0.0.1", "*", True), ("2.0.0", "<=1.x", False),
]


class SemverTests(unittest.TestCase):
    def test_sort_vector(self):
        shuffled = SORTED[:]
        random.Random(7).shuffle(shuffled)
        # Keep the equal pair in input order so the stable sort is checked.
        shuffled.remove("1.0.0+build.5")
        shuffled.insert(shuffled.index("1.0.0") + 1, "1.0.0+build.5")
        self.assertEqual(sort_versions(shuffled), SORTED)
        self.assertEqual(compare("1.0.0", "1.0.0+build.5"), 0)

    def test_satisfies_vectors(self):
        for version, rng, expected in SATISFIES:
            self.assertEqual(satisfies(version, rng), expected, (version, rng))

    def test_more_ranges(self):
        self.assertTrue(satisfies("1.9.9", "<=1.x"))
        self.assertTrue(satisfies("0.0.3", "^0.0.3"))
        self.assertTrue(satisfies("1.2.3", ">= 1.2.3"))
        self.assertTrue(satisfies("2.3.9", "1.2 - 2.3"))
        self.assertFalse(satisfies("2.4.0", "1.2 - 2.3"))
        self.assertFalse(satisfies("1.0.0-rc.1", "*"))
        self.assertFalse(satisfies("1.9.0", ">1.x"))
        self.assertTrue(satisfies("2.0.0", ">1.x"))
        self.assertTrue(satisfies("1.2.3", "1.2.3"))
        self.assertFalse(satisfies("1.0.0", "<0.x"))

    def test_parse(self):
        self.assertEqual(parse("1.2.3-rc.1+b.7"), Version(1, 2, 3, ("rc", 1), ("b", "7")))
        self.assertEqual(str(parse("1.2.3-rc.1+b.7")), "1.2.3-rc.1+b.7")
        for bad in ("1.2", "01.2.3", "1.2.3-01", "v1.2.3", "1.2.3-", "1.2.3+", " 1.2.3", "1.2.3-a..b"):
            with self.assertRaises(ValueError, msg=bad):
                parse(bad)
        with self.assertRaises(ValueError):
            satisfies("1.2.3", ">=abc")


if __name__ == "__main__":
    unittest.main()
