# SPDX-License-Identifier: Apache-2.0
# Vectors generated from the Genlib wave 11 shared vector set; do not edit the literals by hand.
import unittest

from ini_parse import IniError, parse_ini, stringify_ini

PARSE = [
    ['a=1\nb = two\n', {'': {'a': '1', 'b': 'two'}}],
    ['[db]\nhost = localhost ; comment\nport: 5432\n', {'': {}, 'db': {'host': 'localhost', 'port': '5432'}}],
    ['; c\n# c\n\n[s]\nk="quoted \\"x\\" \\\\ ;#"\n', {'': {}, 's': {'k': 'quoted "x" \\ ;#'}}],
    ['[s]\nflag\nx = a#b\ny = a #b\n', {'': {}, 's': {'flag': '', 'x': 'a#b', 'y': 'a'}}],
    ['[a]\nk=1\n[b]\nk=2\n[a]\nk=3\nj=4\n', {'': {}, 'a': {'k': '3', 'j': '4'}, 'b': {'k': '2'}}],
    ['k: v = w\n', {'': {'k': 'v = w'}}],
    ['[ spaced name ]\nK=V\r\nk2=v2\r\n', {'': {}, 'spaced name': {'K': 'V', 'k2': 'v2'}}],
    ['', {'': {}}],
]
STRINGIFY = [
    [{'': {'a': '1'}, 's': {'k': 'v', 'e': '', 'sp': ' x', 'q': 'a"b;c'}}, 'a = 1\n\n[s]\nk = v\ne = ""\nsp = " x"\nq = "a\\"b;c"\n'],
    [{'': {}, 'only': {'x': 'y'}}, '[only]\nx = y\n'],
    [{'': {}}, ''],
]
INVALID = [
    '[unterminated\n',
    '[]\n',
    '=v\n',
    'k="open\n',
    '[a]]\n',
]


def ordered(data):
    return [(name, list(kv.items())) for name, kv in data.items()]


class IniParseTest(unittest.TestCase):
    def test_parse(self):
        for text, expected in PARSE:
            self.assertEqual(ordered(parse_ini(text)), ordered(expected), text)

    def test_stringify(self):
        for data, expected in STRINGIFY:
            self.assertEqual(stringify_ini(data), expected)
            self.assertEqual(ordered(parse_ini(expected)), ordered({"": {}, **data}))

    def test_invalid(self):
        for text in INVALID:
            with self.assertRaises(IniError, msg=text):
                parse_ini(text)
        with self.assertRaisesRegex(IniError, "^line 3:"):
            parse_ini("a=1\n\n[x\n")


if __name__ == "__main__":
    unittest.main()
