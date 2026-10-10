# SPDX-License-Identifier: Apache-2.0
# Vectors copied from the Genlib wave 6 shared vector set.
import unittest

from http_conditional import evaluate_conditional, format_http_date, parse_etags, parse_http_date

CASES = [({'method': 'GET', 'etag': '"v2"', 'if_none_match': '"v2"'}, 304),
 ({'method': 'GET', 'etag': '"v2"', 'if_none_match': 'W/"v2"'}, 304),
 ({'method': 'GET', 'etag': 'W/"v2"', 'if_none_match': '"v1", "v2"'}, 304),
 ({'method': 'GET', 'etag': '"v2"', 'if_none_match': '"v1"'}, 200),
 ({'method': 'HEAD', 'etag': '"v2"', 'if_none_match': '*'}, 304),
 ({'method': 'PUT', 'etag': '"v2"', 'if_none_match': '*'}, 412),
 ({'method': 'PUT', 'if_none_match': '*'}, 200),
 ({'method': 'PUT', 'etag': '"v2"', 'if_match': '"v2"'}, 200),
 ({'method': 'PUT', 'etag': '"v2"', 'if_match': '"v1"'}, 412),
 ({'method': 'PUT', 'etag': 'W/"v2"', 'if_match': 'W/"v2"'}, 412),
 ({'method': 'DELETE', 'if_match': '*'}, 412),
 ({'method': 'DELETE', 'etag': '"a"', 'if_match': '*'}, 200),
 ({'method': 'GET',
   'etag': '"v2"',
   'last_modified': 1792567680,
   'if_modified_since': 'Wed, 21 Oct 2026 07:28:00 GMT'},
  304),
 ({'method': 'GET',
   'etag': '"v2"',
   'last_modified': 1792567680,
   'if_modified_since': 'Tue, 20 Oct 2026 07:28:00 GMT'},
  200),
 ({'method': 'GET',
   'etag': '"v2"',
   'last_modified': 1792567680,
   'if_none_match': '"v1"',
   'if_modified_since': 'Wed, 21 Oct 2026 07:28:00 GMT'},
  200),
 ({'method': 'POST', 'last_modified': 1792567680, 'if_modified_since': 'Wed, 21 Oct 2026 07:28:00 GMT'}, 200),
 ({'method': 'PUT', 'last_modified': 1792567680, 'if_unmodified_since': 'Tue, 20 Oct 2026 07:28:00 GMT'},
  412),
 ({'method': 'PUT', 'last_modified': 1792567680, 'if_unmodified_since': 'Wed, 21 Oct 2026 07:28:00 GMT'},
  200),
 ({'method': 'GET', 'last_modified': 1792567680, 'if_modified_since': 'Wednesday, 21-Oct-26 07:28:00 GMT'},
  200),
 ({'method': 'GET', 'etag': '"v2"', 'if_none_match': 'v2'}, 200),
 ({'method': 'PUT',
   'etag': '"v2"',
   'if_match': '"v2"',
   'if_unmodified_since': 'Tue, 20 Oct 2026 07:28:00 GMT'},
  200)]
PARSE = [('"a", W/"b" ,"c"', ['"a"', 'W/"b"', '"c"']),
 ('*', '*'),
 (' * ', '*'),
 ('W/"x", bogus, "y"', ['W/"x"', '"y"']),
 ('""', ['""'])]


class HttpConditionalTests(unittest.TestCase):
    def test_cases(self):
        for request, expected in CASES:
            self.assertEqual(evaluate_conditional(**request), expected, request)

    def test_parse(self):
        for header, expected in PARSE:
            self.assertEqual(parse_etags(header), expected, header)

    def test_dates(self):
        self.assertEqual(parse_http_date("Wed, 21 Oct 2026 07:28:00 GMT"), 1792567680)
        self.assertEqual(format_http_date(1792567680), "Wed, 21 Oct 2026 07:28:00 GMT")
        for bad in ["Thu, 21 Oct 2026 07:28:00 GMT", "Wed, 21 Oct 2026 07:28:00 UTC", "Wed, 1 Oct 2026 07:28:00 GMT",
                    "Sat, 30 Feb 2026 00:00:00 GMT", "Wednesday, 21-Oct-26 07:28:00 GMT"]:
            self.assertIsNone(parse_http_date(bad), bad)


if __name__ == "__main__":
    unittest.main()
