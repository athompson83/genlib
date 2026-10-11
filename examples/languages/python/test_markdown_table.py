# SPDX-License-Identifier: Apache-2.0
# Vectors generated from the Genlib wave 12 shared vector set; do not edit the literals by hand.
import unittest
from markdown_table import MarkdownTableError, markdown_table

CASES = [
    [['Name', 'Qty'], [['Apple', '3'], ['Kiwi', '12']], None, '| Name  | Qty |\n| ----- | --- |\n| Apple | 3   |\n| Kiwi  | 12  |'],
    [['a', 'b', 'c'], [['1', '2', '3']], ['left', 'right', 'center'], '| a   |   b |  c  |\n| :-- | --: | :-: |\n| 1   |   2 |  3  |'],
    [['Pipe|col', 'Text'], [['a|b', 'line1\nline2'], ['back\\slash', 'crlf\r\nx']], None, '| Pipe\\|col   | Text           |\n| ----------- | -------------- |\n| a\\|b        | line1<br>line2 |\n| back\\\\slash | crlf<br>x      |'],
    [['x'], [], ['center'], '|  x  |\n| :-: |'],
    [['Café', '😀'], [['naïve', 'ok']], ['right', None], '|  Café | 😀   |\n| ----: | --- |\n| naïve | ok  |'],
    [['wide'], [['abcdefghij']], ['center'], '|    wide    |\n| :--------: |\n| abcdefghij |'],
]

INVALID = [
    [[], [], None],
    [['a', 'b'], [['1']], None],
    [['a'], [['1']], ['middle']],
]


class MarkdownTableTest(unittest.TestCase):
    def test_cases(self):
        for headers, rows, align, expected in CASES:
            self.assertEqual(markdown_table(headers, rows, align), expected, headers)

    def test_invalid(self):
        for headers, rows, align in INVALID:
            with self.assertRaises(MarkdownTableError, msg=(headers, rows, align)):
                markdown_table(headers, rows, align)


if __name__ == "__main__":
    unittest.main()
