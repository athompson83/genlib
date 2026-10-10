// SPDX-License-Identifier: Apache-2.0
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

/** Deterministic sitemap.xml, robots.txt (with an AI-crawler group) and llms.txt (https://llmstxt.org). */
public final class SeoFiles {
    /** AI crawler user agents, in the order they are emitted. */
    public static final List<String> AI_CRAWLERS = List.of(
        "GPTBot", "ChatGPT-User", "OAI-SearchBot", "ClaudeBot", "Claude-Web", "anthropic-ai",
        "Google-Extended", "PerplexityBot", "CCBot", "Bytespider", "Applebot-Extended", "Meta-ExternalAgent");
    public static final int MAX_SITEMAP_ENTRIES = 50_000;
    private static final List<String> CHANGEFREQS = List.of("always", "hourly", "daily", "weekly", "monthly", "yearly", "never");

    private SeoFiles() {}

    /** One sitemap entry; lastmod, changefreq and priority may be null. */
    public record SitemapEntry(String loc, String lastmod, String changefreq, Double priority) {
        public SitemapEntry(String loc) { this(loc, null, null, null); }
    }

    /** One robots.txt group. */
    public record RobotsRule(String userAgent, List<String> allow, List<String> disallow) {}

    /** Policy for the appended AI-crawler group. */
    public enum AiCrawlers { ALLOW, DISALLOW, DEFAULT }

    /** One llms.txt link; description may be null. */
    public record LlmsLink(String title, String url, String description) {
        public LlmsLink(String title, String url) { this(title, url, null); }
    }

    /** One llms.txt section. */
    public record LlmsSection(String name, List<LlmsLink> links) {}

    static boolean isAbsoluteHttpUrl(String value) {
        if (value == null) return false;
        String lower = value.toLowerCase(Locale.ROOT);
        String rest;
        if (lower.startsWith("https://")) rest = lower.substring(8);
        else if (lower.startsWith("http://")) rest = lower.substring(7);
        else return false;
        if (rest.isEmpty() || "/?#".indexOf(rest.charAt(0)) >= 0) return false;
        for (int i = 0; i < value.length(); i++) {
            char c = value.charAt(i);
            if (Character.isWhitespace(c) || Character.isISOControl(c)) return false;
        }
        return true;
    }

    private static void requireUrl(String field, String value) {
        if (!isAbsoluteHttpUrl(value)) throw new IllegalArgumentException(field + " must be an absolute http(s) URL: " + value);
    }

    private static String noNewline(String field, String value) {
        if (value == null) throw new IllegalArgumentException(field + " is required");
        if (value.indexOf('\n') >= 0 || value.indexOf('\r') >= 0)
            throw new IllegalArgumentException(field + " must not contain newline characters");
        return value;
    }

    static boolean validDate(String v) {
        if (v == null || v.length() != 10 || v.charAt(4) != '-' || v.charAt(7) != '-') return false;
        for (int i = 0; i < 10; i++) if (i != 4 && i != 7 && (v.charAt(i) < '0' || v.charAt(i) > '9')) return false;
        int y = Integer.parseInt(v.substring(0, 4)), m = Integer.parseInt(v.substring(5, 7)), d = Integer.parseInt(v.substring(8));
        boolean leap = (y % 4 == 0 && y % 100 != 0) || y % 400 == 0;
        int[] days = {31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31};
        return m >= 1 && m <= 12 && d >= 1 && d <= days[m - 1];
    }

    /** Escapes {@code & < > " '} for XML. */
    public static String xmlEscape(String value) {
        StringBuilder out = new StringBuilder(value.length());
        for (int i = 0; i < value.length(); i++) {
            char c = value.charAt(i);
            switch (c) {
                case '&': out.append("&amp;"); break;
                case '<': out.append("&lt;"); break;
                case '>': out.append("&gt;"); break;
                case '"': out.append("&quot;"); break;
                case '\'': out.append("&apos;"); break;
                default: out.append(c);
            }
        }
        return out.toString();
    }

