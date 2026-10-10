// SPDX-License-Identifier: Apache-2.0
import kotlin.system.exitProcess

private var passed = 0
private var failed = 0

private fun check(ok: Boolean, name: String) {
    if (ok) passed++ else { failed++; System.err.println("FAIL: $name") }
}

private fun eq(expected: Any, actual: Any?, name: String) = check(expected == actual, "$name expected <$expected> got <$actual>")

private fun throwsIae(name: String, block: () -> Unit) {
    try { block(); check(false, "$name did not throw") } catch (e: IllegalArgumentException) { check(true, name) }
}

fun main() {
    val sitemap = "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<urlset xmlns=\"http://www.sitemaps.org/schemas/sitemap/0.9\">\n" +
        "  <url>\n    <loc>https://example.com/</loc>\n    <lastmod>2026-10-01</lastmod>\n    <changefreq>weekly</changefreq>\n    <priority>1.0</priority>\n  </url>\n" +
        "  <url>\n    <loc>https://example.com/a?x=1&amp;y=2</loc>\n  </url>\n</urlset>\n"
    eq(sitemap, SeoFiles.sitemapXml(listOf(
        SeoFiles.SitemapEntry("https://example.com/", "2026-10-01", "weekly", 1.0),
        SeoFiles.SitemapEntry("https://example.com/a?x=1&y=2"),
    )), "sitemap vector")
    val esc = SeoFiles.sitemapXml(listOf(SeoFiles.SitemapEntry("https://ex.com/<'\">", priority = 0.25)))
    check(esc.contains("<loc>https://ex.com/&lt;&apos;&quot;&gt;</loc>"), "sitemap escapes all five characters")
    check(esc.contains("<priority>0.3</priority>"), "priority rounds half up to one decimal")
    throwsIae("sitemap relative loc") { SeoFiles.sitemapXml(listOf(SeoFiles.SitemapEntry("/relative"))) }
    throwsIae("sitemap ftp loc") { SeoFiles.sitemapXml(listOf(SeoFiles.SitemapEntry("ftp://ex.com/"))) }
    throwsIae("sitemap bad month") { SeoFiles.sitemapXml(listOf(SeoFiles.SitemapEntry("https://ex.com/", lastmod = "2026-13-01"))) }
    throwsIae("sitemap bad date shape") { SeoFiles.sitemapXml(listOf(SeoFiles.SitemapEntry("https://ex.com/", lastmod = "2026-1-01"))) }
    throwsIae("sitemap bad changefreq") { SeoFiles.sitemapXml(listOf(SeoFiles.SitemapEntry("https://ex.com/", changefreq = "sometimes"))) }
    throwsIae("sitemap priority too high") { SeoFiles.sitemapXml(listOf(SeoFiles.SitemapEntry("https://ex.com/", priority = 1.5))) }
    throwsIae("sitemap priority NaN") { SeoFiles.sitemapXml(listOf(SeoFiles.SitemapEntry("https://ex.com/", priority = Double.NaN))) }
    throwsIae("sitemap too many entries") { SeoFiles.sitemapXml(List(SeoFiles.MAX_SITEMAP_ENTRIES + 1) { SeoFiles.SitemapEntry("https://ex.com/") }) }

    val rules = listOf(SeoFiles.RobotsRule("*", disallow = listOf("/admin")))
    val robots = "User-agent: *\nDisallow: /admin\n\nUser-agent: GPTBot\nUser-agent: ChatGPT-User\nUser-agent: OAI-SearchBot\n" +
        "User-agent: ClaudeBot\nUser-agent: Claude-Web\nUser-agent: anthropic-ai\nUser-agent: Google-Extended\nUser-agent: PerplexityBot\n" +
        "User-agent: CCBot\nUser-agent: Bytespider\nUser-agent: Applebot-Extended\nUser-agent: Meta-ExternalAgent\nDisallow: /\n\n" +
        "Sitemap: https://example.com/sitemap.xml\n"
    eq(robots, SeoFiles.robotsTxt(rules, SeoFiles.AiCrawlers.DISALLOW, listOf("https://example.com/sitemap.xml")), "robots vector")
    eq("User-agent: *\nDisallow: /admin\n", SeoFiles.robotsTxt(rules, SeoFiles.AiCrawlers.DEFAULT, emptyList()), "robots default drops final blank line")
    check(SeoFiles.robotsTxt(rules, SeoFiles.AiCrawlers.ALLOW).endsWith("User-agent: Meta-ExternalAgent\nAllow: /\n"), "robots allow group")
    eq("User-agent: *\nAllow: *.pdf\n", SeoFiles.robotsTxt(listOf(SeoFiles.RobotsRule("*", allow = listOf("*.pdf")))), "robots star pattern")
    throwsIae("robots path without slash") { SeoFiles.robotsTxt(listOf(SeoFiles.RobotsRule("*", allow = listOf("admin")))) }
    throwsIae("robots newline in user agent") { SeoFiles.robotsTxt(listOf(SeoFiles.RobotsRule("*\nUser-agent: x"))) }
    throwsIae("robots newline in path") { SeoFiles.robotsTxt(listOf(SeoFiles.RobotsRule("*", allow = listOf("/a\r\nSitemap: x")))) }
    throwsIae("robots relative sitemap") { SeoFiles.robotsTxt(rules, SeoFiles.AiCrawlers.DEFAULT, listOf("sitemap.xml")) }

    val sections = listOf(
        SeoFiles.LlmsSection("Docs", listOf(
            SeoFiles.LlmsLink("Quickstart", "https://acme.dev/start", "Install and launch"),
            SeoFiles.LlmsLink("API [v2]", "https://acme.dev/api"),
        )),
        SeoFiles.LlmsSection("Optional", listOf(SeoFiles.LlmsLink("Blog", "https://acme.dev/blog"))),
    )
    val llms = "# Acme\n\n> Acme builds rockets.\n\n## Docs\n\n- [Quickstart](https://acme.dev/start): Install and launch\n" +
        "- [API [v2\\]](https://acme.dev/api)\n\n## Optional\n\n- [Blog](https://acme.dev/blog)\n"
    eq(llms, SeoFiles.llmsTxt("Acme", "Acme builds rockets.", sections), "llms vector")
    throwsIae("llms empty title") { SeoFiles.llmsTxt("", "s", emptyList()) }
    throwsIae("llms newline in title") { SeoFiles.llmsTxt("A\nB", "s", emptyList()) }
    throwsIae("llms newline in summary") { SeoFiles.llmsTxt("A", "line\nbreak", emptyList()) }
    throwsIae("llms relative url") { SeoFiles.llmsTxt("A", "s", listOf(SeoFiles.LlmsSection("Docs", listOf(SeoFiles.LlmsLink("x", "/docs"))))) }
    throwsIae("llms newline in description") { SeoFiles.llmsTxt("A", "s", listOf(SeoFiles.LlmsSection("Docs", listOf(SeoFiles.LlmsLink("x", "https://a.dev", "a\nb"))))) }

    println("SeoFilesTest: $passed passed, $failed failed")
    if (failed > 0) exitProcess(1)
}
