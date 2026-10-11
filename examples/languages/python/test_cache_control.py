# SPDX-License-Identifier: Apache-2.0
# Vectors generated from the Genlib wave 10 shared vector set; do not edit the literals by hand.
import unittest

from cache_control import (
    CacheControlError,
    cache_freshness,
    format_cache_control,
    parse_cache_control,
)

PARSE = [
    ['public, max-age=600', {'public': True, 'max-age': 600}],
    ['no-store', {'no-store': True}],
    ['private="set-cookie, x-y", max-age=0', {'private': 'set-cookie, x-y', 'max-age': 0}],
    ['max-age="120", s-maxage=60, must-revalidate', {'max-age': 120, 's-maxage': 60, 'must-revalidate': True}],
    ['max-age=abc, max-age=30', {'max-age': 30}],
    ['MAX-AGE=5, Max-Age=9', {'max-age': 5}],
    ['max-stale', {'max-stale': True}],
    ['max-stale=120, min-fresh=10', {'max-stale': 120, 'min-fresh': 10}],
    ['stale-while-revalidate=30, immutable', {'stale-while-revalidate': 30, 'immutable': True}],
    [',, public ,,', {'public': True}],
    ['no-cache="Set-Cookie"', {'no-cache': 'Set-Cookie'}],
    ['foo=bar, baz="q\\"t"', {'foo': 'bar', 'baz': 'q"t'}],
]
FORMAT = [
    [{'public': True, 'max-age': 600}, 'public, max-age=600'],
    [{'private': 'set-cookie, x', 'no-cache': True}, 'private="set-cookie, x", no-cache'],
    [{'s-maxage': 0, 'stale-if-error': 86400}, 's-maxage=0, stale-if-error=86400'],
]
FRESHNESS = [
    ['max-age=600', False, 600],
    ['max-age=600, s-maxage=60', True, 60],
    ['max-age=600, s-maxage=60', False, 600],
    ['no-store, max-age=600', False, 0],
    ['no-cache', True, 0],
    ['public', False, None],
]
INVALID = [
    'private="unterminated',
]


class CacheControlTest(unittest.TestCase):
    def test_parse(self):
        for header, expected in PARSE:
            got = parse_cache_control(header)
            self.assertEqual(got, expected, header)
            self.assertEqual(list(got), list(expected), header)
            for key, value in got.items():
                self.assertIs(type(value), type(expected[key]), (header, key))

    def test_format(self):
        for directives, expected in FORMAT:
            self.assertEqual(format_cache_control(directives), expected)
            self.assertEqual(parse_cache_control(expected), directives)

    def test_freshness(self):
        for header, shared, expected in FRESHNESS:
            self.assertEqual(cache_freshness(parse_cache_control(header), shared), expected, header)

    def test_invalid(self):
        for header in INVALID:
            with self.assertRaises(CacheControlError, msg=header):
                parse_cache_control(header)


if __name__ == "__main__":
    unittest.main()
