// SPDX-License-Identifier: Apache-2.0

//! Deterministic SEO files: `sitemap.xml` (sitemaps.org 0.9), `robots.txt`
//! with an optional AI-crawler group, and `llms.txt` (https://llmstxt.org).
//! Standard library only; every value is validated and escaped.

use std::fmt;

/// AI crawler user agents, in the order they are emitted.
pub const AI_CRAWLERS: [&str; 12] = [
    "GPTBot",
    "ChatGPT-User",
    "OAI-SearchBot",
    "ClaudeBot",
    "Claude-Web",
    "anthropic-ai",
    "Google-Extended",
    "PerplexityBot",
    "CCBot",
    "Bytespider",
    "Applebot-Extended",
    "Meta-ExternalAgent",
];

/// Maximum number of `<url>` entries in one sitemap.
pub const MAX_SITEMAP_ENTRIES: usize = 50_000;

const CHANGEFREQS: [&str; 7] = ["always", "hourly", "daily", "weekly", "monthly", "yearly", "never"];

/// Validation error with a human-readable message.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct SeoError(pub String);

impl fmt::Display for SeoError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(&self.0)
    }
}

impl std::error::Error for SeoError {}

fn err<T>(message: String) -> Result<T, SeoError> {
    Err(SeoError(message))
}

/// One `<url>` entry of a sitemap.
#[derive(Clone, Debug, Default, PartialEq)]
pub struct SitemapEntry<'a> {
    pub loc: &'a str,
    pub lastmod: Option<&'a str>,
    pub changefreq: Option<&'a str>,
    pub priority: Option<f64>,
}

/// One `User-agent` group of robots.txt.
#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct RobotsRule<'a> {
    pub user_agent: &'a str,
    pub allow: &'a [&'a str],
    pub disallow: &'a [&'a str],
}

/// Policy for the appended AI-crawler group.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum AiCrawlers {
    Allow,
    Disallow,
    Default,
}

/// One link in an llms.txt section.
#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct LlmsLink<'a> {
    pub title: &'a str,
    pub url: &'a str,
    pub description: Option<&'a str>,
}

/// One `##` section of llms.txt.
#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct LlmsSection<'a> {
    pub name: &'a str,
    pub links: &'a [LlmsLink<'a>],
}

fn is_absolute_http_url(value: &str) -> bool {
    let lower = value.to_ascii_lowercase();
    let rest = if let Some(r) = lower.strip_prefix("https://") {
        r
    } else if let Some(r) = lower.strip_prefix("http://") {
        r
    } else {
        return false;
    };
    let host_end = rest.find(['/', '?', '#']).unwrap_or(rest.len());
    host_end > 0 && !value.chars().any(|c| c.is_whitespace() || c.is_control())
}

fn require_url(field: &str, value: &str) -> Result<(), SeoError> {
    if is_absolute_http_url(value) {
        Ok(())
    } else {
        err(format!("{field} must be an absolute http(s) URL: {value:?}"))
    }
}

fn no_newline(field: &str, value: &str) -> Result<(), SeoError> {
    if value.contains(['\n', '\r']) {
        err(format!("{field} must not contain newline characters"))
    } else {
        Ok(())
    }
}

fn valid_date(value: &str) -> bool {
    let b = value.as_bytes();
    if b.len() != 10 || b[4] != b'-' || b[7] != b'-' {
        return false;
    }
    let digits = |r: std::ops::Range<usize>| -> Option<u32> {
        b[r].iter().try_fold(0u32, |acc, &c| c.is_ascii_digit().then(|| acc * 10 + u32::from(c - b'0')))
    };
    let (Some(y), Some(m), Some(d)) = (digits(0..4), digits(5..7), digits(8..10)) else {
        return false;
    };
    let leap = (y % 4 == 0 && y % 100 != 0) || y % 400 == 0;
    let days = match m {
        1 | 3 | 5 | 7 | 8 | 10 | 12 => 31,
        4 | 6 | 9 | 11 => 30,
        2 if leap => 29,
        2 => 28,
        _ => return false,
    };
    d >= 1 && d <= days
}

