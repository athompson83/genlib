# SPDX-License-Identifier: Apache-2.0
import unittest

from email_address import email_normalize, email_valid

A63 = "a" * 63
CASES = [
    ("user@example.com", True), ("first.last+tag@sub.Example.CO.uk", True), ("o'brien@example.ie", True),
    ("a@b", True), ("user@-example.com", False), ("user@example-.com", False), ("user@exa_mple.com", False),
    ("user example@example.com", False), ("user@@example.com", False), ("@example.com", False), ("user@", False),
    ("user@example..com", False), ("user.@example.com", True), ("ünïcode@example.com", False),
    ("x" * 64 + "@example.com", True), ("x" * 65 + "@example.com", False),
    ("u@" + ".".join([A63] * 3) + "." + "b" * 59, True), ("u@" + ".".join([A63] * 3) + "." + "b" * 61, False),
    ("user@" + "a" * 64 + ".com", False),
]


class EmailTests(unittest.TestCase):
    def test_valid(self):
        for value, expected in CASES:
            self.assertEqual(email_valid(value), expected, value)
        self.assertFalse(email_valid("user@example.com\n"))
        self.assertFalse(email_valid(None))

    def test_normalize(self):
        self.assertEqual(email_normalize("  Mixed.Case@Example.COM "), "Mixed.Case@example.com")
        with self.assertRaises(ValueError):
            email_normalize(" not an email ")


if __name__ == "__main__":
    unittest.main()
