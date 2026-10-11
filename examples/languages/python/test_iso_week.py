# SPDX-License-Identifier: Apache-2.0
# Vectors generated from the Genlib wave 10 shared vector set; do not edit the literals by hand.
import unittest

from iso_week import (
    IsoWeekError,
    format_iso_week,
    from_iso_week,
    iso_week,
    parse_iso_week,
    weeks_in_year,
)

ISO_WEEK = [
    [[2021, 1, 3], [2020, 53, 7], '2020-W53-7'],
    [[2021, 1, 4], [2021, 1, 1], '2021-W01-1'],
    [[2020, 12, 31], [2020, 53, 4], '2020-W53-4'],
    [[2026, 10, 11], [2026, 41, 7], '2026-W41-7'],
    [[2008, 12, 29], [2009, 1, 1], '2009-W01-1'],
    [[2010, 1, 3], [2009, 53, 7], '2009-W53-7'],
    [[2015, 12, 31], [2015, 53, 4], '2015-W53-4'],
    [[2016, 1, 1], [2015, 53, 5], '2015-W53-5'],
    [[2024, 12, 30], [2025, 1, 1], '2025-W01-1'],
    [[1, 1, 1], [1, 1, 1], '0001-W01-1'],
    [[9999, 12, 31], [9999, 52, 5], '9999-W52-5'],
]
WEEKS_IN_YEAR = [
    [2015, 53],
    [2016, 52],
    [2020, 53],
    [2021, 52],
    [2026, 53],
    [2032, 53],
    [2037, 53],
]
FROM_ISO_WEEK = [
    [[2020, 53, 5], [2021, 1, 1]],
    [[2026, 1, 1], [2025, 12, 29]],
    [[2009, 1, 1], [2008, 12, 29]],
]
PARSE = [
    ['2026-W41-7', [2026, 10, 11]],
    ['2026W417', [2026, 10, 11]],
    ['2026-W41', [2026, 10, 5]],
    ['2020-W53-5', [2021, 1, 1]],
]
INVALID = [
    '2021-W53-1',
    '2026-W00-1',
    '2026-W10-8',
    '26-W10-1',
    '2026-w10-1',
    '2026-W1-1',
]


class IsoWeekTest(unittest.TestCase):
    def test_iso_week(self):
        for date, week, formatted in ISO_WEEK:
            self.assertEqual(list(iso_week(*date)), week, date)
            self.assertEqual(format_iso_week(*date), formatted, date)
            self.assertEqual(list(from_iso_week(*week)), date, week)
            self.assertEqual(list(parse_iso_week(formatted)), date, formatted)

    def test_weeks_in_year(self):
        for year, expected in WEEKS_IN_YEAR:
            self.assertEqual(weeks_in_year(year), expected, year)

    def test_from_iso_week_and_parse(self):
        for week, expected in FROM_ISO_WEEK:
            self.assertEqual(list(from_iso_week(*week)), expected, week)
        for text, expected in PARSE:
            self.assertEqual(list(parse_iso_week(text)), expected, text)

    def test_invalid(self):
        for text in INVALID:
            with self.assertRaises(IsoWeekError, msg=text):
                parse_iso_week(text)
        with self.assertRaises(IsoWeekError):
            iso_week(2021, 2, 29)
        with self.assertRaises(IsoWeekError):
            from_iso_week(9999, 52, 6)


if __name__ == "__main__":
    unittest.main()
