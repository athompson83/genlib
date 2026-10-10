// SPDX-License-Identifier: Apache-2.0
import GenlibSwift

func runSeoFilesChecks(_ c: inout Checks) {
    c.eq("sitemap vector",
         "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<urlset xmlns=\"http://www.sitemaps.org/schemas/sitemap/0.9\">\n  <url>\n    <loc>https://example.com/</loc>\n    <lastmod>2026-10-01</lastmod>\n    <changefreq>weekly</changefreq>\n    <priority>1.0</priority>\n  </url>\n  <url>\n    <loc>https://example.com/a?x=1&amp;y=2</loc>\n  </url>\n</urlset>\n",
         try SeoFiles.sitemapXML([SitemapEntry("https://example.com/", lastmod: "2026-10-01", changefreq: "weekly", priority: 1),
                                  SitemapEntry("https://example.com/a?x=1&y=2")]))
    c.eq("sitemap escapes quotes", true,
         try SeoFiles.sitemapXML([SitemapEntry("https://ex.com/'\"<>")]).contains("<loc>https://ex.com/&apos;&quot;&lt;&gt;</loc>"))
    c.eq("sitemap priority one decimal", true,
         try SeoFiles.sitemapXML([SitemapEntry("https://ex.com/", priority: 0.25)]).contains("<priority>0.3</priority>"))
    c.throwsError("sitemap relative loc", { _ = try SeoFiles.sitemapXML([SitemapEntry("/a")]) })
    c.throwsError("sitemap ftp loc", { _ = try SeoFiles.sitemapXML([SitemapEntry("ftp://ex.com/")]) })
    c.throwsError("sitemap bad lastmod", { _ = try SeoFiles.sitemapXML([SitemapEntry("https://ex.com/", lastmod: "2026-13-01")]) })
    c.throwsError("sitemap bad changefreq", { _ = try SeoFiles.sitemapXML([SitemapEntry("https://ex.com/", changefreq: "often")]) })
    c.throwsError("sitemap priority > 1", { _ = try SeoFiles.sitemapXML([SitemapEntry("https://ex.com/", priority: 1.5)]) })
    c.throwsError("sitemap > 50000", { _ = try SeoFiles.sitemapXML(Array(repeating: SitemapEntry("https://ex.com/"), count: 50_001)) })

    let rules = [RobotsRule("*", disallow: ["/admin"])]
    c.eq("robots vector",
         "User-agent: *\nDisallow: /admin\n\nUser-agent: GPTBot\nUser-agent: ChatGPT-User\nUser-agent: OAI-SearchBot\nUser-agent: ClaudeBot\nUser-agent: Claude-Web\nUser-agent: anthropic-ai\nUser-agent: Google-Extended\nUser-agent: PerplexityBot\nUser-agent: CCBot\nUser-agent: Bytespider\nUser-agent: Applebot-Extended\nUser-agent: Meta-ExternalAgent\nDisallow: /\n\nSitemap: https://example.com/sitemap.xml\n",
         try SeoFiles.robotsTxt(rules, aiCrawlers: .disallow, sitemaps: ["https://example.com/sitemap.xml"]))
    c.eq("robots default no sitemaps", "User-agent: *\nDisallow: /admin\n", try SeoFiles.robotsTxt(rules))
    c.eq("robots allow AI", true, try SeoFiles.robotsTxt(rules, aiCrawlers: .allow).hasSuffix("User-agent: Meta-ExternalAgent\nAllow: /\n"))
    c.eq("robots allow then disallow", "User-agent: Googlebot\nAllow: /public\nDisallow: /*.pdf$\n",
         try SeoFiles.robotsTxt([RobotsRule("Googlebot", allow: ["/public"], disallow: ["/*.pdf$"])]))
    c.throwsError("robots bad path", { _ = try SeoFiles.robotsTxt([RobotsRule("*", disallow: ["admin"])]) })
    c.throwsError("robots newline injection", { _ = try SeoFiles.robotsTxt([RobotsRule("*\nDisallow: /", disallow: ["/a"])]) })
    c.throwsError("robots path newline", { _ = try SeoFiles.robotsTxt([RobotsRule("*", disallow: ["/a\r\nSitemap: x"])]) })
    c.throwsError("robots relative sitemap", { _ = try SeoFiles.robotsTxt(rules, sitemaps: ["/sitemap.xml"]) })

    let sections = [
        LlmsSection("Docs", [LlmsLink("Quickstart", "https://acme.dev/start", description: "Install and launch"),
                             LlmsLink("API [v2]", "https://acme.dev/api")]),
        LlmsSection("Optional", [LlmsLink("Blog", "https://acme.dev/blog")]),
    ]
    c.eq("llms vector",
         "# Acme\n\n> Acme builds rockets.\n\n## Docs\n\n- [Quickstart](https://acme.dev/start): Install and launch\n- [API [v2\\]](https://acme.dev/api)\n\n## Optional\n\n- [Blog](https://acme.dev/blog)\n",
         try SeoFiles.llmsTxt(title: "Acme", summary: "Acme builds rockets.", sections: sections))
    c.throwsError("llms empty title", { _ = try SeoFiles.llmsTxt(title: "", summary: "s", sections: sections) })
    c.throwsError("llms relative url", { _ = try SeoFiles.llmsTxt(title: "Acme", summary: nil, sections: [LlmsSection("Docs", [LlmsLink("a", "/a")])]) })
    c.throwsError("llms newline", { _ = try SeoFiles.llmsTxt(title: "Acme", summary: "line1\nline2", sections: sections) })
}

