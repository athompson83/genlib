# SPDX-License-Identifier: Apache-2.0
# Vectors generated from the Genlib wave 10 shared vector set; do not edit the literals by hand.
import unittest

from glob_match import GlobError, glob_filter, glob_match

MATCH = [
    ['*.js', 'a.js', False, True],
    ['*.js', 'a/b.js', False, False],
    ['**/*.js', 'a/b/c.js', False, True],
    ['**/*.js', 'c.js', False, True],
    ['src/**', 'src', False, True],
    ['src/**', 'src/a/b.ts', False, True],
    ['src/**/test/*.py', 'src/test/x.py', False, True],
    ['src/**/test/*.py', 'src/a/b/test/x.py', False, True],
    ['a?c', 'abc', False, True],
    ['a?c', 'a/c', False, False],
    ['[a-c]x', 'bx', False, True],
    ['[!a-c]x', 'bx', False, False],
    ['[!a-c]x', 'dx', False, True],
    ['[^0-9]', 'x', False, True],
    ['[]a]', 'a', False, True],
    ['[]a]', ']', False, True],
    ['*.{js,ts}', 'x.ts', False, True],
    ['*.{js,ts}', 'x.tsx', False, False],
    ['{src,lib}/**/*.go', 'lib/x/y.go', False, True],
    ['.*', '.env', False, True],
    ['*', '.env', False, False],
    ['*', '.env', True, True],
    ['**/x', '.git/x', False, False],
    ['**/x', '.git/x', True, True],
    ['a\\*b', 'a*b', False, True],
    ['a\\*b', 'axb', False, False],
    ['*', '', False, True],
    ['**', 'a/b/c', False, True],
    ['a/**/b', 'a/b', False, True],
    ['a/**/b', 'a/x/y/b', False, True],
    ['*.txt', 'notes.TXT', False, False],
    ['[a-z]*.md', 'Readme.md', False, False],
    ['docs/*', 'docs/a/b', False, False],
    ['?', 'é', False, True],
]
INVALID = [
    '[abc',
    '{a,b',
    'a{b{c}}',
    '',
    'x\\',
]


class GlobMatchTest(unittest.TestCase):
    def test_match(self):
        for pattern, path, dot, expected in MATCH:
            self.assertEqual(glob_match(pattern, path, dot), expected, (pattern, path, dot))

    def test_invalid(self):
        for pattern in INVALID:
            with self.assertRaises(GlobError, msg=pattern):
                glob_match(pattern, "x")
        with self.assertRaises(ValueError):
            glob_match("}", "x")

    def test_filter(self):
        paths = ["src/a.ts", "src/b.js", "src/.hidden/c.ts", "lib/d.ts", "README.md"]
        self.assertEqual(glob_filter("src/**/*.ts", paths), ["src/a.ts"])
        self.assertEqual(glob_filter("src/**/*.ts", paths, dot=True), ["src/a.ts", "src/.hidden/c.ts"])
        self.assertEqual(glob_filter("{src,lib}/*.ts", paths), ["src/a.ts", "lib/d.ts"])

    def test_no_exponential_blowup(self):
        self.assertFalse(glob_match("**/" * 30 + "*a*a*a*a*a*a*a*a*b", "/".join(["a"] * 30) + "/" + "a" * 40))


if __name__ == "__main__":
    unittest.main()
