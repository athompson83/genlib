# SPDX-License-Identifier: Apache-2.0
import unittest

from iso_duration import duration_milliseconds, format_duration, parse_duration


def d(years=0, months=0, weeks=0, days=0, hours=0, minutes=0, milliseconds=0):
    return {"years": years, "months": months, "weeks": weeks, "days": days, "hours": hours,
            "minutes": minutes, "milliseconds": milliseconds}


PARSE = [("P1Y2M3DT4H5M6S", d(1, 2, 0, 3, 4, 5, 6000)), ("PT1H30M", d(hours=1, minutes=30)), ("P2W", d(weeks=2)),
         ("PT0.5S", d(milliseconds=500)), ("PT36H", d(hours=36)), ("P0D", d()), ("PT1.250S", d(milliseconds=1250))]
INVALID = ["P", "PT", "1D", "P1H", "PT1D", "P-1D", "PT1.2345S", "P1.5D", "p1d", "P1DT", ""]
MILLIS = [("PT1H30M", 5400000), ("P2W", 1209600000), ("P1DT0.5S", 86400500), ("PT36H", 129600000)]
FORMAT = [(0, "PT0S"), (5400000, "PT1H30M"), (90061001, "P1DT1H1M1.001S"), (500, "PT0.5S"),
          (129600000, "P1DT12H"), (1209600000, "P14D")]


class IsoDurationTests(unittest.TestCase):
    def test_parse(self):
        for text, expected in PARSE:
            self.assertEqual(parse_duration(text), expected, text)
        for text in INVALID + ["P１D", "PT1.S"]:
            with self.assertRaises(ValueError, msg=text):
                parse_duration(text)

    def test_milliseconds(self):
        for text, expected in MILLIS:
            self.assertEqual(duration_milliseconds(parse_duration(text)), expected, text)
        for text in ("P1Y", "P1M"):
            with self.assertRaises(ValueError):
                duration_milliseconds(parse_duration(text))

    def test_format(self):
        for ms, expected in FORMAT:
            self.assertEqual(format_duration(ms), expected)
            self.assertEqual(duration_milliseconds(parse_duration(expected)), ms)
        with self.assertRaises(ValueError):
            format_duration(-1)


if __name__ == "__main__":
    unittest.main()
