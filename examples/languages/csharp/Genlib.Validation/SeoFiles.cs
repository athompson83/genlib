// SPDX-License-Identifier: Apache-2.0
using System.Globalization;
using System.Text;

namespace Genlib.Validation;

/// <summary>One sitemap URL. <c>Lastmod</c> is YYYY-MM-DD; <c>Priority</c> is 0.0-1.0.</summary>
public sealed record SitemapEntry(string Loc, string? Lastmod = null, string? Changefreq = null, double? Priority = null);

/// <summary>One robots.txt group: a user agent with its Allow and Disallow paths.</summary>
public sealed record RobotsRule(string UserAgent, IReadOnlyList<string>? Allow = null, IReadOnlyList<string>? Disallow = null);

/// <summary>Whether robots.txt adds one group for known AI crawlers.</summary>
public enum AiCrawlerPolicy { Default, Allow, Disallow }

public sealed record LlmsLink(string Title, string Url, string? Description = null);
public sealed record LlmsSection(string Name, IReadOnlyList<LlmsLink> Links);

/// <summary>Deterministic sitemap.xml, robots.txt (with AI-crawler rules) and llms.txt generation.</summary>
public static class SeoFiles {
    public const int MaxSitemapEntries = 50_000;

    /// <summary>AI crawler user agents, in output order.</summary>
    public static readonly IReadOnlyList<string> AiCrawlers = new[] {
        "GPTBot", "ChatGPT-User", "OAI-SearchBot", "ClaudeBot", "Claude-Web", "anthropic-ai", "Google-Extended",
        "PerplexityBot", "CCBot", "Bytespider", "Applebot-Extended", "Meta-ExternalAgent",
    };

    private static readonly string[] ChangeFrequencies = { "always", "hourly", "daily", "weekly", "monthly", "yearly", "never" };

    /// <summary>Builds a sitemaps.org 0.9 urlset document with a trailing newline.</summary>
    public static string SitemapXml(IReadOnlyList<SitemapEntry> entries) {
        ArgumentNullException.ThrowIfNull(entries);
        if (entries.Count > MaxSitemapEntries) throw new ArgumentException($"a sitemap holds at most {MaxSitemapEntries} entries", nameof(entries));
        var sb = new StringBuilder("<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<urlset xmlns=\"http://www.sitemaps.org/schemas/sitemap/0.9\">\n");
        foreach (var e in entries) {
            if (e is null) throw new ArgumentException("sitemap entry must not be null", nameof(entries));
            if (!WebText.IsAbsoluteHttpUrl(e.Loc)) throw new ArgumentException($"loc must be an absolute http(s) URL: '{e.Loc}'", nameof(entries));
            sb.Append("  <url>\n    <loc>").Append(WebText.XmlEscape(e.Loc)).Append("</loc>\n");
            if (e.Lastmod is not null) {
                if (!IsIsoDate(e.Lastmod)) throw new ArgumentException($"lastmod must be a YYYY-MM-DD date: '{e.Lastmod}'", nameof(entries));
                sb.Append("    <lastmod>").Append(WebText.XmlEscape(e.Lastmod)).Append("</lastmod>\n");
            }
            if (e.Changefreq is not null) {
                if (Array.IndexOf(ChangeFrequencies, e.Changefreq) < 0)
                    throw new ArgumentException($"changefreq must be one of {string.Join(", ", ChangeFrequencies)}: '{e.Changefreq}'", nameof(entries));
                sb.Append("    <changefreq>").Append(WebText.XmlEscape(e.Changefreq)).Append("</changefreq>\n");
            }
            if (e.Priority is double p) {
                if (double.IsNaN(p) || p < 0.0 || p > 1.0) throw new ArgumentException("priority must be between 0.0 and 1.0", nameof(entries));
                int tenths = (int)Math.Round(p * 10, MidpointRounding.AwayFromZero);
                sb.Append("    <priority>").Append(tenths / 10).Append('.').Append(tenths % 10).Append("</priority>\n");
            }
            sb.Append("  </url>\n");
        }
        return sb.Append("</urlset>\n").ToString();
    }

