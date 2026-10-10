# SPDX-License-Identifier: Apache-2.0
# Vectors copied from the Genlib wave 6 shared vector set.
import unittest

from http_range import content_range, parse_range

SIZE = 10000
CASES = [('bytes=0-499', {'kind': 'ranges', 'ranges': [[0, 499]]}),
 ('bytes=500-999', {'kind': 'ranges', 'ranges': [[500, 999]]}),
 ('bytes=-500', {'kind': 'ranges', 'ranges': [[9500, 9999]]}),
 ('bytes=9500-', {'kind': 'ranges', 'ranges': [[9500, 9999]]}),
 ('bytes=0-0,-1', {'kind': 'ranges', 'ranges': [[0, 0], [9999, 9999]]}),
 ('bytes= 0-1 , 5-6', {'kind': 'ranges', 'ranges': [[0, 1], [5, 6]]}),
 ('BYTES=0-99', {'kind': 'ranges', 'ranges': [[0, 99]]}),
 ('bytes=9999-20000', {'kind': 'ranges', 'ranges': [[9999, 9999]]}),
 ('bytes=10000-', {'kind': 'unsatisfiable', 'contentRange': 'bytes */10000'}),
 ('bytes=-0', {'kind': 'unsatisfiable', 'contentRange': 'bytes */10000'}),
 ('bytes=-20000', {'kind': 'ranges', 'ranges': [[0, 9999]]}),
 ('bytes=500-400', {'kind': 'none'}),
 ('items=0-1', {'kind': 'none'}),
 ('bytes=', {'kind': 'none'}),
 ('bytes=0-1,', {'kind': 'none'}),
 ('bytes=abc', {'kind': 'none'}),
 ('bytes=1-2-3', {'kind': 'none'}),
 (None, {'kind': 'none'}),
 ('bytes=10000-10001,20000-', {'kind': 'unsatisfiable', 'contentRange': 'bytes */10000'})]
EMPTY_FILE = [('bytes=0-', {'kind': 'unsatisfiable', 'contentRange': 'bytes */0'}),
 ('bytes=-5', {'kind': 'unsatisfiable', 'contentRange': 'bytes */0'})]
CONTENT_RANGE = [(0, 499, 10000, 'bytes 0-499/10000')]


class HttpRangeTests(unittest.TestCase):
    def test_cases(self):
        for header, expected in CASES:
            self.assertEqual(parse_range(header, SIZE), expected, header)

    def test_empty_file(self):
        for header, expected in EMPTY_FILE:
            self.assertEqual(parse_range(header, 0), expected, header)

    def test_content_range(self):
        for start, end, size, expected in CONTENT_RANGE:
            self.assertEqual(content_range(start, end, size), expected)
        with self.assertRaises(ValueError):
            content_range(5, 4, 10)

    def test_limits(self):
        self.assertEqual(parse_range("bytes=" + ",".join(["0-0"] * 101), SIZE), {"kind": "none"})
        self.assertEqual(len(parse_range("bytes=" + ",".join(["0-0"] * 100), SIZE)["ranges"]), 100)
        big = 2 ** 40
        self.assertEqual(parse_range("bytes=-1", big), {"kind": "ranges", "ranges": [[big - 1, big - 1]]})


if __name__ == "__main__":
    unittest.main()