    /** Renders a sitemaps.org 0.9 urlset with a trailing newline. */
    public static String sitemapXml(List<SitemapEntry> entries) {
        if (entries == null) throw new IllegalArgumentException("entries is required");
        if (entries.size() > MAX_SITEMAP_ENTRIES)
            throw new IllegalArgumentException("a sitemap holds at most " + MAX_SITEMAP_ENTRIES + " entries");
        StringBuilder out = new StringBuilder("<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n"
            + "<urlset xmlns=\"http://www.sitemaps.org/schemas/sitemap/0.9\">\n");
        for (int i = 0; i < entries.size(); i++) {
            SitemapEntry e = entries.get(i);
            String f = "entries[" + i + "]";
            requireUrl(f + ".loc", e.loc());
            out.append("  <url>\n    <loc>").append(xmlEscape(e.loc())).append("</loc>\n");
            if (e.lastmod() != null) {
                if (!validDate(e.lastmod())) throw new IllegalArgumentException(f + ".lastmod must be a YYYY-MM-DD date: " + e.lastmod());
                out.append("    <lastmod>").append(xmlEscape(e.lastmod())).append("</lastmod>\n");
            }
            if (e.changefreq() != null) {
                if (!CHANGEFREQS.contains(e.changefreq()))
                    throw new IllegalArgumentException(f + ".changefreq must be one of " + String.join(", ", CHANGEFREQS) + ": " + e.changefreq());
                out.append("    <changefreq>").append(xmlEscape(e.changefreq())).append("</changefreq>\n");
            }
            if (e.priority() != null) {
                double p = e.priority();
                if (!(p >= 0.0 && p <= 1.0)) throw new IllegalArgumentException(f + ".priority must be between 0.0 and 1.0: " + p);
                long tenths = Math.round(p * 10.0); // half up, identical across languages
                out.append("    <priority>").append(tenths / 10).append('.').append(tenths % 10).append("</priority>\n");
            }
            out.append("  </url>\n");
        }
        return out.append("</urlset>\n").toString();
    }

    private static void robotsPath(String field, String value) {
        noNewline(field, value);
        if (!value.startsWith("/") && !value.startsWith("*"))
            throw new IllegalArgumentException(field + " must start with '/' or '*': " + value);
    }

    /** Renders robots.txt; a final blank line is dropped when nothing follows it. */
    public static String robotsTxt(List<RobotsRule> rules, AiCrawlers aiCrawlers, List<String> sitemaps) {
        if (rules == null || aiCrawlers == null || sitemaps == null)
            throw new IllegalArgumentException("rules, aiCrawlers and sitemaps are required");
        List<String> lines = new ArrayList<>();
        for (int i = 0; i < rules.size(); i++) {
            RobotsRule r = rules.get(i);
            String f = "rules[" + i + "]";
            noNewline(f + ".userAgent", r.userAgent());
            if (r.userAgent().trim().isEmpty()) throw new IllegalArgumentException(f + ".userAgent must not be empty");
            lines.add("User-agent: " + r.userAgent());
            for (String p : r.allow() == null ? List.<String>of() : r.allow()) { robotsPath(f + ".allow", p); lines.add("Allow: " + p); }
            for (String p : r.disallow() == null ? List.<String>of() : r.disallow()) { robotsPath(f + ".disallow", p); lines.add("Disallow: " + p); }
            lines.add("");
        }
        if (aiCrawlers != AiCrawlers.DEFAULT) {
            for (String ua : AI_CRAWLERS) lines.add("User-agent: " + ua);
            lines.add(aiCrawlers == AiCrawlers.ALLOW ? "Allow: /" : "Disallow: /");
            lines.add("");
        }
        for (int i = 0; i < sitemaps.size(); i++) {
            requireUrl("sitemaps[" + i + "]", sitemaps.get(i));
            lines.add("Sitemap: " + sitemaps.get(i));
        }
        if (!lines.isEmpty() && lines.get(lines.size() - 1).isEmpty()) lines.remove(lines.size() - 1);
        return lines.isEmpty() ? "" : String.join("\n", lines) + "\n";
    }

    /** Renders llms.txt; an empty summary omits the blockquote. */
    public static String llmsTxt(String title, String summary, List<LlmsSection> sections) {
        noNewline("title", title);
        noNewline("summary", summary);
        if (title.trim().isEmpty()) throw new IllegalArgumentException("title must not be empty");
        if (sections == null) throw new IllegalArgumentException("sections is required");
        List<String> lines = new ArrayList<>();
        lines.add("# " + title);
        if (!summary.isEmpty()) { lines.add(""); lines.add("> " + summary); }
        for (int i = 0; i < sections.size(); i++) {
            LlmsSection s = sections.get(i);
            String f = "sections[" + i + "]";
            noNewline(f + ".name", s.name());
            if (s.name().trim().isEmpty()) throw new IllegalArgumentException(f + ".name must not be empty");
            List<LlmsLink> links = s.links() == null ? List.of() : s.links();
            lines.add("");
            lines.add("## " + s.name());
            if (!links.isEmpty()) lines.add("");
            for (int j = 0; j < links.size(); j++) {
                LlmsLink l = links.get(j);
                String lf = f + ".links[" + j + "]";
                noNewline(lf + ".title", l.title());
                requireUrl(lf + ".url", l.url());
                String line = "- [" + l.title().replace("]", "\\]") + "](" + l.url() + ")";
                if (l.description() != null) line += ": " + noNewline(lf + ".description", l.description());
                lines.add(line);
            }
        }
        return String.join("\n", lines) + "\n";
    }
}