func runStructuredDataChecks(_ c: inout Checks) {
    c.eq("json-ld vector",
         "<script type=\"application/ld+json\">{\"@context\":\"https://schema.org\",\"@type\":\"Organization\",\"name\":\"A\\u0026B \\u003c/script\\u003e\",\"url\":\"https://ab.example\",\"sameAs\":[\"https://x.com/ab\"]}</script>",
         try StructuredData.jsonLdScript(["@context": "https://schema.org", "@type": "Organization", "name": "A&B </script>",
                                          "url": "https://ab.example", "sameAs": ["https://x.com/ab"]]))
    c.eq("json-ld scalars",
         "<script type=\"application/ld+json\">{\"n\":3,\"f\":2.5,\"w\":2,\"t\":true,\"z\":null,\"s\":\"q\\\"\\\\\\n\\u2028\\u2029\",\"o\":{\"a\":[]}}</script>",
         try StructuredData.jsonLdScript(["n": 3, "f": 2.5, "w": 2.0, "t": true, "z": nil, "s": "q\"\\\n\u{2028}\u{2029}", "o": ["a": []]]))
    c.throwsError("json-ld NaN", { _ = try StructuredData.jsonLdScript(["x": .number(.nan)]) })
    c.throwsError("json-ld Infinity", { _ = try StructuredData.jsonLdScript(["x": .number(.infinity)]) })
    c.eq("meta vector",
         "<title>Tom &amp; &quot;Jerry&quot;</title>\n<meta name=\"description\" content=\"Cat &lt;3 mouse\">\n<link rel=\"canonical\" href=\"https://ex.com/tj\">\n<meta property=\"og:title\" content=\"Tom &amp; &quot;Jerry&quot;\">\n<meta property=\"og:description\" content=\"Cat &lt;3 mouse\">\n<meta property=\"og:url\" content=\"https://ex.com/tj\">\n<meta property=\"og:image\" content=\"https://ex.com/tj.png\">\n<meta property=\"og:site_name\" content=\"Ex\">\n<meta property=\"og:type\" content=\"website\">\n<meta name=\"twitter:card\" content=\"summary_large_image\">\n<meta name=\"twitter:title\" content=\"Tom &amp; &quot;Jerry&quot;\">\n<meta name=\"twitter:description\" content=\"Cat &lt;3 mouse\">\n<meta name=\"twitter:image\" content=\"https://ex.com/tj.png\">",
         try StructuredData.metaTags(MetaTagOptions(title: "Tom & \"Jerry\"", description: "Cat <3 mouse", canonical: "https://ex.com/tj",
                                                    image: "https://ex.com/tj.png", siteName: "Ex")))
    c.eq("meta title only",
         "<title>T</title>\n<meta property=\"og:title\" content=\"T\">\n<meta property=\"og:type\" content=\"website\">\n<meta name=\"twitter:card\" content=\"summary_large_image\">\n<meta name=\"twitter:title\" content=\"T\">",
         try StructuredData.metaTags(MetaTagOptions(title: "T")))
    c.eq("meta title only 5 lines", 5, try StructuredData.metaTags(MetaTagOptions(title: "T")).split(separator: "\n").count)
    c.throwsError("meta http canonical", { _ = try StructuredData.metaTags(MetaTagOptions(title: "T", canonical: "http://ex.com")) })
    c.throwsError("meta bad twitter card", { _ = try StructuredData.metaTags(MetaTagOptions(title: "T", twitterCard: "big")) })
    c.throwsError("meta empty title", { _ = try StructuredData.metaTags(MetaTagOptions(title: " ")) })
}

