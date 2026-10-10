// SPDX-License-Identifier: Apache-2.0
import kotlin.math.roundToLong

/** Deterministic sitemap.xml, robots.txt (with an AI-crawler group) and llms.txt (https://llmstxt.org). */
object SeoFiles {
    /** AI crawler user agents, in the order they are emitted. */
    val AI_CRAWLERS = listOf(
        "GPTBot", "ChatGPT-User", "OAI-SearchBot", "ClaudeBot", "Claude-Web", "anthropic-ai",
        "Google-Extended", "PerplexityBot", "CCBot", "Bytespider", "Applebot-Extended", "Meta-ExternalAgent",
    )
    const val MAX_SITEMAP_ENTRIES = 50_000
    private val CHANGEFREQS = listOf("always", "hourly", "daily", "weekly", "monthly", "yearly", "never")

    data class SitemapEntry(val loc: String, val lastmod: String? = null, val changefreq: String? = null, val priority: Double? = null)
    data class RobotsRule(val userAgent: String, val allow: List<String> = emptyList(), val disallow: List<String> = emptyList())
    enum class AiCrawlers { ALLOW, DISALLOW, DEFAULT }
    data class LlmsLink(val title: String, val url: String, val description: String? = null)
    data class LlmsSection(val name: String, val links: List<LlmsLink>)

    internal fun isAbsoluteHttpUrl(value: String): Boolean {
        val lower = value.lowercase()
        val rest = when {
            lower.startsWith("https://") -> lower.substring(8)
            lower.startsWith("http://") -> lower.substring(7)
            else -> return false
        }
        return rest.isNotEmpty() && rest[0] !in "/?#" && value.none { it.isWhitespace() || it.isISOControl() }
    }

    private fun requireUrl(field: String, value: String) =
        require(isAbsoluteHttpUrl(value)) { "$field must be an absolute http(s) URL: $value" }

    private fun noNewline(field: String, value: String): String {
        require('\n' !in value && '\r' !in value) { "$field must not contain newline characters" }
        return value
    }

    internal fun validDate(v: String): Boolean {
        if (v.length != 10 || v[4] != '-' || v[7] != '-') return false
        if (v.filterIndexed { i, _ -> i != 4 && i != 7 }.any { it !in '0'..'9' }) return false
        val y = v.substring(0, 4).toInt()
        val m = v.substring(5, 7).toInt()
        val d = v.substring(8).toInt()
        val leap = (y % 4 == 0 && y % 100 != 0) || y % 400 == 0
        val days = intArrayOf(31, if (leap) 29 else 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31)
        return m in 1..12 && d in 1..days[m - 1]
    }

    /** Escapes `& < > " '` for XML. */
    fun xmlEscape(value: String): String = buildString {
        for (c in value) when (c) {
            '&' -> append("&amp;")
            '<' -> append("&lt;")
            '>' -> append("&gt;")
            '"' -> append("&quot;")
            '\'' -> append("&apos;")
            else -> append(c)
        }
    }

    /** Renders a sitemaps.org 0.9 urlset with a trailing newline. */
    fun sitemapXml(entries: List<SitemapEntry>): String {
        require(entries.size <= MAX_SITEMAP_ENTRIES) { "a sitemap holds at most $MAX_SITEMAP_ENTRIES entries" }
        val out = StringBuilder("<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<urlset xmlns=\"http://www.sitemaps.org/schemas/sitemap/0.9\">\n")
        entries.forEachIndexed { i, e ->
            val f = "entries[$i]"
            requireUrl("$f.loc", e.loc)
            out.append("  <url>\n    <loc>").append(xmlEscape(e.loc)).append("</loc>\n")
            e.lastmod?.let {
                require(validDate(it)) { "$f.lastmod must be a YYYY-MM-DD date: $it" }
                out.append("    <lastmod>").append(xmlEscape(it)).append("</lastmod>\n")
            }
            e.changefreq?.let {
                require(it in CHANGEFREQS) { "$f.changefreq must be one of ${CHANGEFREQS.joinToString(", ")}: $it" }
                out.append("    <changefreq>").append(xmlEscape(it)).append("</changefreq>\n")
            }
            e.priority?.let {
                require(it >= 0.0 && it <= 1.0) { "$f.priority must be between 0.0 and 1.0: $it" }
                val tenths = (it * 10.0).roundToLong() // half up, identical across languages
                out.append("    <priority>").append(tenths / 10).append('.').append(tenths % 10).append("</priority>\n")
            }
            out.append("  </url>\n")
        }
        return out.append("</urlset>\n").toString()
    }

    private fun robotsPath(field: String, value: String) {
        noNewline(field, value)
        require(value.startsWith("/") || value.startsWith("*")) { "$field must start with '/' or '*': $value" }
    }

    /** Renders robots.txt; a final blank line is dropped when nothing follows it. */
    fun robotsTxt(rules: List<RobotsRule>, aiCrawlers: AiCrawlers = AiCrawlers.DEFAULT, sitemaps: List<String> = emptyList()): String {
        val lines = mutableListOf<String>()
        rules.forEachIndexed { i, r ->
            noNewline("rules[$i].userAgent", r.userAgent)
            require(r.userAgent.isNotBlank()) { "rules[$i].userAgent must not be empty" }
            lines += "User-agent: ${r.userAgent}"
            for (p in r.allow) { robotsPath("rules[$i].allow", p); lines += "Allow: $p" }
            for (p in r.disallow) { robotsPath("rules[$i].disallow", p); lines += "Disallow: $p" }
            lines += ""
        }
        if (aiCrawlers != AiCrawlers.DEFAULT) {
            AI_CRAWLERS.forEach { lines += "User-agent: $it" }
            lines += if (aiCrawlers == AiCrawlers.ALLOW) "Allow: /" else "Disallow: /"
            lines += ""
        }
        sitemaps.forEachIndexed { i, s -> requireUrl("sitemaps[$i]", s); lines += "Sitemap: $s" }
        if (lines.lastOrNull() == "") lines.removeAt(lines.size - 1)
        return if (lines.isEmpty()) "" else lines.joinToString("\n") + "\n"
    }

    /** Renders llms.txt; an empty summary omits the blockquote. */
    fun llmsTxt(title: String, summary: String, sections: List<LlmsSection>): String {
        noNewline("title", title)
        noNewline("summary", summary)
        require(title.isNotBlank()) { "title must not be empty" }
        val lines = mutableListOf("# $title")
        if (summary.isNotEmpty()) { lines += ""; lines += "> $summary" }
        sections.forEachIndexed { i, s ->
            noNewline("sections[$i].name", s.name)
            require(s.name.isNotBlank()) { "sections[$i].name must not be empty" }
            lines += ""
            lines += "## ${s.name}"
            if (s.links.isNotEmpty()) lines += ""
            s.links.forEachIndexed { j, l ->
                val f = "sections[$i].links[$j]"
                noNewline("$f.title", l.title)
                requireUrl("$f.url", l.url)
                val desc = l.description?.let { ": " + noNewline("$f.description", it) } ?: ""
                lines += "- [${l.title.replace("]", "\\]")}](${l.url})$desc"
            }
        }
        return lines.joinToString("\n") + "\n"
    }
}
