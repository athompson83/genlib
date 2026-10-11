# SPDX-License-Identifier: Apache-2.0
# Vectors generated from the Genlib wave 11 shared vector set; do not edit the literals by hand.
import unittest

from punycode import (
    PunycodeError,
    domain_to_ascii,
    domain_to_unicode,
    punycode_decode,
    punycode_encode,
)

ENCODE = [
    ['bücher', 'bcher-kva'],
    ['münchen', 'mnchen-3ya'],
    ['日本語', 'wgv71a119e'],
    ['ü', 'tda'],
    ['abc', 'abc-'],
    ['Mañana', 'Maana-pta'],
    ['ελληνικά', 'hxargifdar'],
    ['правда', '80aafi6cg'],
    ['😀', 'e28h'],
    ['a-b', 'a-b-'],
    ['-', '--'],
    ['الحريه', 'mgbmm8erar'],
    ['Hello-Another-Way-それぞれの場所', 'Hello-Another-Way--fc4qua05auwb3674vfr0b'],
    ['ÜBER', 'BER-ska'],
    ['xé́', 'x-bga22n'],
]
DECODE = [
    ['bcher-kva', 'bücher'],
    ['mnchen-3ya', 'münchen'],
    ['wgv71a119e', '日本語'],
    ['tda', 'ü'],
    ['abc-', 'abc'],
    ['Maana-pta', 'Mañana'],
    ['hxargifdar', 'ελληνικά'],
    ['80aafi6cg', 'правда'],
    ['e28h', '😀'],
    ['a-b-', 'a-b'],
    ['--', '-'],
    ['mgbmm8erar', 'الحريه'],
    ['Hello-Another-Way--fc4qua05auwb3674vfr0b', 'Hello-Another-Way-それぞれの場所'],
    ['BER-ska', 'ÜBER'],
    ['x-bga22n', 'xé́'],
    ['bcher-kva', 'bücher'],
]
DOMAIN_TO_ASCII = [
    ['Bücher.Example', 'xn--bcher-kva.example'],
    ['EXAMPLE.com', 'example.com'],
    ['日本語.jp.', 'xn--wgv71a119e.jp.'],
    ['münchen.de', 'xn--mnchen-3ya.de'],
    ['a.b.c', 'a.b.c'],
]
DOMAIN_TO_UNICODE = [
    ['xn--bcher-kva.example', 'bücher.example'],
    ['XN--wgv71a119e.jp', '日本語.jp'],
    ['plain.com', 'plain.com'],
]
INVALID_DECODE = [
    'bcher-kv!',
    'a-99999999999999999999',
    'ü-abc',
    'xyzzy123456789zzzz',
]
INVALID_DOMAIN = [
    'a..b',
    '.x',
    'xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx.com',
    'üüüüüüüüüüüüüüüüüüüüüüüüüüüüüüüüüüüüüüüüüüüüüüüüüüüüüüüüüüüü.com',
]


class PunycodeTest(unittest.TestCase):
    def test_encode_decode(self):
        for text, encoded in ENCODE:
            self.assertEqual(punycode_encode(text), encoded, text)
            self.assertEqual(punycode_decode(encoded), text, encoded)
        for encoded, text in DECODE:
            self.assertEqual(punycode_decode(encoded), text, encoded)

    def test_domains(self):
        for domain, expected in DOMAIN_TO_ASCII:
            self.assertEqual(domain_to_ascii(domain), expected, domain)
        for domain, expected in DOMAIN_TO_UNICODE:
            self.assertEqual(domain_to_unicode(domain), expected, domain)

    def test_invalid(self):
        for text in INVALID_DECODE:
            with self.assertRaises(PunycodeError, msg=text):
                punycode_decode(text)
        for domain in INVALID_DOMAIN:
            with self.assertRaises(PunycodeError, msg=domain):
                domain_to_ascii(domain)
        for text in ["a-\u00fc", "a-\U0010ffff"]:
            with self.assertRaises(PunycodeError, msg=text):
                punycode_decode(text)
        self.assertIsInstance(PunycodeError("x"), ValueError)

    def test_code_points_and_case(self):
        self.assertEqual(punycode_decode("BCHER-KVA"), "B\u00fcCHER")
        self.assertEqual(domain_to_ascii("\u00dcBER.de"), "xn--ber-ska.de")
        self.assertEqual(domain_to_ascii("example.com."), "example.com.")
        self.assertEqual(punycode_decode("-a"), "\x80")


if __name__ == "__main__":
    unittest.main()