/// Escapes `& < > " '` for XML text and attribute values.
pub fn xml_escape(value: &str) -> String {
    let mut out = String::with_capacity(value.len());
    for c in value.chars() {
        match c {
            '&' => out.push_str("&amp;"),
            '<' => out.push_str("&lt;"),
            '>' => out.push_str("&gt;"),
            '"' => out.push_str("&quot;"),
            '\'' => out.push_str("&apos;"),
            _ => out.push(c),
        }
    }
    out
}

/// Renders a sitemaps.org 0.9 `urlset` with a trailing newline.
pub fn sitemap_xml(entries: &[SitemapEntry]) -> Result<String, SeoError> {
    if entries.len() > MAX_SITEMAP_ENTRIES {
        return err(format!("a sitemap holds at most {MAX_SITEMAP_ENTRIES} entries"));
    }
    let mut out = String::from(
        "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<urlset xmlns=\"http://www.sitemaps.org/schemas/sitemap/0.9\">\n",
    );
    for (i, e) in entries.iter().enumerate() {
        require_url(&format!("entries[{i}].loc"), e.loc)?;
        out.push_str("  <url>\n    <loc>");
        out.push_str(&xml_escape(e.loc));
        out.push_str("</loc>\n");
        if let Some(lastmod) = e.lastmod {
            if !valid_date(lastmod) {
                return err(format!("entries[{i}].lastmod must be a YYYY-MM-DD date: {lastmod:?}"));
            }
            out.push_str(&format!("    <lastmod>{}</lastmod>\n", xml_escape(lastmod)));
        }
        if let Some(freq) = e.changefreq {
            if !CHANGEFREQS.contains(&freq) {
                return err(format!("entries[{i}].changefreq must be one of {}: {freq:?}", CHANGEFREQS.join(", ")));
            }
            out.push_str(&format!("    <changefreq>{}</changefreq>\n", xml_escape(freq)));
        }
        if let Some(p) = e.priority {
            if !(0.0..=1.0).contains(&p) {
                return err(format!("entries[{i}].priority must be between 0.0 and 1.0: {p}"));
            }
            // Round half up to one decimal so every language renders the same digits.
            let tenths = (p * 10.0).round() as u32;
            out.push_str(&format!("    <priority>{}.{}</priority>\n", tenths / 10, tenths % 10));
        }
        out.push_str("  </url>\n");
    }
    out.push_str("</urlset>\n");
    Ok(out)
}

fn robots_path(field: &str, value: &str) -> Result<(), SeoError> {
    no_newline(field, value)?;
    if value.starts_with('/') || value.starts_with('*') {
        Ok(())
    } else {
        err(format!("{field} must start with '/' or '*': {value:?}"))
    }
}

/// Renders robots.txt. A final blank line is dropped when nothing follows it.
pub fn robots_txt(rules: &[RobotsRule], ai_crawlers: AiCrawlers, sitemaps: &[&str]) -> Result<String, SeoError> {
    let mut lines: Vec<String> = Vec::new();
    for (i, rule) in rules.iter().enumerate() {
        no_newline(&format!("rules[{i}].userAgent"), rule.user_agent)?;
        if rule.user_agent.trim().is_empty() {
            return err(format!("rules[{i}].userAgent must not be empty"));
        }
        lines.push(format!("User-agent: {}", rule.user_agent));
        for p in rule.allow {
            robots_path(&format!("rules[{i}].allow"), p)?;
            lines.push(format!("Allow: {p}"));
        }
        for p in rule.disallow {
            robots_path(&format!("rules[{i}].disallow"), p)?;
            lines.push(format!("Disallow: {p}"));
        }
        lines.push(String::new());
    }
    let directive = match ai_crawlers {
        AiCrawlers::Allow => Some("Allow: /"),
        AiCrawlers::Disallow => Some("Disallow: /"),
        AiCrawlers::Default => None,
    };
    if let Some(d) = directive {
        lines.extend(AI_CRAWLERS.iter().map(|ua| format!("User-agent: {ua}")));
        lines.push(d.to_string());
        lines.push(String::new());
    }
    for (i, s) in sitemaps.iter().enumerate() {
        require_url(&format!("sitemaps[{i}]"), s)?;
        lines.push(format!("Sitemap: {s}"));
    }
    if lines.last().is_some_and(|l| l.is_empty()) {
        lines.pop();
    }
    if lines.is_empty() {
        return Ok(String::new());
    }
    Ok(lines.join("\n") + "\n")
}

