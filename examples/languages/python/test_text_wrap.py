# SPDX-License-Identifier: Apache-2.0
# Vectors generated from the Genlib wave 12 shared vector set; do not edit the literals by hand.
import unittest
from text_wrap import TextWrapError, truncate_text, wrap_text

WRAP = [
    ['The quick brown fox jumps over the lazy dog', 1, 'T\nh\ne\nq\nu\ni\nc\nk\nb\nr\no\nw\nn\nf\no\nx\nj\nu\nm\np\ns\no\nv\ne\nr\nt\nh\ne\nl\na\nz\ny\nd\no\ng'],
    ['The quick brown fox jumps over the lazy dog', 5, 'The\nquick\nbrown\nfox\njumps\nover\nthe\nlazy\ndog'],
    ['The quick brown fox jumps over the lazy dog', 10, 'The quick\nbrown fox\njumps over\nthe lazy\ndog'],
    ['The quick brown fox jumps over the lazy dog', 20, 'The quick brown fox\njumps over the lazy\ndog'],
    ['a  b\t\tc', 1, 'a\nb\nc'],
    ['a  b\t\tc', 5, 'a b c'],
    ['a  b\t\tc', 10, 'a b c'],
    ['a  b\t\tc', 20, 'a b c'],
    ['supercalifragilisticexpialidocious word', 1, 's\nu\np\ne\nr\nc\na\nl\ni\nf\nr\na\ng\ni\nl\ni\ns\nt\ni\nc\ne\nx\np\ni\na\nl\ni\nd\no\nc\ni\no\nu\ns\nw\no\nr\nd'],
    ['supercalifragilisticexpialidocious word', 5, 'super\ncalif\nragil\nistic\nexpia\nlidoc\nious\nword'],
    ['supercalifragilisticexpialidocious word', 10, 'supercalif\nragilistic\nexpialidoc\nious word'],
    ['supercalifragilisticexpialidocious word', 20, 'supercalifragilistic\nexpialidocious word'],
    ['line one\nline two is longer than ten\n\nend', 1, 'l\ni\nn\ne\no\nn\ne\nl\ni\nn\ne\nt\nw\no\ni\ns\nl\no\nn\ng\ne\nr\nt\nh\na\nn\nt\ne\nn\n\ne\nn\nd'],
    ['line one\nline two is longer than ten\n\nend', 5, 'line\none\nline\ntwo\nis\nlonge\nr\nthan\nten\n\nend'],
    ['line one\nline two is longer than ten\n\nend', 10, 'line one\nline two\nis longer\nthan ten\n\nend'],
    ['line one\nline two is longer than ten\n\nend', 20, 'line one\nline two is longer\nthan ten\n\nend'],
    ['café 😀😀😀 naïve', 1, 'c\na\nf\né\n😀\n😀\n😀\nn\na\nï\nv\ne'],
    ['café 😀😀😀 naïve', 5, 'café\n😀😀😀\nnaïve'],
    ['café 😀😀😀 naïve', 10, 'café 😀😀😀\nnaïve'],
    ['café 😀😀😀 naïve', 20, 'café 😀😀😀 naïve'],
    ['trailing   ', 1, 't\nr\na\ni\nl\ni\nn\ng'],
    ['trailing   ', 5, 'trail\ning'],
    ['trailing   ', 10, 'trailing'],
    ['trailing   ', 20, 'trailing'],
    ['', 1, ''],
    ['', 5, ''],
    ['', 10, ''],
    ['', 20, ''],
    ['crlf\r\nand\rcr', 1, 'c\nr\nl\nf\na\nn\nd\nc\nr'],
    ['crlf\r\nand\rcr', 5, 'crlf\nand\ncr'],
    ['crlf\r\nand\rcr', 10, 'crlf\nand\ncr'],
    ['crlf\r\nand\rcr', 20, 'crlf\nand\ncr'],
]

TRUNCATE = [
    ['The quick brown fox jumps', 15, '…', 'The quick…'],
    ['The quick brown fox jumps', 100, '…', 'The quick brown fox jumps'],
    ['Supercalifragilistic', 10, '…', 'Supercali…'],
    ['Hello world', 8, '...', 'Hello...'],
    ['Hi there you', 12, '…', 'Hi there you'],
    ['a b c d e f g', 6, '…', 'a b…'],
    ['😀😀😀😀', 3, '…', '😀😀…'],
    ['abc', 3, '...', 'abc'],
    ['abcd', 3, '...', '...'],
]

INVALID_WRAP = [
    0,
]

INVALID_TRUNCATE = [
    ['long text', 2, '...'],
    ['long text', 0, ''],
]


class TextWrapTest(unittest.TestCase):
    def test_wrap(self):
        for text, width, expected in WRAP:
            self.assertEqual(wrap_text(text, width), expected, (text, width))

    def test_truncate(self):
        for text, max_len, ellipsis, expected in TRUNCATE:
            self.assertEqual(truncate_text(text, max_len, ellipsis), expected, (text, max_len))
        self.assertEqual(truncate_text("The quick brown fox jumps", 15), "The quick\u2026")

    def test_invalid(self):
        for width in INVALID_WRAP:
            with self.assertRaises(TextWrapError, msg=width):
                wrap_text("text", width)
        for text, max_len, ellipsis in INVALID_TRUNCATE:
            with self.assertRaises(TextWrapError, msg=(text, max_len)):
                truncate_text(text, max_len, ellipsis)


if __name__ == "__main__":
    unittest.main()
