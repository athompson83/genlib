# SPDX-License-Identifier: Apache-2.0
# Vectors copied from the Genlib wave 6 shared vector set.
import unittest

from cookies import parse_cookie_header, serialize_cookie

# Option names use the Python spelling (max_age, http_only, same_site) of the shared vectors.
SERIALIZE = [({'name': 'sid', 'value': 'abc123', 'path': '/', 'secure': True, 'http_only': True, 'same_site': 'Lax'},
  'sid=abc123; Path=/; Secure; HttpOnly; SameSite=Lax'),
 ({'name': '__Host-session',
   'value': 'x.y.z',
   'path': '/',
   'secure': True,
   'http_only': True,
   'same_site': 'Strict',
   'max_age': 3600},
  '__Host-session=x.y.z; Max-Age=3600; Path=/; Secure; HttpOnly; SameSite=Strict'),
 ({'name': 'theme',
   'value': 'dark',
   'max_age': 0,
   'expires': 1792567680,
   'domain': 'Example.COM',
   'path': '/app'},
  'theme=dark; Max-Age=0; Expires=Wed, 21 Oct 2026 07:28:00 GMT; Domain=example.com; Path=/app'),
 ({'name': 'embed', 'value': '1', 'secure': True, 'same_site': 'None', 'partitioned': True},
  'embed=1; Secure; SameSite=None; Partitioned'),
 ({'name': 'empty', 'value': ''}, 'empty=')]
INVALID = [{'name': 'bad name', 'value': 'v'},
 {'name': 'n', 'value': 'a;b'},
 {'name': 'n', 'value': 'a b'},
 {'name': 'n', 'value': 'a"b'},
 {'name': 'n', 'value': 'v', 'same_site': 'None'},
 {'name': '__Secure-x', 'value': 'v'},
 {'name': '__Host-x', 'value': 'v', 'secure': True, 'path': '/a'},
 {'name': '__Host-x', 'value': 'v', 'secure': True, 'path': '/', 'domain': 'example.com'},
 {'name': 'n', 'value': 'v', 'path': 'relative'},
 {'name': 'n', 'value': 'v', 'same_site': 'lax'},
 {'name': 'n', 'value': 'v', 'partitioned': True},
 {'name': 'n', 'value': 'v', 'max_age': -1},
 {'name': '', 'value': 'v'}]
PARSE = [('sid=abc; theme=dark', [('sid', 'abc'), ('theme', 'dark')]),
 (' a = 1 ;b=2;; c="quoted value" ;flag;d==x', [('a', '1'), ('b', '2'), ('c', 'quoted value'), ('d', '=x')]),
 ('a=1; a=2', [('a', '1'), ('a', '2')]),
 ('', [])]


class CookiesTests(unittest.TestCase):
    def test_serialize(self):
        for options, expected in SERIALIZE:
            self.assertEqual(serialize_cookie(**options), expected)

    def test_invalid(self):
        for options in INVALID:
            with self.assertRaises(ValueError, msg=str(options)):
                serialize_cookie(**options)

    def test_parse(self):
        for header, expected in PARSE:
            self.assertEqual(parse_cookie_header(header), expected, header)


if __name__ == "__main__":
    unittest.main()
