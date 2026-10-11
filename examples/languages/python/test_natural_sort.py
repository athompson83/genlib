# SPDX-License-Identifier: Apache-2.0
# Vectors generated from the Genlib wave 9 shared vector set; do not edit the literals by hand.
import unittest

from natural_sort import natural_compare, natural_sort

SORTED = [[['file10.txt',
   'file2.txt',
   'File1.txt',
   'file1.txt',
   'file01.txt',
   'a',
   'A',
   'b',
   '10',
   '9',
   'x2y10',
   'x2y9',
   'x02y1',
   '',
   'file1'],
  ['',
   '9',
   '10',
   'A',
   'a',
   'b',
   'file1',
   'File1.txt',
   'file1.txt',
   'file01.txt',
   'file2.txt',
   'file10.txt',
   'x02y1',
   'x2y9',
   'x2y10']],
 [['v1.10.0', 'v1.2.0', 'v1.9.9', 'v10.0', 'v1.2.10'], ['v1.2.0', 'v1.2.10', 'v1.9.9', 'v1.10.0', 'v10.0']],
 [['img12.png', 'img10.png', 'IMG2.png', 'img1.png'], ['img1.png', 'IMG2.png', 'img10.png', 'img12.png']],
 [['a0', 'a00', 'a000', 'a', 'a1', 'a01'], ['a', 'a0', 'a00', 'a000', 'a1', 'a01']],
 [['Ä', 'Z', 'a', 'z', '_x', '1x'], ['1x', '_x', 'a', 'Z', 'z', 'Ä']]]
COMPARE = [['a2', 'a10', -1],
 ['a10', 'a2', 1],
 ['abc', 'ABC', 1],
 ['x01', 'x1', 1],
 ['x1', 'x1', 0],
 ['', 'a', -1],
 ['a', '1', 1],
 ['99999999999999999999', '100000000000000000000', -1]]


class NaturalSortTest(unittest.TestCase):
    def test_vectors(self):
        for items, expected in SORTED:
            original = list(items)
            self.assertEqual(natural_sort(items), expected)
            self.assertEqual(items, original)
        for a, b, expected in COMPARE:
            self.assertEqual(natural_compare(a, b), expected, (a, b))
            self.assertEqual(natural_compare(b, a), -expected, (b, a))

    def test_code_point_order(self):
        self.assertEqual(natural_compare("\uff61", "\U0001F600"), -1)


if __name__ == "__main__":
    unittest.main()