func runUtmLinksChecks(_ c: inout Checks) {
    c.eq("utm build vector 1", "https://ex.com/p?ref=a&utm_source=newsletter&utm_medium=email&utm_campaign=fall%20sale#top",
         try UtmLinks.buildUtmURL("https://ex.com/p?ref=a#top", UtmParameters(source: "Newsletter", medium: "email", campaign: "Fall Sale")))
    c.eq("utm build vector 2", "https://ex.com/?utm_source=x&utm_medium=y&utm_campaign=z&utm_content=hero%20cta",
         try UtmLinks.buildUtmURL("https://ex.com/?utm_source=old", UtmParameters(source: "x", medium: "y", campaign: "z", content: "Hero CTA")))
    c.eq("utm build id first", "https://ex.com/?utm_id=c1&utm_source=a&utm_medium=b&utm_campaign=c&utm_term=t",
         try UtmLinks.buildUtmURL("https://ex.com/", UtmParameters(source: " A ", medium: "b", campaign: "c", term: "t", id: "C1")))
    c.throwsError("utm missing campaign", { _ = try UtmLinks.buildUtmURL("https://ex.com/", UtmParameters(source: "a", medium: "b", campaign: "  ")) })
    c.throwsError("utm relative base", { _ = try UtmLinks.buildUtmURL("/p", UtmParameters(source: "a", medium: "b", campaign: "c")) })
    c.throwsError("utm javascript base", { _ = try UtmLinks.buildUtmURL("javascript:alert(1)", UtmParameters(source: "a", medium: "b", campaign: "c")) })
    let parsed = try? UtmLinks.parseUtm("https://ex.com/?a=1&utm_campaign=fall%20sale&utm_source=news+letter&utm_source=dup")
    c.eq("utm parse vector", "source=news letter;campaign=fall sale", parsed?.pairs.map { "\($0.key)=\($0.value)" }.joined(separator: ";"))
    c.eq("utm parse struct", UtmParameters(source: "news letter", campaign: "fall sale"), parsed)
    c.eq("utm strip vector 1", "https://ex.com/p?id=7&b=2#s", try UtmLinks.stripTracking("https://ex.com/p?id=7&utm_source=x&gclid=abc&b=2#s"))
    c.eq("utm strip vector 2", "https://ex.com/", try UtmLinks.stripTracking("https://ex.com/?fbclid=1"))
    c.eq("utm strip keeps encoding", "https://ex.com/?q=a%20b+c", try UtmLinks.stripTracking("https://ex.com/?q=a%20b+c&msclkid=9&_hsenc=x"))
}
