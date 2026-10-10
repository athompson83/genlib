# SPDX-License-Identifier: Apache-2.0
import unittest

from check_digits import (gtin_valid, iban_format, iban_valid, isbn10_to_13, isbn10_valid, isbn13_valid,
                          luhn_check_digit, luhn_valid)

LUHN = [("4539 1488 0343 6467", True), ("79927398713", True), ("79927398710", False), ("0", False),
        ("4539-1488-0343-6468", False), ("12a4", False), ("", False)]
IBAN = [("GB82 WEST 1234 5698 7654 32", True), ("DE89 3704 0044 0532 0130 00", True),
        ("gb82west12345698765432", True), ("GB82 WEST 1234 5698 7654 33", False), ("GB82-WEST", False),
        ("NO9386011117947", True), ("XX00", False)]
GTIN = [("4006381333931", True), ("036000291452", True), ("96385074", True), ("10614141000415", True),
        ("4006381333932", False), ("12345", False)]
ISBN10 = [("0-306-40615-2", True), ("0-8044-2957-X", True), ("0-306-40615-3", False), ("030640615", False)]
ISBN13 = [("978-0-306-40615-7", True), ("979-10-90636-07-1", True), ("978-0-306-40615-8", False),
          ("4006381333931", False)]


class CheckDigitTests(unittest.TestCase):
    def test_luhn(self):
        for value, expected in LUHN:
            self.assertEqual(luhn_valid(value), expected, value)
        self.assertEqual(luhn_check_digit("7992739871"), "3")
        self.assertEqual(luhn_check_digit("453914880343646"), "7")
        self.assertFalse(luhn_valid("１２３４"))
        for bad in ("", "12a", "١٢٣"):
            with self.assertRaises(ValueError):
                luhn_check_digit(bad)

    def test_iban(self):
        for value, expected in IBAN:
            self.assertEqual(iban_valid(value), expected, value)
        self.assertEqual(iban_format("gb82west12345698765432"), "GB82 WEST 1234 5698 7654 32")
        self.assertEqual(iban_format("NO9386011117947"), "NO93 8601 1117 947")
        with self.assertRaises(ValueError):
            iban_format("GB82 WEST 1234 5698 7654 33")
        self.assertFalse(iban_valid(None))

    def test_gtin_and_isbn(self):
        for value, expected in GTIN:
            self.assertEqual(gtin_valid(value), expected, value)
        for value, expected in ISBN10:
            self.assertEqual(isbn10_valid(value), expected, value)
        for value, expected in ISBN13:
            self.assertEqual(isbn13_valid(value), expected, value)
        self.assertEqual(isbn10_to_13("0-306-40615-2"), "9780306406157")
        self.assertEqual(isbn10_to_13("080442957X"), "9780804429573")
        self.assertTrue(isbn10_valid("0-8044-2957-x"))
        with self.assertRaises(ValueError):
            isbn10_to_13("0-306-40615-3")


if __name__ == "__main__":
    unittest.main()
