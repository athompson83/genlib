# SPDX-License-Identifier: Apache-2.0
# Vectors generated from the Genlib wave 10 shared vector set; do not edit the literals by hand.
import unittest

from dotenv import DotenvError, parse_dotenv

PARSE = [
    ['A=1\nB=two\n', {'A': '1', 'B': 'two'}],
    ['# c\n\nexport KEY = value with spaces  # comment\n', {'KEY': 'value with spaces'}],
    ['Q="a\\nb\\t\\"c\\" \\\\ \\$HOME"\n', {'Q': 'a\nb\t"c" \\ $HOME'}],
    ["S='raw ${X} \\n'\n", {'S': 'raw ${X} \\n'}],
    ['M="line1\nline2"\nN=after\n', {'M': 'line1\nline2', 'N': 'after'}],
    ['E=\nF= \n', {'E': '', 'F': ''}],
    ['DUP=1\nDUP=2\n', {'DUP': '2'}],
    ['URL=https://x.test/#frag\n', {'URL': 'https://x.test/#frag'}],
    ['H=a#b\n', {'H': 'a#b'}],
    ['K.x_y=1\n', {'K.x_y': '1'}],
    ['W="x" # trailing ok\n', {'W': 'x'}],
    ['CRLF=1\r\nNEXT=2\r\n', {'CRLF': '1', 'NEXT': '2'}],
]
EXPAND = [
    ['A=1\nB=${A}-x\n', {}, {'A': '1', 'B': '1-x'}],
    ['B=${A}\nA=1\n', {'A': 'env'}, {'B': 'env', 'A': '1'}],
    ['P=${MISSING:-fallback}\nQ=${EMPTY:-d}\n', {'EMPTY': ''}, {'P': 'fallback', 'Q': 'd'}],
    ['S=\'${A}\'\nT="${A}"\nU="\\${A}"\n', {'A': 'v'}, {'S': '${A}', 'T': 'v', 'U': '${A}'}],
]
INVALID = [
    'NOEQUALS\n',
    '1BAD=x\n',
    "A='unterminated\n",
    'A="never closed\nB=1\n',
    'A="x" junk\n',
    '-K=v\n',
]


class DotenvTest(unittest.TestCase):
    def test_parse(self):
        for text, expected in PARSE:
            got = parse_dotenv(text)
            self.assertEqual(got, expected, text)
            self.assertEqual(list(got), list(expected), text)

    def test_expand(self):
        for text, env, expected in EXPAND:
            got = parse_dotenv(text, True, env)
            self.assertEqual(got, expected, text)
            self.assertEqual(list(got), list(expected), text)

    def test_invalid(self):
        for text in INVALID:
            with self.assertRaises(DotenvError, msg=text):
                parse_dotenv(text)
        with self.assertRaisesRegex(DotenvError, "^line 3:"):
            parse_dotenv("A=1\n\nB='x\n")


if __name__ == "__main__":
    unittest.main()
