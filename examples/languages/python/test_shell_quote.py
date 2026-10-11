# SPDX-License-Identifier: Apache-2.0
# Vectors generated from the Genlib wave 12 shared vector set; do not edit the literals by hand.
import unittest
from shell_quote import ShellQuoteError, shell_join, shell_quote, shell_split

QUOTE = [
    ['', "''"],
    ['abc', 'abc'],
    ['a b', "'a b'"],
    ["it's", "'it'\\''s'"],
    ['a"b', '\'a"b\''],
    ['$HOME', "'$HOME'"],
    ['*.txt', "'*.txt'"],
    ['x=1', 'x=1'],
    ['path/to/file.txt', 'path/to/file.txt'],
    ['tab\there', "'tab\there'"],
    ['line\nbreak', "'line\nbreak'"],
    ['é', "'é'"],
    ['-n', '-n'],
    ['~user', "'~user'"],
    ['!bang', "'!bang'"],
    ["''", "''\\'''\\'''"],
]

JOIN = [
    [['ls', '-la', 'my file', "it's"], "ls -la 'my file' 'it'\\''s'"],
    [[], ''],
]

SPLIT = [
    ['a b  c', ['a', 'b', 'c']],
    ["'a b' c", ['a b', 'c']],
    ['"a b" c', ['a b', 'c']],
    ['a\\ b', ['a b']],
    ['"say \\"hi\\""', ['say "hi"']],
    ['"keep \\n and \\x"', ['keep \\n and \\x']],
    ["'no \\escape'", ['no \\escape']],
    ['x"y"\'z\'w', ['xyzw']],
    ['\'\' ""', ['', '']],
    ['a\tb\nc', ['a', 'b', 'c']],
    ['echo $HOME *.txt ~', ['echo', '$HOME', '*.txt', '~']],
    ['"a\\\nb"', ['ab']],
    ['a\\\nb', ['ab']],
    ['# comment', []],
    ['cmd # trailing comment', ['cmd']],
    ['a#b', ['a#b']],
    ['"$x"', ['$x']],
    ['  lead  trail  ', ['lead', 'trail']],
]

ROUNDTRIP = [
    '',
    'abc',
    'a b',
    "it's",
    'a"b',
    '$HOME',
    '*.txt',
    'x=1',
    'path/to/file.txt',
    'tab\there',
    'line\nbreak',
    'é',
    '-n',
    '~user',
    '!bang',
    "''",
]

INVALID_SPLIT = [
    "'open",
    '"open',
    'trail\\',
    '"bad \\',
]


class ShellQuoteTest(unittest.TestCase):
    def test_quote_join(self):
        for arg, expected in QUOTE:
            self.assertEqual(shell_quote(arg), expected, arg)
        for args, expected in JOIN:
            self.assertEqual(shell_join(args), expected, args)

    def test_split(self):
        for line, expected in SPLIT:
            self.assertEqual(shell_split(line), expected, line)
        for arg in ROUNDTRIP:
            self.assertEqual(shell_split(shell_quote(arg)), [arg], arg)
        args = [a for a, _ in QUOTE]
        self.assertEqual(shell_split(shell_join(args)), args)

    def test_invalid(self):
        for line in INVALID_SPLIT:
            with self.assertRaises(ShellQuoteError, msg=line):
                shell_split(line)


if __name__ == "__main__":
    unittest.main()
