# SPDX-License-Identifier: Apache-2.0
import unittest

from cron_next import next_run

VECTORS = [
    ("*/15 * * * *", "2026-10-10T12:07:30Z", "2026-10-10T12:15:00Z"),
    ("0 9 * * 1-5", "2026-10-10T12:00:00Z", "2026-10-12T09:00:00Z"),
    ("30 2 1 * *", "2026-10-10T00:00:00Z", "2026-11-01T02:30:00Z"),
    ("0 0 29 2 *", "2026-03-01T00:00:00Z", "2028-02-29T00:00:00Z"),
    ("0 12 13 * 5", "2026-10-10T00:00:00Z", "2026-10-13T12:00:00Z"),
    ("59 23 31 12 *", "2026-12-31T23:59:00Z", "2027-12-31T23:59:00Z"),
    ("0 0 * * 0", "2026-10-10T00:00:00Z", "2026-10-11T00:00:00Z"),
    ("5,10 8-9 * * *", "2026-10-10T09:10:00Z", "2026-10-11T08:05:00Z"),
]


class CronTests(unittest.TestCase):
    def test_vectors(self):
        for expr, after, want in VECTORS:
            self.assertEqual(next_run(expr, after), want, expr)

    def test_fields(self):
        self.assertEqual(next_run("0 0 * * 7", "2026-10-10T00:00:00Z"), "2026-10-11T00:00:00Z")
        self.assertEqual(next_run("10/20 * * * *", "2026-10-10T12:31:00Z"), "2026-10-10T12:50:00Z")
        self.assertEqual(next_run("0 0 1-10/5 * *", "2026-10-02T00:00:00Z"), "2026-10-06T00:00:00Z")
        # Only day-of-week restricted: both must match (day-of-month is "*").
        self.assertEqual(next_run("0 0 */2 * 1", "2026-10-10T00:00:00Z"), "2026-10-19T00:00:00Z")

    def test_validation(self):
        for bad in ("* * * *", "60 * * * *", "* 24 * * *", "* * 0 * *", "* * * 13 *", "* * * * 8",
                    "* * * JAN *", "*/0 * * * *", "5-1 * * * *", "? * * * *", "L * * * *"):
            with self.assertRaises(ValueError, msg=bad):
                next_run(bad, "2026-10-10T00:00:00Z")
        for bad in ("2026-10-10", "2026-10-10T00:00:00+02:00", "2026-02-30T00:00:00Z"):
            with self.assertRaises(ValueError):
                next_run("* * * * *", bad)
        with self.assertRaisesRegex(ValueError, "5 years"):
            next_run("0 0 31 2 *", "2026-10-10T00:00:00Z")


if __name__ == "__main__":
    unittest.main()
