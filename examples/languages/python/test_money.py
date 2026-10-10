# SPDX-License-Identifier: Apache-2.0
import unittest

from money import allocate, apply_rate, format_minor, to_minor


class MoneyTests(unittest.TestCase):
    def test_to_minor(self):
        for args, want in [(("12.34", "USD"), 1234), (("-0.5", "USD"), -50), (("1000", "JPY"), 1000),
                           (("1.234", "BHD"), 1234), (("7", "USD"), 700)]:
            self.assertEqual(to_minor(*args), want)
        for args in [("1.5", "JPY"), ("12.345", "USD"), ("1,000.00", "USD"), (".5", "USD"), ("5.", "USD"),
                     ("1e3", "USD"), (" 1", "USD"), ("+1", "USD"), ("12", "XXX"), ("12", "usd")]:
            with self.subTest(args=args), self.assertRaises(ValueError):
                to_minor(*args)
        with self.assertRaises(OverflowError):
            to_minor("92233720368547758.08", "USD")

    def test_format_minor(self):
        for args, want in [((1234, "USD"), "12.34"), ((-5, "USD"), "-0.05"), ((500, "JPY"), "500"),
                           ((1, "BHD"), "0.001"), ((0, "EUR"), "0.00")]:
            self.assertEqual(format_minor(*args), want)

    def test_apply_rate(self):
        for args, want in [((1999, "0.0825"), 165), ((25, "0.5"), 12), ((35, "0.5"), 18), ((-25, "0.5"), -12),
                           ((1000, "1.07"), 1070)]:
            self.assertEqual(apply_rate(*args), want)
        for bad in ("0.0000000001", "1e2", ""):
            with self.subTest(bad=bad), self.assertRaises(ValueError):
                apply_rate(1, bad)
        with self.assertRaises(OverflowError):
            apply_rate(2**62, "2")

    def test_allocate(self):
        self.assertEqual(allocate(100, [1, 1, 1]), [34, 33, 33])
        self.assertEqual(allocate(5, [3, 7]), [2, 3])
        self.assertEqual(allocate(-100, [1, 1, 1]), [-34, -33, -33])
        self.assertEqual(allocate(1000, [0, 1]), [0, 1000])
        self.assertEqual(allocate(1, [3, 7]), [0, 1])
        self.assertEqual(allocate(1, [0, 1, 1]), [0, 1, 0])
        self.assertEqual(allocate(10, [1, 8]), [1, 9])
        for bad in ([], [0, 0], [1, -1]):
            with self.subTest(bad=bad), self.assertRaises(ValueError):
                allocate(10, bad)


if __name__ == "__main__":
    unittest.main()
