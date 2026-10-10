# SPDX-License-Identifier: Apache-2.0
# Vectors copied from the Genlib wave 7 shared vector set.
import unittest

from human_units import format_bytes, format_duration, parse_bytes, relative_time

# [n, base, decimals, expected]
FORMAT_BYTES = [[0, 'si', 1, '0 B'],
 [999, 'si', 1, '999 B'],
 [1000, 'si', 1, '1 kB'],
 [1536, 'iec', 1, '1.5 KiB'],
 [1536, 'si', 1, '1.5 kB'],
 [999950, 'si', 1, '1 MB'],
 [999949, 'si', 1, '999.9 kB'],
 [1048576, 'iec', 2, '1 MiB'],
 [123456789, 'si', 2, '123.46 MB'],
 [123456789, 'iec', 0, '118 MiB'],
 [9223372036854775807, 'iec', 3, '8 EiB'],
 [1023, 'iec', 1, '1023 B'],
 [1024, 'iec', 1, '1 KiB'],
 [5000000000000, 'si', 1, '5 TB']]
PARSE_BYTES = [['0', 0],
 ['512', 512],
 ['1kB', 1000],
 ['1 KiB', 1024],
 ['1.5 GiB', 1610612736],
 ['2.25MB', 2250000],
 [' 10 b ', 10],
 ['1.0005 kB', 1001],
 ['1.5', 2],
 ['0.5 B', 1],
 ['7 EiB', 8070450532247928832]]
PARSE_INVALID = ['', 'abc', '1 KB B', '1.5.2 MB', '-1 kB', '1 kbit', '1e3 B', '9 EiB', '.5 kB']
FORMAT_DURATION = [[0, '0ms'],
 [850, '850ms'],
 [1000, '1s'],
 [45000, '45s'],
 [65000, '1m 5s'],
 [3600000, '1h'],
 [3725000, '1h 2m'],
 [90061000, '1d 1h'],
 [172800000, '2d'],
 [59999, '59s']]
RELATIVE_TIME = [[0, 'just now'],
 [30, 'just now'],
 [-44, 'just now'],
 [45, 'in a minute'],
 [-89, 'a minute ago'],
 [90, 'in 2 minutes'],
 [150, 'in 3 minutes'],
 [-2670, '45 minutes ago'],
 [2700, 'in an hour'],
 [5399, 'in an hour'],
 [5400, 'in 2 hours'],
 [-75600, '21 hours ago'],
 [79200, 'in a day'],
 [129599, 'in a day'],
 [129600, 'in 2 days'],
 [2246400, 'in a month'],
 [-3974400, '2 months ago'],
 [15552000, 'in 6 months'],
 [27648000, 'in a year'],
 [-47347200, '2 years ago'],
 [63115200, 'in 2 years'],
 [315569520, 'in 10 years']]


class HumanUnitsTest(unittest.TestCase):
    def test_format_bytes(self):
        for n, base, decimals, expected in FORMAT_BYTES:
            self.assertEqual(format_bytes(n, base, decimals), expected, (n, base, decimals))
        for bad in [(-1,), (1, "metric"), (1, "si", 4)]:
            with self.assertRaises(ValueError):
                format_bytes(*bad)

    def test_parse_bytes(self):
        for text, expected in PARSE_BYTES:
            self.assertEqual(parse_bytes(text), expected, text)
        for text in PARSE_INVALID:
            with self.assertRaises(ValueError, msg=text):
                parse_bytes(text)

    def test_format_duration(self):
        for ms, expected in FORMAT_DURATION:
            self.assertEqual(format_duration(ms), expected, ms)

    def test_relative_time(self):
        for delta, expected in RELATIVE_TIME:
            self.assertEqual(relative_time(delta), expected, delta)


if __name__ == "__main__":
    unittest.main()
