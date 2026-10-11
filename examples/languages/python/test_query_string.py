# SPDX-License-Identifier: Apache-2.0
# Vectors generated from the Genlib wave 10 shared vector set; do not edit the literals by hand.
import unittest

from query_string import get_all, parse_query, stringify_query

PARSE = [
    ['a=1&b=2', [['a', '1'], ['b', '2']]],
    ['?a=1&a=2', [['a', '1'], ['a', '2']]],
    ['x=a+b%20c', [['x', 'a b c']]],
    ['e=%E2%82%AC', [['e', '€']]],
    ['bad=%zz&ok=1', [['bad', '%zz'], ['ok', '1']]],
    ['%', [['%', '']]],
    ['&&a&&', [['a', '']]],
    ['k=v=w', [['k', 'v=w']]],
    ['=v', [['', 'v']]],
    ['emoji=%F0%9F%98%80', [['emoji', '😀']]],
    ['invalid=%FF', [['invalid', '�']]],
    ['plus=%2B', [['plus', '+']]],
]
STRINGIFY = [
    [[['a', '1'], ['b', 'x y']], 'a=1&b=x+y'],
    [[['q', 'a&b=c'], ['e', '€']], 'q=a%26b%3Dc&e=%E2%82%AC'],
    [[['*-._', "~!'()"]], '*-._=%7E%21%27%28%29'],
    [[['k', ''], ['', 'v']], 'k=&=v'],
]
GET_ALL = [
    ['a=1&b=2&a=3', 'a', ['1', '3']],
]


class QueryStringTest(unittest.TestCase):
    def test_parse(self):
        for text, expected in PARSE:
            self.assertEqual(parse_query(text), expected, text)

    def test_stringify(self):
        for pairs, expected in STRINGIFY:
            self.assertEqual(stringify_query(pairs), expected)
            self.assertEqual(parse_query(expected), pairs)

    def test_get_all(self):
        for text, name, expected in GET_ALL:
            self.assertEqual(get_all(parse_query(text), name), expected)


if __name__ == "__main__":
    unittest.main()
