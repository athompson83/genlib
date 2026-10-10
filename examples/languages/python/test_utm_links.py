# SPDX-License-Identifier: Apache-2.0
import unittest

from utm_links import build_utm_url, parse_utm, strip_tracking

REQ = {"source": "s", "medium": "m", "campaign": "c"}


class BuildTests(unittest.TestCase):
    def test_vectors(self):
        self.assertEqual(build_utm_url("https://ex.com/p?ref=a#top",
                                       {"source": "Newsletter", "medium": "email", "campaign": "Fall Sale"}),
                         "https://ex.com/p?ref=a&utm_source=newsletter&utm_medium=email&utm_campaign=fall%20sale#top")
        self.assertEqual(build_utm_url("https://ex.com/?utm_source=old",
                                       {"source": "x", "medium": "y", "campaign": "z", "content": "Hero CTA"}),
                         "https://ex.com/?utm_source=x&utm_medium=y&utm_campaign=z&utm_content=hero%20cta")

    def test_order_encoding_and_duplicates(self):
        self.assertEqual(build_utm_url("http://ex.com", {"source": " A ", "medium": "b", "campaign": "c!*'()",
                                                          "term": "k", "id": "Q4"}),
                         "http://ex.com?utm_id=q4&utm_source=a&utm_medium=b&utm_campaign=c%21%2A%27%28%29&utm_term=k")
        self.assertEqual(build_utm_url("https://ex.com/?utm_medium=a&k=1&utm_medium=b", {**REQ, "medium": "m"}),
                         "https://ex.com/?utm_medium=m&k=1&utm_source=s&utm_campaign=c")
        self.assertEqual(build_utm_url("https://ex.com/", {**REQ, "source": "café"}),
                         "https://ex.com/?utm_source=caf%C3%A9&utm_medium=m&utm_campaign=c")

    def test_validation(self):
        with self.assertRaisesRegex(ValueError, "source is required"):
            build_utm_url("https://ex.com/", {**REQ, "source": " "})
        for bad in ("/p", "mailto:a@b.c", "https://ex.com/a b"):
            with self.assertRaisesRegex(ValueError, "absolute"):
                build_utm_url(bad, REQ)
        with self.assertRaisesRegex(ValueError, "unknown"):
            build_utm_url("https://ex.com/", {**REQ, "foo": "x"})


class ParseAndStripTests(unittest.TestCase):
    def test_parse(self):
        self.assertEqual(parse_utm("https://ex.com/?a=1&utm_campaign=fall%20sale&utm_source=news+letter&utm_source=dup"),
                         {"source": "news letter", "campaign": "fall sale"})
        self.assertEqual(list(parse_utm("https://ex.com/?utm_content=c&utm_term=t&utm_id=i&utm_medium=m")),
                         ["id", "medium", "term", "content"])
        self.assertEqual(parse_utm("https://ex.com/#utm_source=x"), {})
        with self.assertRaisesRegex(ValueError, "percent-encoding"):
            parse_utm("https://ex.com/?utm_source=%E0%A4%A")

    def test_strip(self):
        self.assertEqual(strip_tracking("https://ex.com/p?id=7&utm_source=x&gclid=abc&b=2#s"), "https://ex.com/p?id=7&b=2#s")
        self.assertEqual(strip_tracking("https://ex.com/?fbclid=1"), "https://ex.com/")
        self.assertEqual(strip_tracking("https://ex.com/?q=a%20b&msclkid=1&_hsenc=2&igshid=3&x=%2F"),
                         "https://ex.com/?q=a%20b&x=%2F")
        with self.assertRaisesRegex(ValueError, "absolute"):
            strip_tracking("ex.com/?a=1")


if __name__ == "__main__":
    unittest.main()
