# SPDX-License-Identifier: Apache-2.0
import unittest

from structured_data import json_ld_script, meta_tags

LS, PS = chr(0x2028), chr(0x2029)
OPEN = '<script type="application/ld+json">'
FULL = "\n".join([
    "<title>Tom &amp; &quot;Jerry&quot;</title>",
    '<meta name="description" content="Cat &lt;3 mouse">',
    '<link rel="canonical" href="https://ex.com/tj">',
    '<meta property="og:title" content="Tom &amp; &quot;Jerry&quot;">',
    '<meta property="og:description" content="Cat &lt;3 mouse">',
    '<meta property="og:url" content="https://ex.com/tj">',
    '<meta property="og:image" content="https://ex.com/tj.png">',
    '<meta property="og:site_name" content="Ex">',
    '<meta property="og:type" content="website">',
    '<meta name="twitter:card" content="summary_large_image">',
    '<meta name="twitter:title" content="Tom &amp; &quot;Jerry&quot;">',
    '<meta name="twitter:description" content="Cat &lt;3 mouse">',
    '<meta name="twitter:image" content="https://ex.com/tj.png">',
])


class JsonLdTests(unittest.TestCase):
    def test_vector(self):
        data = {"@context": "https://schema.org", "@type": "Organization", "name": "A&B </script>",
                "url": "https://ab.example", "sameAs": ["https://x.com/ab"]}
        self.assertEqual(json_ld_script(data), OPEN + '{"@context":"https://schema.org","@type":"Organization",'
                         '"name":"A\\u0026B \\u003c/script\\u003e","url":"https://ab.example",'
                         '"sameAs":["https://x.com/ab"]}</script>')

    def test_values(self):
        data = {"a": 1, "b": 2.5, "c": True, "d": None, "e": {"f": [1, f"x{LS}y{PS}"]}, "g": 'q"\\\n', "h": 3.0}
        self.assertEqual(json_ld_script(data), OPEN + '{"a":1,"b":2.5,"c":true,"d":null,'
                         '"e":{"f":[1,"x\\u2028y\\u2029"]},"g":"q\\"\\\\\\n","h":3}</script>')

    def test_rejects(self):
        for bad in ({"n": float("nan")}, {"n": float("inf")}):
            with self.assertRaisesRegex(ValueError, "finite"):
                json_ld_script(bad)
        with self.assertRaisesRegex(TypeError, "unsupported"):
            json_ld_script({"s": {1, 2}})
        with self.assertRaisesRegex(TypeError, "object or an array"):
            json_ld_script("x")


class MetaTagTests(unittest.TestCase):
    def test_full_vector(self):
        self.assertEqual(meta_tags('Tom & "Jerry"', description="Cat <3 mouse", canonical="https://ex.com/tj",
                                   image="https://ex.com/tj.png", site_name="Ex"), FULL)

    def test_title_only(self):
        lines = meta_tags("T").split("\n")
        self.assertEqual(lines, ["<title>T</title>", '<meta property="og:title" content="T">',
                                 '<meta property="og:type" content="website">',
                                 '<meta name="twitter:card" content="summary_large_image">',
                                 '<meta name="twitter:title" content="T">'])

    def test_options_and_validation(self):
        self.assertIn('og:type" content="article">\n<meta property="og:locale" content="en_US">\n'
                      '<meta name="twitter:card" content="summary">',
                      meta_tags("T", type="article", twitter_card="summary", locale="en_US"))
        for kwargs, pattern in (({"canonical": "http://ex.com"}, "canonical"), ({"image": "/a.png"}, "image"),
                                ({"twitter_card": "large"}, "twitter_card")):
            with self.assertRaisesRegex(ValueError, pattern):
                meta_tags("T", **kwargs)
        with self.assertRaisesRegex(ValueError, "title"):
            meta_tags(" ")


if __name__ == "__main__":
    unittest.main()
