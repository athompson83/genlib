# SPDX-License-Identifier: Apache-2.0
# Vectors copied from the Genlib wave 7 shared vector set.
import unittest

from line_diff import diff_lines, unified_diff

OPS = [['a\nb\nc\n', 'a\nB\nc\n', [['=', 'a'], ['-', 'b'], ['+', 'B'], ['=', 'c']]],
 ['', 'x\n', [['+', 'x']]],
 ['x\n', '', [['-', 'x']]],
 ['one\ntwo\nthree\nfour\nfive\nsix\nseven\neight\nnine\nten\n',
  'one\nTWO\nthree\nfour\nfive\nsix\nseven\neight\nNINE\nten\n',
  [['=', 'one'],
   ['-', 'two'],
   ['+', 'TWO'],
   ['=', 'three'],
   ['=', 'four'],
   ['=', 'five'],
   ['=', 'six'],
   ['=', 'seven'],
   ['=', 'eight'],
   ['-', 'nine'],
   ['+', 'NINE'],
   ['=', 'ten']]],
 ['1\n2\n3\n4\n5\n6\n7\n8\n9\n10\n11\n12\n13\n14\n15\n16\n',
  '1\n2\nX\n4\n5\n6\n7\n8\n9\n10\n11\n12\n13\nY\n15\n16\n',
  [['=', '1'],
   ['=', '2'],
   ['-', '3'],
   ['+', 'X'],
   ['=', '4'],
   ['=', '5'],
   ['=', '6'],
   ['=', '7'],
   ['=', '8'],
   ['=', '9'],
   ['=', '10'],
   ['=', '11'],
   ['=', '12'],
   ['=', '13'],
   ['-', '14'],
   ['+', 'Y'],
   ['=', '15'],
   ['=', '16']]],
 ['a\nb\n', 'a\nb', [['=', 'a'], ['=', 'b']]],
 ['a\nb', 'a\nc', [['=', 'a'], ['-', 'b'], ['+', 'c']]],
 ['same\n', 'same\n', [['=', 'same']]],
 ['a\nb\nc\nd\n', 'b\nc\nd\ne\n', [['-', 'a'], ['=', 'b'], ['=', 'c'], ['=', 'd'], ['+', 'e']]],
 ['x\ny\n', 'y\nx\n', [['-', 'x'], ['=', 'y'], ['+', 'x']]]]
# unified diffs use from_name='old.txt', to_name='new.txt', context=3 (checked against GNU diff -u)
UNIFIED = [['a\nb\nc\n', 'a\nB\nc\n', '--- old.txt\n+++ new.txt\n@@ -1,3 +1,3 @@\n a\n-b\n+B\n c\n'],
 ['', 'x\n', '--- old.txt\n+++ new.txt\n@@ -0,0 +1 @@\n+x\n'],
 ['x\n', '', '--- old.txt\n+++ new.txt\n@@ -1 +0,0 @@\n-x\n'],
 ['one\ntwo\nthree\nfour\nfive\nsix\nseven\neight\nnine\nten\n',
  'one\nTWO\nthree\nfour\nfive\nsix\nseven\neight\nNINE\nten\n',
  '--- old.txt\n'
  '+++ new.txt\n'
  '@@ -1,10 +1,10 @@\n'
  ' one\n'
  '-two\n'
  '+TWO\n'
  ' three\n'
  ' four\n'
  ' five\n'
  ' six\n'
  ' seven\n'
  ' eight\n'
  '-nine\n'
  '+NINE\n'
  ' ten\n'],
 ['1\n2\n3\n4\n5\n6\n7\n8\n9\n10\n11\n12\n13\n14\n15\n16\n',
  '1\n2\nX\n4\n5\n6\n7\n8\n9\n10\n11\n12\n13\nY\n15\n16\n',
  '--- old.txt\n'
  '+++ new.txt\n'
  '@@ -1,6 +1,6 @@\n'
  ' 1\n'
  ' 2\n'
  '-3\n'
  '+X\n'
  ' 4\n'
  ' 5\n'
  ' 6\n'
  '@@ -11,6 +11,6 @@\n'
  ' 11\n'
  ' 12\n'
  ' 13\n'
  '-14\n'
  '+Y\n'
  ' 15\n'
  ' 16\n'],
 ['a\nb\n', 'a\nb', '--- old.txt\n+++ new.txt\n@@ -1,2 +1,2 @@\n a\n-b\n+b\n\\ No newline at end of file\n'],
 ['a\nb',
  'a\nc',
  '--- old.txt\n'
  '+++ new.txt\n'
  '@@ -1,2 +1,2 @@\n'
  ' a\n'
  '-b\n'
  '\\ No newline at end of file\n'
  '+c\n'
  '\\ No newline at end of file\n'],
 ['same\n', 'same\n', ''],
 ['a\nb\nc\nd\n', 'b\nc\nd\ne\n', '--- old.txt\n+++ new.txt\n@@ -1,4 +1,4 @@\n-a\n b\n c\n d\n+e\n'],
 ['x\ny\n', 'y\nx\n', '--- old.txt\n+++ new.txt\n@@ -1,2 +1,2 @@\n-x\n y\n+x\n']]


class LineDiffTest(unittest.TestCase):
    def test_ops(self):
        for a, b, expected in OPS:
            self.assertEqual(diff_lines(a, b), expected, (a, b))

    def test_unified(self):
        for a, b, expected in UNIFIED:
            self.assertEqual(unified_diff(a, b, "old.txt", "new.txt"), expected, (a, b))

    def test_size_limit(self):
        big = "x\n" * 2001
        with self.assertRaises(ValueError):
            diff_lines(big, big.replace("x", "y"))


if __name__ == "__main__":
    unittest.main()
