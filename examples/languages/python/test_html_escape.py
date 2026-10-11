# SPDX-License-Identifier: Apache-2.0
# Vectors generated from the Genlib wave 11 shared vector set; do not edit the literals by hand.
import unittest

from html_escape import escape_html, strip_tags, unescape_html

ESCAPE = [
    ['<a href="x">', '&lt;a href=&quot;x&quot;&gt;'],
    ["Tom & Jerry's", 'Tom &amp; Jerry&#39;s'],
    ['plain', 'plain'],
    ['', ''],
]
UNESCAPE = [
    ['&lt;p&gt;', '<p>'],
    ['&#169; &#xA9; &#XA9;', '© © ©'],
    ['&amp;amp;', '&amp;'],
    ['&amp no semicolon', '&amp no semicolon'],
    ['&bogus; &AMP;', '&bogus; &AMP;'],
    ['&#128; &#x9F;', '€ Ÿ'],
    ['&#0; &#xD800; &#1114112;', '� � �'],
    ['&euro;5 &mdash; &hellip;', '€5 — …'],
    ['&#99999999999;', '&#99999999999;'],
]
STRIP = [
    ['<p>Hello <b>world</b></p>', 'Hello world'],
    ['a<script>alert(1)</script>b', 'ab'],
    ['<STYLE>p{}</STYLE>x &amp; y', 'x & y'],
    ['1 < 2 and 3>1', '1 < 2 and 3>1'],
    ['<!-- c -->t', 't'],
    ['unclosed <script>evil', 'unclosed '],
]


class HtmlEscapeTest(unittest.TestCase):
    def test_escape(self):
        for text, expected in ESCAPE:
            self.assertEqual(escape_html(text), expected, text)
            self.assertEqual(unescape_html(expected), text, expected)

    def test_unescape(self):
        for text, expected in UNESCAPE:
            self.assertEqual(unescape_html(text), expected, text)
        self.assertEqual(unescape_html("&#x1F600;"), "\U0001F600")

    def test_strip(self):
        for text, expected in STRIP:
            self.assertEqual(strip_tags(text), expected, text)
        self.assertEqual(strip_tags("x<script>evil\n"), "x\n")


if __name__ == "__main__":
    unittest.main()
