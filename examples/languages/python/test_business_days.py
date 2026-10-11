# SPDX-License-Identifier: Apache-2.0
# Vectors generated from the Genlib wave 9 shared vector set; do not edit the literals by hand.
import unittest

from business_days import add_business_days, business_days_between, is_business_day

IS = [['2026-10-10', [], ['SA', 'SU'], False],
 ['2026-10-12', [], ['SA', 'SU'], True],
 ['2026-12-25', ['2026-12-25', '2026-12-28', '2027-01-01'], ['SA', 'SU'], False],
 ['2026-10-16', [], ['FR', 'SA'], False]]
ADD = [['2026-10-09', 1, [], ['SA', 'SU'], '2026-10-12'],
 ['2026-10-12', -1, [], ['SA', 'SU'], '2026-10-09'],
 ['2026-10-10', 0, [], ['SA', 'SU'], '2026-10-12'],
 ['2026-10-12', 0, [], ['SA', 'SU'], '2026-10-12'],
 ['2026-12-23', 3, ['2026-12-25', '2026-12-28', '2027-01-01'], ['SA', 'SU'], '2026-12-30'],
 ['2026-12-31', -5, ['2026-12-25', '2026-12-28', '2027-01-01'], ['SA', 'SU'], '2026-12-22'],
 ['2028-02-28', 1, [], ['SA', 'SU'], '2028-02-29'],
 ['2026-10-14', 10, [], ['FR', 'SA'], '2026-10-28'],
 ['2026-01-01', 260, [], ['SA', 'SU'], '2026-12-31'],
 ['2026-10-11', 0, [], [], '2026-10-11']]
BETWEEN = [['2026-10-01', '2026-11-01', ['2026-10-12'], ['SA', 'SU'], 21],
 ['2026-11-01', '2026-10-01', [], ['SA', 'SU'], -22],
 ['2026-10-12', '2026-10-12', [], ['SA', 'SU'], 0],
 ['2026-12-21', '2027-01-04', ['2026-12-25', '2026-12-28', '2027-01-01'], ['SA', 'SU'], 7],
 ['2026-01-01', '2027-01-01', [], ['SA', 'SU'], 261],
 ['2026-10-01', '2026-10-31', [], ['FR', 'SA'], 21],
 ['2026-10-10', '2026-10-12', ['2026-10-11'], ['SA', 'SU'], 0]]
INVALID = [['2026-02-30', 1], ['2026-1-01', 1], ['2026-01-01', 100001]]


class BusinessDaysTest(unittest.TestCase):
    def test_vectors(self):
        for date, holidays, weekend, expected in IS:
            self.assertEqual(is_business_day(date, holidays, weekend), expected, date)
        for date, n, holidays, weekend, expected in ADD:
            self.assertEqual(add_business_days(date, n, holidays, weekend), expected, (date, n))
        for start, end, holidays, weekend, expected in BETWEEN:
            self.assertEqual(business_days_between(start, end, holidays, weekend), expected, (start, end))

    def test_invalid(self):
        for date, n in INVALID:
            with self.assertRaises(ValueError):
                add_business_days(date, n)
        with self.assertRaises(ValueError):
            is_business_day("2026-10-10", [], ["MO", "TU", "WE", "TH", "FR", "SA", "SU"])
        with self.assertRaises(ValueError):
            is_business_day("2026-10-10", [], ["XX"])
        with self.assertRaises(ValueError):
            business_days_between("2026-10-10", "2026-13-01")


if __name__ == "__main__":
    unittest.main()
