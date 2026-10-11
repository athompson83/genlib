# SPDX-License-Identifier: Apache-2.0
# Vectors generated from the Genlib wave 11 shared vector set; do not edit the literals by hand.
import unittest

from roman_numerals import RomanError, from_roman, to_roman

TO = [
    [1, 'I'],
    [4, 'IV'],
    [9, 'IX'],
    [14, 'XIV'],
    [40, 'XL'],
    [90, 'XC'],
    [400, 'CD'],
    [1994, 'MCMXCIV'],
    [2026, 'MMXXVI'],
    [3888, 'MMMDCCCLXXXVIII'],
    [3999, 'MMMCMXCIX'],
]
FROM = [
    ['I', 1],
    ['iv', 4],
    ['MCMXCIV', 1994],
    ['mmxxvi', 2026],
    ['MMMCMXCIX', 3999],
]
INVALID_TO = [
    0,
    4000,
    -5,
]
INVALID_FROM = [
    '',
    'IIII',
    'IC',
    'VX',
    'MMMM',
    'ABC',
    'IIV',
    'XM',
]


class RomanNumeralsTest(unittest.TestCase):
    def test_to_and_from(self):
        for n, text in TO:
            self.assertEqual(to_roman(n), text, n)
            self.assertEqual(from_roman(text), n, text)
        for text, n in FROM:
            self.assertEqual(from_roman(text), n, text)

    def test_round_trip(self):
        for n in range(1, 4000):
            self.assertEqual(from_roman(to_roman(n).lower()), n)

    def test_invalid(self):
        for n in INVALID_TO + [True, 1.0]:
            with self.assertRaises(RomanError, msg=repr(n)):
                to_roman(n)
        for text in INVALID_FROM:
            with self.assertRaises(RomanError, msg=text):
                from_roman(text)


if __name__ == "__main__":
    unittest.main()
