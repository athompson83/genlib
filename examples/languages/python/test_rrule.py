# SPDX-License-Identifier: Apache-2.0
# Vectors copied from the Genlib wave 6 shared vector set.
import unittest

from rrule import expand_rrule

CASES = [('2026-01-31T09:00:00Z',
  'FREQ=MONTHLY;COUNT=5',
  ['2026-01-31T09:00:00Z',
   '2026-03-31T09:00:00Z',
   '2026-05-31T09:00:00Z',
   '2026-07-31T09:00:00Z',
   '2026-08-31T09:00:00Z']),
 ('2026-10-12T09:30:00Z',
  'FREQ=WEEKLY;BYDAY=MO,WE,FR;COUNT=7',
  ['2026-10-12T09:30:00Z',
   '2026-10-14T09:30:00Z',
   '2026-10-16T09:30:00Z',
   '2026-10-19T09:30:00Z',
   '2026-10-21T09:30:00Z',
   '2026-10-23T09:30:00Z',
   '2026-10-26T09:30:00Z']),
 ('2026-10-01T00:00:00Z',
  'FREQ=DAILY;INTERVAL=10;UNTIL=20261115T000000Z',
  ['2026-10-01T00:00:00Z',
   '2026-10-11T00:00:00Z',
   '2026-10-21T00:00:00Z',
   '2026-10-31T00:00:00Z',
   '2026-11-10T00:00:00Z']),
 ('2026-01-01T12:00:00Z',
  'FREQ=MONTHLY;BYDAY=-1FR;COUNT=4',
  ['2026-01-30T12:00:00Z', '2026-02-27T12:00:00Z', '2026-03-27T12:00:00Z', '2026-04-24T12:00:00Z']),
 ('2026-01-01T12:00:00Z',
  'FREQ=MONTHLY;BYDAY=2TU,4TU;COUNT=6',
  ['2026-01-13T12:00:00Z',
   '2026-01-27T12:00:00Z',
   '2026-02-10T12:00:00Z',
   '2026-02-24T12:00:00Z',
   '2026-03-10T12:00:00Z',
   '2026-03-24T12:00:00Z']),
 ('2026-01-15T08:00:00Z',
  'FREQ=MONTHLY;BYMONTHDAY=1,-1;COUNT=6',
  ['2026-01-31T08:00:00Z',
   '2026-02-01T08:00:00Z',
   '2026-02-28T08:00:00Z',
   '2026-03-01T08:00:00Z',
   '2026-03-31T08:00:00Z',
   '2026-04-01T08:00:00Z']),
 ('2028-02-29T00:00:00Z',
  'FREQ=YEARLY;COUNT=3',
  ['2028-02-29T00:00:00Z', '2032-02-29T00:00:00Z', '2036-02-29T00:00:00Z']),
 ('2026-03-10T10:00:00Z',
  'FREQ=YEARLY;BYMONTH=3,9;COUNT=5',
  ['2026-03-10T10:00:00Z',
   '2026-09-10T10:00:00Z',
   '2027-03-10T10:00:00Z',
   '2027-09-10T10:00:00Z',
   '2028-03-10T10:00:00Z']),
 ('2026-10-14T18:00:00Z',
  'FREQ=WEEKLY;INTERVAL=2;BYDAY=TU;COUNT=3',
  ['2026-10-27T18:00:00Z', '2026-11-10T18:00:00Z', '2026-11-24T18:00:00Z']),
 ('2026-10-14T18:00:00Z', 'FREQ=WEEKLY;COUNT=2', ['2026-10-14T18:00:00Z', '2026-10-21T18:00:00Z']),
 ('2026-01-31T09:00:00Z',
  'FREQ=MONTHLY;INTERVAL=2;BYMONTHDAY=31;UNTIL=20261231T235959Z',
  ['2026-01-31T09:00:00Z', '2026-03-31T09:00:00Z', '2026-05-31T09:00:00Z', '2026-07-31T09:00:00Z'])]
INVALID = ['FREQ=HOURLY',
 'COUNT=3',
 'FREQ=DAILY;COUNT=2;UNTIL=20261231T000000Z',
 'FREQ=WEEKLY;BYDAY=1MO',
 'FREQ=DAILY;BYDAY=MO',
 'FREQ=MONTHLY;BYMONTHDAY=32',
 'FREQ=MONTHLY;BYSETPOS=1',
 'FREQ=WEEKLY;INTERVAL=0',
 'FREQ=MONTHLY;BYDAY=MO;BYMONTHDAY=1',
 'FREQ=YEARLY;UNTIL=2026-12-31',
 'FREQ=DAILY;FREQ=DAILY',
 'FREQ=WEEKLY;BYDAY=XX']


class RRuleTests(unittest.TestCase):
    def test_cases(self):
        for dtstart, rule, expected in CASES:
            self.assertEqual(expand_rrule(dtstart, rule), expected, rule)

    def test_invalid(self):
        for rule in INVALID:
            with self.assertRaises(ValueError, msg=rule):
                expand_rrule("2026-01-01T00:00:00Z", rule)

    def test_limits(self):
        self.assertEqual(len(expand_rrule("2026-01-01T00:00:00Z", "FREQ=DAILY")), 50)
        self.assertEqual(len(expand_rrule("2026-01-01T00:00:00Z", "FREQ=DAILY", 1000)), 1000)
        for bad in (0, 1001):
            with self.assertRaises(ValueError):
                expand_rrule("2026-01-01T00:00:00Z", "FREQ=DAILY", bad)
        for bad in ("2026-01-01 00:00:00", "2026-02-30T00:00:00Z", "2026-01-01T00:00:00+00:00"):
            with self.assertRaises(ValueError):
                expand_rrule(bad, "FREQ=DAILY")
        self.assertEqual(expand_rrule("9999-12-30T00:00:00Z", "FREQ=DAILY"), ["9999-12-30T00:00:00Z", "9999-12-31T00:00:00Z"])


if __name__ == "__main__":
    unittest.main()
