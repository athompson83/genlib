# SPDX-License-Identifier: Apache-2.0
# Vectors generated from the Genlib wave 10 shared vector set; do not edit the literals by hand.
import unittest

from data_uri import DataUriError, build_data_uri, parse_data_uri

PARSE = [
    ['data:,Hello%2C%20World!', {'mime': 'text/plain', 'params': {'charset': 'US-ASCII'}, 'base64': False, 'data_hex': '48656c6c6f2c20576f726c6421'}],
    ['data:text/plain;base64,SGVsbG8sIFdvcmxkIQ==', {'mime': 'text/plain', 'params': {}, 'base64': True, 'data_hex': '48656c6c6f2c20576f726c6421'}],
    ['data:text/html;charset=utf-8,%3Ch1%3EHi%3C%2Fh1%3E', {'mime': 'text/html', 'params': {'charset': 'utf-8'}, 'base64': False, 'data_hex': '3c68313e48693c2f68313e'}],
    ['DATA:image/png;BASE64,iVBORw0KGgo=', {'mime': 'image/png', 'params': {}, 'base64': True, 'data_hex': '89504e470d0a1a0a'}],
    ['data:;base64,SGk', {'mime': 'text/plain', 'params': {'charset': 'US-ASCII'}, 'base64': True, 'data_hex': '4869'}],
    ['data:text/plain;charset=utf-8;foo=bar,x', {'mime': 'text/plain', 'params': {'charset': 'utf-8', 'foo': 'bar'}, 'base64': False, 'data_hex': '78'}],
    ['data:application/json,%7B%22a%22%3A1%7D', {'mime': 'application/json', 'params': {}, 'base64': False, 'data_hex': '7b2261223a317d'}],
    ['data:bogus,x', {'mime': 'text/plain', 'params': {'charset': 'US-ASCII'}, 'base64': False, 'data_hex': '78'}],
    ['data:text/plain;base64,SG Vs\nbG8=', {'mime': 'text/plain', 'params': {}, 'base64': True, 'data_hex': '48656c6c6f'}],
    ['data:;charset=utf-8,%E2%82%AC', {'mime': 'text/plain', 'params': {'charset': 'utf-8'}, 'base64': False, 'data_hex': 'e282ac'}],
    ['data:,a%zzb', {'mime': 'text/plain', 'params': {'charset': 'US-ASCII'}, 'base64': False, 'data_hex': '61257a7a62'}],
]
BUILD = [
    ['48656c6c6f2c20576f726c6421', 'text/plain', None, 'data:text/plain,Hello,%20World!'],
    ['89504e470d0a', 'image/png', None, 'data:image/png;base64,iVBORw0K'],
    ['7b2261223a317d', 'application/json', None, 'data:application/json,%7B%22a%22:1%7D'],
    ['e282ac202620c3bc', 'text/plain;charset=utf-8', None, 'data:text/plain;charset=utf-8,%E2%82%AC%20&%20%C3%BC'],
    ['fffe', 'text/plain', None, 'data:text/plain;base64,//4='],
    ['616263', 'text/plain', True, 'data:text/plain;base64,YWJj'],
    ['', 'application/octet-stream', None, 'data:application/octet-stream;base64,'],
    ['6120622f633f64', 'text/plain', False, 'data:text/plain,a%20b/c?d'],
]
INVALID_PARSE = [
    'text/plain,x',
    'data:text/plain',
    'data:;base64,a',
    'data:;base64,@@@@',
    'data:;base64,SGVsbG8=x',
]
INVALID_BUILD = [
    ['00', 'not a type'],
    ['00', 'text/plain; charset'],
]


class DataUriTest(unittest.TestCase):
    def test_parse(self):
        for url, expected in PARSE:
            got = parse_data_uri(url)
            self.assertEqual(got["mime"], expected["mime"], url)
            self.assertEqual(got["params"], expected["params"], url)
            self.assertEqual(list(got["params"]), list(expected["params"]), url)
            self.assertEqual(got["base64"], expected["base64"], url)
            self.assertEqual(got["data"], bytes.fromhex(expected["data_hex"]), url)

    def test_build(self):
        for data_hex, mime, b64, expected in BUILD:
            data = bytes.fromhex(data_hex)
            self.assertEqual(build_data_uri(data, mime, b64), expected)
            self.assertEqual(parse_data_uri(expected)["data"], data)

    def test_invalid(self):
        for url in INVALID_PARSE:
            with self.assertRaises(DataUriError, msg=url):
                parse_data_uri(url)
        for data_hex, mime in INVALID_BUILD:
            with self.assertRaises(DataUriError, msg=mime):
                build_data_uri(bytes.fromhex(data_hex), mime)


if __name__ == "__main__":
    unittest.main()
