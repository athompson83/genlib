# SPDX-License-Identifier: Apache-2.0
# Vectors copied from the Genlib wave 6 shared vector set.
import unittest

from content_negotiation import negotiate_language, negotiate_media_type

MEDIA_AVAILABLE = ['application/json', 'text/html', 'text/csv']
MEDIA = [('application/json', 'application/json'),
 ('text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8', 'text/html'),
 ('text/*;q=0.5, application/json;q=0.4', 'text/html'),
 ('*/*', 'application/json'),
 ('text/csv;q=0, text/*', 'text/html'),
 ('image/png', None),
 ('application/json;q=0', None),
 ('TEXT/HTML', 'text/html'),
 ('text/html;q=1.5, text/csv', 'text/csv'),
 (None, 'application/json'),
 ('', 'application/json'),
 ('application/*;q=0.2, */*;q=0.1', 'application/json'),
 ('text/html;level=1;q=0.7, text/csv;q=0.7', 'text/html')]
LANGUAGE_AVAILABLE = ['en', 'en-GB', 'fr', 'pt-BR']
LANGUAGE = [('fr-CH, fr;q=0.9, en;q=0.8, de;q=0.7, *;q=0.5', 'fr'),
 ('en-GB', 'en-GB'),
 ('en-US,en;q=0.9', 'en'),
 ('pt', 'pt-BR'),
 ('de', None),
 ('de, *;q=0.1', 'en'),
 ('en;q=0, *', 'fr'),
 ('PT-br', 'pt-BR'),
 (None, 'en'),
 ('zh-Hant-TW', None)]


class ContentNegotiationTests(unittest.TestCase):
    def test_media(self):
        for header, expected in MEDIA:
            self.assertEqual(negotiate_media_type(header, MEDIA_AVAILABLE), expected, header)

    def test_language(self):
        for header, expected in LANGUAGE:
            self.assertEqual(negotiate_language(header, LANGUAGE_AVAILABLE), expected, header)

    def test_empty_available(self):
        self.assertIsNone(negotiate_media_type(None, []))
        self.assertIsNone(negotiate_language("en", []))


if __name__ == "__main__":
    unittest.main()