    /// <summary>Builds robots.txt: rule groups, an optional AI-crawler group, then Sitemap lines.</summary>
    public static string RobotsTxt(IReadOnlyList<RobotsRule> rules, AiCrawlerPolicy aiCrawlers = AiCrawlerPolicy.Default, IReadOnlyList<string>? sitemaps = null) {
        ArgumentNullException.ThrowIfNull(rules);
        var groups = new List<string>();
        foreach (var rule in rules) {
            if (rule is null) throw new ArgumentException("robots rule must not be null", nameof(rules));
            if (string.IsNullOrWhiteSpace(rule.UserAgent) || WebText.HasNewline(rule.UserAgent))
                throw new ArgumentException("userAgent must be non-empty and single-line", nameof(rules));
            var g = new StringBuilder("User-agent: ").Append(rule.UserAgent).Append('\n');
            foreach (var path in rule.Allow ?? Array.Empty<string>()) g.Append("Allow: ").Append(CheckPath(path)).Append('\n');
            foreach (var path in rule.Disallow ?? Array.Empty<string>()) g.Append("Disallow: ").Append(CheckPath(path)).Append('\n');
            groups.Add(g.ToString());
        }
        if (aiCrawlers != AiCrawlerPolicy.Default) {
            if (!Enum.IsDefined(aiCrawlers)) throw new ArgumentException("aiCrawlers must be Default, Allow or Disallow", nameof(aiCrawlers));
            var g = new StringBuilder();
            foreach (var bot in AiCrawlers) g.Append("User-agent: ").Append(bot).Append('\n');
            g.Append(aiCrawlers == AiCrawlerPolicy.Allow ? "Allow: /\n" : "Disallow: /\n");
            groups.Add(g.ToString());
        }
        var sitemapLines = new StringBuilder();
        foreach (var url in sitemaps ?? Array.Empty<string>()) {
            if (!WebText.IsAbsoluteHttpUrl(url)) throw new ArgumentException($"sitemap must be an absolute http(s) URL: '{url}'", nameof(sitemaps));
            sitemapLines.Append("Sitemap: ").Append(url).Append('\n');
        }
        string body = string.Join("\n", groups);
        if (body.Length > 0 && sitemapLines.Length > 0) body += "\n";
        return body + sitemapLines;
    }

    /// <summary>Builds an llms.txt file (https://llmstxt.org) with a single trailing newline.</summary>
    public static string LlmsTxt(string title, string? summary, IReadOnlyList<LlmsSection> sections) {
        if (string.IsNullOrWhiteSpace(title)) throw new ArgumentException("title must not be empty", nameof(title));
        ArgumentNullException.ThrowIfNull(sections);
        SingleLine(title, nameof(title));
        var blocks = new List<string> { "# " + title };
        if (!string.IsNullOrEmpty(summary)) blocks.Add("> " + SingleLine(summary, nameof(summary)));
        foreach (var section in sections) {
            if (section is null || string.IsNullOrWhiteSpace(section.Name)) throw new ArgumentException("section name must not be empty", nameof(sections));
            blocks.Add("## " + SingleLine(section.Name, nameof(sections)));
            var lines = new List<string>();
            foreach (var link in section.Links ?? Array.Empty<LlmsLink>()) {
                if (link is null || string.IsNullOrWhiteSpace(link.Title)) throw new ArgumentException("link title must not be empty", nameof(sections));
                if (!WebText.IsAbsoluteHttpUrl(link.Url)) throw new ArgumentException($"link url must be an absolute http(s) URL: '{link.Url}'", nameof(sections));
                string line = $"- [{SingleLine(link.Title, nameof(sections)).Replace("]", "\\]")}]({link.Url})";
                if (!string.IsNullOrEmpty(link.Description)) line += ": " + SingleLine(link.Description, nameof(sections));
                lines.Add(line);
            }
            if (lines.Count > 0) blocks.Add(string.Join("\n", lines));
        }
        return string.Join("\n\n", blocks) + "\n";
    }

    private static string CheckPath(string path) {
        if (string.IsNullOrEmpty(path) || WebText.HasNewline(path) || (path[0] != '/' && path[0] != '*'))
            throw new ArgumentException($"robots path must start with '/' or '*' and be single-line: '{path}'", nameof(path));
        return path;
    }

    private static string SingleLine(string value, string name) {
        if (WebText.HasNewline(value)) throw new ArgumentException("value must not contain newlines", name);
        return value;
    }

    private static bool IsIsoDate(string s) {
        return s.Length == 10 && DateTime.TryParseExact(s, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out _);
    }
}
