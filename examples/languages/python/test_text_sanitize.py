# SPDX-License-Identifier: Apache-2.0
# Vectors copied from the Genlib wave 7 shared vector set.
import unittest

from text_sanitize import find_bidi_controls, normalize_whitespace, sanitize_text

# [text, options, expected]; options use the Python spelling (allow_newlines, max_length).
SANITIZE = [['plain text', {}, 'plain text'],
 ['line1\r\nline2\rline3', {}, 'line1\nline2\nline3'],
 ['zero\u200bwidth\ufeffbom', {}, 'zerowidthbom'],
 ['tab\there\x00nul\x7fdel\x85nel', {}, 'tab\therenuldelnel'],
 ['if (accessLevel != "user\u202e \u2066// Check if admin\u2069 \u2066") {',
  {},
  'if (accessLevel != "user // Check if admin ") {'],
 ['emoji 👍🏽 and ZWJ 👨\u200d👩\u200d👧 family', {}, 'emoji 👍🏽 and ZWJ 👨\u200d👩\u200d👧 family'],
 ['café é', {}, 'café é'],
 ['a\nb\r\nc', {'allow_newlines': False}, 'a b c'],
 ['abcdef', {'max_length': 3}, 'abc'],
 ['😀😀😀', {'max_length': 2}, '😀😀']]
# [text, [[code point index, hex], ...]]
FIND_BIDI = [['plain text', []],
 ['line1\r\nline2\rline3', []],
 ['zero\u200bwidth\ufeffbom', []],
 ['tab\there\x00nul\x7fdel\x85nel', []],
 ['if (accessLevel != "user\u202e \u2066// Check if admin\u2069 \u2066") {',
  [[24, '202E'], [26, '2066'], [44, '2069'], [46, '2066']]],
 ['emoji 👍🏽 and ZWJ 👨\u200d👩\u200d👧 family', []],
 ['café é', []]]
NORMALIZE = [['  a   b\t\tc\n\nd  ', 'a b c d'], ['', ''], [' \t\n ', ''], ['one', 'one']]


class TextSanitizeTest(unittest.TestCase):
    def test_sanitize(self):
        for text, options, expected in SANITIZE:
            self.assertEqual(sanitize_text(text, **options), expected, repr(text))

    def test_find_bidi(self):
        for text, expected in FIND_BIDI:
            self.assertEqual(find_bidi_controls(text), expected, repr(text))

    def test_normalize_whitespace(self):
        for text, expected in NORMALIZE:
            self.assertEqual(normalize_whitespace(text), expected, repr(text))


if __name__ == "__main__":
    unittest.main()