/// Renders llms.txt. An empty summary omits the blockquote.
pub fn llms_txt(title: &str, summary: &str, sections: &[LlmsSection]) -> Result<String, SeoError> {
    no_newline("title", title)?;
    no_newline("summary", summary)?;
    if title.trim().is_empty() {
        return err("title must not be empty".to_string());
    }
    let mut lines = vec![format!("# {title}")];
    if !summary.is_empty() {
        lines.push(String::new());
        lines.push(format!("> {summary}"));
    }
    for (i, section) in sections.iter().enumerate() {
        no_newline(&format!("sections[{i}].name"), section.name)?;
        if section.name.trim().is_empty() {
            return err(format!("sections[{i}].name must not be empty"));
        }
        lines.push(String::new());
        lines.push(format!("## {}", section.name));
        if !section.links.is_empty() {
            lines.push(String::new());
        }
        for (j, link) in section.links.iter().enumerate() {
            let field = format!("sections[{i}].links[{j}]");
            no_newline(&format!("{field}.title"), link.title)?;
            require_url(&format!("{field}.url"), link.url)?;
            let mut line = format!("- [{}]({})", link.title.replace(']', "\\]"), link.url);
            if let Some(d) = link.description {
                no_newline(&format!("{field}.description"), d)?;
                line.push_str(": ");
                line.push_str(d);
            }
            lines.push(line);
        }
    }
    Ok(lines.join("\n") + "\n")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sitemap_vector() {
        let entries = [
            SitemapEntry {
                loc: "https://example.com/",
                lastmod: Some("2026-10-01"),
                changefreq: Some("weekly"),
                priority: Some(1.0),
            },
            SitemapEntry { loc: "https://example.com/a?x=1&y=2", ..Default::default() },
        ];
        let want = "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<urlset xmlns=\"http://www.sitemaps.org/schemas/sitemap/0.9\">\n  <url>\n    <loc>https://example.com/</loc>\n    <lastmod>2026-10-01</lastmod>\n    <changefreq>weekly</changefreq>\n    <priority>1.0</priority>\n  </url>\n  <url>\n    <loc>https://example.com/a?x=1&amp;y=2</loc>\n  </url>\n</urlset>\n";
        assert_eq!(sitemap_xml(&entries).unwrap(), want);
    }

    #[test]
    fn sitemap_escaping_and_validation() {
        let e = [SitemapEntry { loc: "https://ex.com/<'\">", priority: Some(0.25), ..Default::default() }];
        let out = sitemap_xml(&e).unwrap();
        assert!(out.contains("<loc>https://ex.com/&lt;&apos;&quot;&gt;</loc>"));
        assert!(out.contains("<priority>0.3</priority>"));
        let bad = |e: SitemapEntry| sitemap_xml(&[e]).is_err();
        assert!(bad(SitemapEntry { loc: "/relative", ..Default::default() }));
        assert!(bad(SitemapEntry { loc: "ftp://ex.com/", ..Default::default() }));
        assert!(bad(SitemapEntry { loc: "https://ex.com/", lastmod: Some("2026-13-01"), ..Default::default() }));
        assert!(bad(SitemapEntry { loc: "https://ex.com/", lastmod: Some("2026-1-01"), ..Default::default() }));
        assert!(bad(SitemapEntry { loc: "https://ex.com/", changefreq: Some("sometimes"), ..Default::default() }));
        assert!(bad(SitemapEntry { loc: "https://ex.com/", priority: Some(1.5), ..Default::default() }));
        assert!(bad(SitemapEntry { loc: "https://ex.com/", priority: Some(f64::NAN), ..Default::default() }));
        let many = vec![SitemapEntry { loc: "https://ex.com/", ..Default::default() }; MAX_SITEMAP_ENTRIES + 1];
        assert!(sitemap_xml(&many).is_err());
    }

    #[test]
    fn robots_vectors() {
        let rules = [RobotsRule { user_agent: "*", allow: &[], disallow: &["/admin"] }];
        let want = "User-agent: *\nDisallow: /admin\n\nUser-agent: GPTBot\nUser-agent: ChatGPT-User\nUser-agent: OAI-SearchBot\nUser-agent: ClaudeBot\nUser-agent: Claude-Web\nUser-agent: anthropic-ai\nUser-agent: Google-Extended\nUser-agent: PerplexityBot\nUser-agent: CCBot\nUser-agent: Bytespider\nUser-agent: Applebot-Extended\nUser-agent: Meta-ExternalAgent\nDisallow: /\n\nSitemap: https://example.com/sitemap.xml\n";
        assert_eq!(robots_txt(&rules, AiCrawlers::Disallow, &["https://example.com/sitemap.xml"]).unwrap(), want);
        assert_eq!(robots_txt(&rules, AiCrawlers::Default, &[]).unwrap(), "User-agent: *\nDisallow: /admin\n");
        let allow = robots_txt(&rules, AiCrawlers::Allow, &[]).unwrap();
        assert!(allow.ends_with("User-agent: Meta-ExternalAgent\nAllow: /\n"));
    }

    #[test]
    fn robots_rejects_bad_input() {
        let r = |ua, a: &'static [&'static str]| [RobotsRule { user_agent: ua, allow: a, disallow: &[] }];
        assert!(robots_txt(&r("*", &["admin"]), AiCrawlers::Default, &[]).is_err());
        assert!(robots_txt(&r("*\nUser-agent: x", &[]), AiCrawlers::Default, &[]).is_err());
        assert!(robots_txt(&r("*", &["/a\r\nSitemap: x"]), AiCrawlers::Default, &[]).is_err());
        assert!(robots_txt(&r("*", &["*.pdf"]), AiCrawlers::Default, &[]).is_ok());
        assert!(robots_txt(&r("*", &[]), AiCrawlers::Default, &["sitemap.xml"]).is_err());
    }

    #[test]
    fn llms_vector() {
        let docs = [
            LlmsLink { title: "Quickstart", url: "https://acme.dev/start", description: Some("Install and launch") },
            LlmsLink { title: "API [v2]", url: "https://acme.dev/api", description: None },
        ];
        let optional = [LlmsLink { title: "Blog", url: "https://acme.dev/blog", description: None }];
        let sections = [LlmsSection { name: "Docs", links: &docs }, LlmsSection { name: "Optional", links: &optional }];
        let want = "# Acme\n\n> Acme builds rockets.\n\n## Docs\n\n- [Quickstart](https://acme.dev/start): Install and launch\n- [API [v2\\]](https://acme.dev/api)\n\n## Optional\n\n- [Blog](https://acme.dev/blog)\n";
        assert_eq!(llms_txt("Acme", "Acme builds rockets.", &sections).unwrap(), want);
    }

    #[test]
    fn llms_rejects_bad_input() {
        assert!(llms_txt("", "s", &[]).is_err());
        assert!(llms_txt("A\nB", "s", &[]).is_err());
        assert!(llms_txt("A", "line\nbreak", &[]).is_err());
        let rel = [LlmsLink { title: "x", url: "/docs", description: None }];
        assert!(llms_txt("A", "s", &[LlmsSection { name: "Docs", links: &rel }]).is_err());
        let nl = [LlmsLink { title: "x", url: "https://a.dev", description: Some("a\nb") }];
        assert!(llms_txt("A", "s", &[LlmsSection { name: "Docs", links: &nl }]).is_err());
    }
}
