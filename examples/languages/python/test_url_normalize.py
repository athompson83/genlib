# SPDX-License-Identifier: Apache-2.0
# Vectors copied from the Genlib wave 6 shared vector set.
import unittest

from url_normalize import normalize_url, remove_dot_segments

REMOVE_DOT_SEGMENTS = [('/a/b/c/./../../g', '/a/g'),
 ('mid/content=5/../6', 'mid/6'),
 ('/../a', '/a'),
 ('/a/./b/.', '/a/b/'),
 ('/a/b/..', '/a/'),
 ('.', ''),
 ('../x', 'x'),
 ('/a//b/../c', '/a//c')]
NORMALIZE = [('HTTP://Example.COM:80/%7Euser/./a/../b?q=%2f', 'http://example.com/~user/b?q=%2F'),
 ('https://example.com', 'https://example.com/'),
 ('https://example.com:443/a%2Fb#frag', 'https://example.com/a%2Fb'),
 ('http://example.com:8080/A/B/../C?', 'http://example.com:8080/A/C'),
 ('https://[2001:DB8::0:1]:8443/x', 'https://[2001:db8::1]:8443/x'),
 ('https://example.com/%e2%82%ac', 'https://example.com/%E2%82%AC'),
 ('http://example.com:/p', 'http://example.com/p'),
 ('https://EXAMPLE.com/a%20b', 'https://example.com/a%20b')]
INVALID = ['ftp://example.com/',
 'https://user@example.com/',
 'https://exa mple.com/',
 '//example.com/',
 'https://example.com/%zz',
 'https://example.com:99999/',
 'example.com/path',
 'https://[::g]/']


class UrlNormalizeTests(unittest.TestCase):
    def test_remove_dot_segments(self):
        for path, expected in REMOVE_DOT_SEGMENTS:
            self.assertEqual(remove_dot_segments(path), expected, path)

    def test_normalize(self):
        for url, expected in NORMALIZE:
            self.assertEqual(normalize_url(url), expected, url)
            self.assertEqual(normalize_url(expected), expected, expected)

    def test_invalid(self):
        for url in INVALID:
            with self.assertRaises(ValueError, msg=url):
                normalize_url(url)


if __name__ == "__main__":
    unittest.main()
