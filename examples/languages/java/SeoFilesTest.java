// SPDX-License-Identifier: Apache-2.0
import java.util.Collections;
import java.util.List;

public final class SeoFilesTest {
    private static int passed;
    private static int failed;

    private static void check(boolean ok, String name) {
        if (ok) passed++; else { failed++; System.err.println("FAIL: " + name); }
    }

    private static void eq(Object expected, Object actual, String name) {
        check(expected.equals(actual), name + " expected <" + expected + "> got <" + actual + ">");
    }

    private static void throwsIae(Runnable r, String name) {
        try { r.run(); check(false, name + " did not throw"); }
        catch (IllegalArgumentException e) { check(true, name); }
    }

    public static void main(String[] args) {
        String sitemap = "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<urlset xmlns=\"http://www.sitemaps.org/schemas/sitemap/0.9\">\n"
            + "  <url>\n    <loc>https://example.com/</loc>\n    <lastmod>2026-10-01</lastmod>\n    <changefreq>weekly</changefreq>\n    <priority>1.0</priority>\n  </url>\n"
            + "  <url>\n    <loc>https://example.com/a?x=1&amp;y=2</loc>\n  </url>\n</urlset>\n";
        eq(sitemap, SeoFiles.sitemapXml(List.of(
            new SeoFiles.SitemapEntry("https://example.com/", "2026-10-01", "weekly", 1.0),
            new SeoFiles.SitemapEntry("https://example.com/a?x=1&y=2"))), "sitemap vector");
        String esc = SeoFiles.sitemapXml(List.of(new SeoFiles.SitemapEntry("https://ex.com/<'\">", null, null, 0.25)));
        check(esc.contains("<loc>https://ex.com/&lt;&apos;&quot;&gt;</loc>"), "sitemap escapes all five characters");
        check(esc.contains("<priority>0.3</priority>"), "priority rounds half up to one decimal");
        throwsIae(() -> SeoFiles.sitemapXml(List.of(new SeoFiles.SitemapEntry("/relative"))), "sitemap relative loc");
        throwsIae(() -> SeoFiles.sitemapXml(List.of(new SeoFiles.SitemapEntry("ftp://ex.com/"))), "sitemap ftp loc");
        throwsIae(() -> SeoFiles.sitemapXml(List.of(new SeoFiles.SitemapEntry("https://ex.com/", "2026-13-01", null, null))), "sitemap bad month");
        throwsIae(() -> SeoFiles.sitemapXml(List.of(new SeoFiles.SitemapEntry("https://ex.com/", "2026-1-01", null, null))), "sitemap bad date shape");
        throwsIae(() -> SeoFiles.sitemapXml(List.of(new SeoFiles.SitemapEntry("https://ex.com/", null, "sometimes", null))), "sitemap bad changefreq");
        throwsIae(() -> SeoFiles.sitemapXml(List.of(new SeoFiles.SitemapEntry("https://ex.com/", null, null, 1.5))), "sitemap priority too high");
        throwsIae(() -> SeoFiles.sitemapXml(List.of(new SeoFiles.SitemapEntry("https://ex.com/", null, null, Double.NaN))), "sitemap priority NaN");
        throwsIae(() -> SeoFiles.sitemapXml(Collections.nCopies(SeoFiles.MAX_SITEMAP_ENTRIES + 1, new SeoFiles.SitemapEntry("https://ex.com/"))), "sitemap too many entries");

        List<SeoFiles.RobotsRule> rules = List.of(new SeoFiles.RobotsRule("*", List.of(), List.of("/admin")));
        String robots = "User-agent: *\nDisallow: /admin\n\nUser-agent: GPTBot\nUser-agent: ChatGPT-User\nUser-agent: OAI-SearchBot\n"
            + "User-agent: ClaudeBot\nUser-agent: Claude-Web\nUser-agent: anthropic-ai\nUser-agent: Google-Extended\nUser-agent: PerplexityBot\n"
            + "User-agent: CCBot\nUser-agent: Bytespider\nUser-agent: Applebot-Extended\nUser-agent: Meta-ExternalAgent\nDisallow: /\n\n"
            + "Sitemap: https://example.com/sitemap.xml\n";
        eq(robots, SeoFiles.robotsTxt(rules, SeoFiles.AiCrawlers.DISALLOW, List.of("https://example.com/sitemap.xml")), "robots vector");
        eq("User-agent: *\nDisallow: /admin\n", SeoFiles.robotsTxt(rules, SeoFiles.AiCrawlers.DEFAULT, List.of()), "robots default drops final blank line");
        check(SeoFiles.robotsTxt(rules, SeoFiles.AiCrawlers.ALLOW, List.of()).endsWith("User-agent: Meta-ExternalAgent\nAllow: /\n"), "robots allow group");
        eq("User-agent: *\nAllow: *.pdf\n", SeoFiles.robotsTxt(List.of(new SeoFiles.RobotsRule("*", List.of("*.pdf"), null)), SeoFiles.AiCrawlers.DEFAULT, List.of()), "robots star pattern");
        throwsIae(() -> SeoFiles.robotsTxt(List.of(new SeoFiles.RobotsRule("*", List.of("admin"), List.of())), SeoFiles.AiCrawlers.DEFAULT, List.of()), "robots path without slash");
        throwsIae(() -> SeoFiles.robotsTxt(List.of(new SeoFiles.RobotsRule("*\nUser-agent: x", List.of(), List.of())), SeoFiles.AiCrawlers.DEFAULT, List.of()), "robots newline in user agent");
        throwsIae(() -> SeoFiles.robotsTxt(List.of(new SeoFiles.RobotsRule("*", List.of("/a\r\nSitemap: x"), List.of())), SeoFiles.AiCrawlers.DEFAULT, List.of()), "robots newline in path");
        throwsIae(() -> SeoFiles.robotsTxt(rules, SeoFiles.AiCrawlers.DEFAULT, List.of("sitemap.xml")), "robots relative sitemap");

        List<SeoFiles.LlmsSection> sections = List.of(
            new SeoFiles.LlmsSection("Docs", List.of(
                new SeoFiles.LlmsLink("Quickstart", "https://acme.dev/start", "Install and launch"),
                new SeoFiles.LlmsLink("API [v2]", "https://acme.dev/api"))),
            new SeoFiles.LlmsSection("Optional", List.of(new SeoFiles.LlmsLink("Blog", "https://acme.dev/blog"))));
        String llms = "# Acme\n\n> Acme builds rockets.\n\n## Docs\n\n- [Quickstart](https://acme.dev/start): Install and launch\n"
            + "- [API [v2\\]](https://acme.dev/api)\n\n## Optional\n\n- [Blog](https://acme.dev/blog)\n";
        eq(llms, SeoFiles.llmsTxt("Acme", "Acme builds rockets.", sections), "llms vector");
        throwsIae(() -> SeoFiles.llmsTxt("", "s", List.of()), "llms empty title");
        throwsIae(() -> SeoFiles.llmsTxt("A\nB", "s", List.of()), "llms newline in title");
        throwsIae(() -> SeoFiles.llmsTxt("A", "line\nbreak", List.of()), "llms newline in summary");
        throwsIae(() -> SeoFiles.llmsTxt("A", "s", List.of(new SeoFiles.LlmsSection("Docs", List.of(new SeoFiles.LlmsLink("x", "/docs"))))), "llms relative url");
        throwsIae(() -> SeoFiles.llmsTxt("A", "s", List.of(new SeoFiles.LlmsSection("Docs", List.of(new SeoFiles.LlmsLink("x", "https://a.dev", "a\nb"))))), "llms newline in description");

        System.out.println("SeoFilesTest: " + passed + " passed, " + failed + " failed");
        if (failed > 0) System.exit(1);
    }
}
