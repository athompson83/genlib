# SPDX-License-Identifier: Apache-2.0
# Vectors generated from the Genlib wave 10 shared vector set; do not edit the literals by hand.
import unittest

from link_header import LinkHeaderError, find_rel, format_link_header, parse_link_header

PARSE = [
    ['<https://api.test/items?page=2>; rel="next", <https://api.test/items?page=9>; rel="last"', [{'uri': 'https://api.test/items?page=2', 'params': {'rel': 'next'}}, {'uri': 'https://api.test/items?page=9', 'params': {'rel': 'last'}}]],
    ['<https://x/?a=1,2>; rel=next; title="a, \\"b\\"; c"', [{'uri': 'https://x/?a=1,2', 'params': {'rel': 'next', 'title': 'a, "b"; c'}}]],
    ['</TheBook/chapter2>; rel="previous"; title*=UTF-8\'de\'letztes%20Kapitel, </TheBook/chapter4>; rel="next"; title*=UTF-8\'de\'n%c3%a4chstes%20Kapitel', [{'uri': '/TheBook/chapter2', 'params': {'rel': 'previous', 'title': 'letztes Kapitel'}}, {'uri': '/TheBook/chapter4', 'params': {'rel': 'next', 'title': 'nächstes Kapitel'}}]],
    ['<http://example.org/>; REL="Start Index"; anchor="#x"; rel=ignored; hreflang=en', [{'uri': 'http://example.org/', 'params': {'rel': 'start index', 'anchor': '#x', 'hreflang': 'en'}}]],
    ['<a>;rel=x;crossorigin', [{'uri': 'a', 'params': {'rel': 'x', 'crossorigin': ''}}]],
    ['', []],
    ['  ,  <a>; rel=x ,', [{'uri': 'a', 'params': {'rel': 'x'}}]],
]
REL = [
    ['<https://api.test/items?page=2>; rel="next", <https://api.test/items?page=9>; rel="last"', 'LAST', 'https://api.test/items?page=9'],
    ['<https://api.test/items?page=2>; rel="next", <https://api.test/items?page=9>; rel="last"', 'prev', None],
]
FORMAT = [
    [[{'uri': '/a', 'params': {'rel': 'next'}}], '</a>; rel="next"'],
    [[{'uri': '/b', 'params': {'rel': 'prev', 'title': 'Page "1"', 'type': 'text/html'}}, {'uri': '/c', 'params': {'rel': 'next', 'title': '€ x'}}], '</b>; rel="prev"; title="Page \\"1\\""; type="text/html", </c>; rel="next"; title*=UTF-8\'\'%E2%82%AC%20x'],
]
INVALID = [
    'https://x; rel=next',
    '<https://x',
    '<a>; title="x',
    '<a> rel=x',
    "<a>; title*=UTF-8''%zz",
    "<a>; title*=KOI8-R''x",
]


class LinkHeaderTest(unittest.TestCase):
    def test_parse(self):
        for header, expected in PARSE:
            got = parse_link_header(header)
            self.assertEqual(got, expected, header)
            self.assertEqual([list(link["params"]) for link in got], [list(link["params"]) for link in expected])

    def test_rel(self):
        for header, rel, uri in REL:
            link = find_rel(parse_link_header(header), rel)
            self.assertEqual(link and link["uri"], uri, rel)

    def test_format(self):
        for links, expected in FORMAT:
            self.assertEqual(format_link_header(links), expected)
            self.assertEqual(parse_link_header(expected), links)

    def test_invalid(self):
        for header in INVALID:
            with self.assertRaises(LinkHeaderError, msg=header):
                parse_link_header(header)
        with self.assertRaises(LinkHeaderError):
            parse_link_header("<a>; title*=UTF-8''%FF")


if __name__ == "__main__":
    unittest.main()
