# SPDX-License-Identifier: Apache-2.0
import unittest

from seo_files import llms_txt, robots_txt, sitemap_xml

AI = "".join(f"User-agent: {a}\n" for a in (
    "GPTBot", "ChatGPT-User", "OAI-SearchBot", "ClaudeBot", "Claude-Web", "anthropic-ai",
    "Google-Extended", "PerplexityBot", "CCBot", "Bytespider", "Applebot-Extended", "Meta-ExternalAgent"))
SITEMAP = ('<?xml version="1.0" encoding="UTF-8"?>\n'
           '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
           "  <url>\n    <loc>https://example.com/</loc>\n    <lastmod>2026-10-01</lastmod>\n"
           "    <changefreq>weekly</changefreq>\n    <priority>1.0</priority>\n  </url>\n"
           "  <url>\n    <loc>https://example.com/a?x=1&amp;y=2</loc>\n  </url>\n</urlset>\n")
LLMS = ("# Acme\n\n> Acme builds rockets.\n\n## Docs\n\n"
        "- [Quickstart](https://acme.dev/start): Install and launch\n"
        "- [API [v2\\]](https://acme.dev/api)\n\n## Optional\n\n- [Blog](https://acme.dev/blog)\n")


class SitemapTests(unittest.TestCase):
    def test_vector(self):
        self.assertEqual(sitemap_xml([
            {"loc": "https://example.com/", "lastmod": "2026-10-01", "changefreq": "weekly", "priority": 1},
            {"loc": "https://example.com/a?x=1&y=2"},
        ]), SITEMAP)

    def test_escaping_and_priority(self):
        self.assertIn("<loc>https://example.com/it&apos;s&lt;&quot;x&quot;&gt;</loc>",
                      sitemap_xml([{"loc": "https://example.com/it's<\"x\">"}]))
        for value, text in ((0, "0.0"), (0.25, "0.3"), (0.85, "0.9"), (0.5, "0.5")):
            self.assertIn(f"<priority>{text}</priority>", sitemap_xml([{"loc": "https://e.com/", "priority": value}]))

    def test_validation(self):
        bad = [{"loc": "/relative"}, {"loc": "ftp://e.com/"},
               {"loc": "https://e.com/", "lastmod": "2026-13-01"},
               {"loc": "https://e.com/", "lastmod": "2026-1-01"},
               {"loc": "https://e.com/", "changefreq": "often"},
               {"loc": "https://e.com/", "priority": 1.1},
               {"loc": "https://e.com/", "priority": -0.1},
               {"loc": "https://e.com/", "priority": True}]
        for entry in bad:
            with self.assertRaises(ValueError, msg=entry):
                sitemap_xml([entry])
        with self.assertRaisesRegex(ValueError, "50000"):
            sitemap_xml([{"loc": "https://e.com/"}] * 50001)


class RobotsTests(unittest.TestCase):
    rules = [{"userAgent": "*", "disallow": ["/admin"]}]

    def test_vectors(self):
        self.assertEqual(robots_txt(self.rules, "disallow", ["https://example.com/sitemap.xml"]),
                         f"User-agent: *\nDisallow: /admin\n\n{AI}Disallow: /\n\nSitemap: https://example.com/sitemap.xml\n")
        self.assertEqual(robots_txt(self.rules, "default"), "User-agent: *\nDisallow: /admin\n")
        self.assertEqual(robots_txt(self.rules, "allow"), f"User-agent: *\nDisallow: /admin\n\n{AI}Allow: /\n")
        self.assertEqual(robots_txt([{"userAgent": "Bingbot", "allow": ["/public", "*.css"], "disallow": ["/"]}]),
                         "User-agent: Bingbot\nAllow: /public\nAllow: *.css\nDisallow: /\n")

    def test_validation(self):
        with self.assertRaisesRegex(ValueError, "start with"):
            robots_txt([{"userAgent": "*", "disallow": ["admin"]}])
        with self.assertRaisesRegex(ValueError, "newline"):
            robots_txt([{"userAgent": "*\nUser-agent: evil", "disallow": ["/"]}])
        with self.assertRaisesRegex(ValueError, "newline"):
            robots_txt([{"userAgent": "*", "disallow": ["/a\r\nSitemap: x"]}])
        with self.assertRaisesRegex(ValueError, "ai_crawlers"):
            robots_txt(self.rules, "block")
        with self.assertRaisesRegex(ValueError, "absolute"):
            robots_txt(self.rules, sitemaps=["/sitemap.xml"])
        with self.assertRaisesRegex(ValueError, "at least one"):
            robots_txt([{"userAgent": "*"}])


class LlmsTests(unittest.TestCase):
    def test_vector(self):
        self.assertEqual(llms_txt("Acme", "Acme builds rockets.", [
            {"name": "Docs", "links": [
                {"title": "Quickstart", "url": "https://acme.dev/start", "description": "Install and launch"},
                {"title": "API [v2]", "url": "https://acme.dev/api"}]},
            {"name": "Optional", "links": [{"title": "Blog", "url": "https://acme.dev/blog"}]},
        ]), LLMS)
        self.assertEqual(llms_txt("Acme", "S", []), "# Acme\n\n> S\n")

    def test_validation(self):
        with self.assertRaisesRegex(ValueError, "title"):
            llms_txt("", "S")
        with self.assertRaisesRegex(ValueError, "newline"):
            llms_txt("A\nB", "S")
        with self.assertRaisesRegex(ValueError, "newline"):
            llms_txt("A", "S\nT")
        with self.assertRaisesRegex(ValueError, "absolute"):
            llms_txt("A", "S", [{"name": "D", "links": [{"title": "x", "url": "/rel"}]}])
        with self.assertRaisesRegex(ValueError, "newline"):
            llms_txt("A", "S", [{"name": "D", "links": [{"title": "x", "url": "https://a.dev", "description": "a\nb"}]}])


if __name__ == "__main__":
    unittest.main()
