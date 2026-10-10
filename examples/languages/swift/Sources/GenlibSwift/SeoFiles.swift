// SPDX-License-Identifier: Apache-2.0
// Deterministic sitemap.xml, robots.txt (with AI-crawler rules) and llms.txt generation.

public enum SeoFilesError: Error, Equatable {
    case invalidArgument(String)
}

/// One sitemap URL. `lastmod` is YYYY-MM-DD; `priority` is 0.0-1.0.
public struct SitemapEntry: Sendable {
    public var loc: String
    public var lastmod: String?
    public var changefreq: String?
    public var priority: Double?
    public init(_ loc: String, lastmod: String? = nil, changefreq: String? = nil, priority: Double? = nil) {
        self.loc = loc; self.lastmod = lastmod; self.changefreq = changefreq; self.priority = priority
    }
}

/// One robots.txt group: a user agent with its Allow and Disallow paths.
public struct RobotsRule: Sendable {
    public var userAgent: String
    public var allow: [String]
    public var disallow: [String]
    public init(_ userAgent: String, allow: [String] = [], disallow: [String] = []) {
        self.userAgent = userAgent; self.allow = allow; self.disallow = disallow
    }
}

/// Whether robots.txt adds one group for known AI crawlers.
public enum AiCrawlerPolicy: String, Sendable { case `default`, allow, disallow }

public struct LlmsLink: Sendable {
    public var title: String, url: String, description: String?
    public init(_ title: String, _ url: String, description: String? = nil) {
        self.title = title; self.url = url; self.description = description
    }
}

public struct LlmsSection: Sendable {
    public var name: String
    public var links: [LlmsLink]
    public init(_ name: String, _ links: [LlmsLink]) { self.name = name; self.links = links }
}

public enum SeoFiles {
    public static let maxSitemapEntries = 50_000

    /// AI crawler user agents, in output order.
    public static let aiCrawlers = [
        "GPTBot", "ChatGPT-User", "OAI-SearchBot", "ClaudeBot", "Claude-Web", "anthropic-ai", "Google-Extended",
        "PerplexityBot", "CCBot", "Bytespider", "Applebot-Extended", "Meta-ExternalAgent",
    ]

    private static let changeFrequencies = ["always", "hourly", "daily", "weekly", "monthly", "yearly", "never"]

    /// Builds a sitemaps.org 0.9 urlset document with a trailing newline.
    public static func sitemapXML(_ entries: [SitemapEntry]) throws -> String {
        guard entries.count <= maxSitemapEntries else {
            throw SeoFilesError.invalidArgument("a sitemap holds at most \(maxSitemapEntries) entries")
        }
        var out = "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<urlset xmlns=\"http://www.sitemaps.org/schemas/sitemap/0.9\">\n"
        for e in entries {
            guard isAbsoluteHTTPURL(e.loc) else { throw SeoFilesError.invalidArgument("loc must be an absolute http(s) URL: \(e.loc)") }
            out += "  <url>\n    <loc>\(xmlEscape(e.loc))</loc>\n"
            if let lastmod = e.lastmod {
                guard isISODate(lastmod) else { throw SeoFilesError.invalidArgument("lastmod must be a YYYY-MM-DD date: \(lastmod)") }
                out += "    <lastmod>\(xmlEscape(lastmod))</lastmod>\n"
            }
            if let changefreq = e.changefreq {
                guard changeFrequencies.contains(changefreq) else {
                    throw SeoFilesError.invalidArgument("changefreq must be one of \(changeFrequencies.joined(separator: ", ")): \(changefreq)")
                }
                out += "    <changefreq>\(xmlEscape(changefreq))</changefreq>\n"
            }
            if let p = e.priority {
                guard !p.isNaN, p >= 0.0, p <= 1.0 else { throw SeoFilesError.invalidArgument("priority must be between 0.0 and 1.0") }
                let tenths = Int((p * 10).rounded())
                out += "    <priority>\(tenths / 10).\(tenths % 10)</priority>\n"
            }
            out += "  </url>\n"
        }
        return out + "</urlset>\n"
    }

    /// Builds robots.txt: rule groups, an optional AI-crawler group, then Sitemap lines.
    public static func robotsTxt(_ rules: [RobotsRule], aiCrawlers policy: AiCrawlerPolicy = .default, sitemaps: [String] = []) throws -> String {
        var groups: [String] = []
        for rule in rules {
            guard !trimmed(rule.userAgent).isEmpty, !hasNewline(rule.userAgent) else {
                throw SeoFilesError.invalidArgument("userAgent must be non-empty and single-line")
            }
            var g = "User-agent: \(rule.userAgent)\n"
            for path in rule.allow { g += "Allow: \(try checkPath(path))\n" }
            for path in rule.disallow { g += "Disallow: \(try checkPath(path))\n" }
            groups.append(g)
        }
        if policy != .default {
            var g = aiCrawlers.map { "User-agent: \($0)\n" }.joined()
            g += policy == .allow ? "Allow: /\n" : "Disallow: /\n"
            groups.append(g)
        }
        var sitemapLines = ""
        for url in sitemaps {
            guard isAbsoluteHTTPURL(url) else { throw SeoFilesError.invalidArgument("sitemap must be an absolute http(s) URL: \(url)") }
            sitemapLines += "Sitemap: \(url)\n"
        }
        var body = groups.joined(separator: "\n")
        if !body.isEmpty && !sitemapLines.isEmpty { body += "\n" }
        return body + sitemapLines
    }

    /// Builds an llms.txt file (https://llmstxt.org) with a single trailing newline.
    public static func llmsTxt(title: String, summary: String?, sections: [LlmsSection]) throws -> String {
        guard !trimmed(title).isEmpty else { throw SeoFilesError.invalidArgument("title must not be empty") }
        var blocks = ["# \(try singleLine(title))"]
        if let summary, !summary.isEmpty { blocks.append("> \(try singleLine(summary))") }
        for section in sections {
            guard !trimmed(section.name).isEmpty else { throw SeoFilesError.invalidArgument("section name must not be empty") }
            blocks.append("## \(try singleLine(section.name))")
            var lines: [String] = []
            for link in section.links {
                guard !trimmed(link.title).isEmpty else { throw SeoFilesError.invalidArgument("link title must not be empty") }
                guard isAbsoluteHTTPURL(link.url) else { throw SeoFilesError.invalidArgument("link url must be an absolute http(s) URL: \(link.url)") }
                let title = try singleLine(link.title).split(separator: "]", omittingEmptySubsequences: false).joined(separator: "\\]")
                var line = "- [\(title)](\(link.url))"
                if let d = link.description, !d.isEmpty { line += ": \(try singleLine(d))" }
                lines.append(line)
            }
            if !lines.isEmpty { blocks.append(lines.joined(separator: "\n")) }
        }
        return blocks.joined(separator: "\n\n") + "\n"
    }

    private static func checkPath(_ path: String) throws -> String {
        guard let first = path.first, first == "/" || first == "*", !hasNewline(path) else {
            throw SeoFilesError.invalidArgument("robots path must start with '/' or '*' and be single-line: \(path)")
        }
        return path
    }

    private static func singleLine(_ value: String) throws -> String {
        guard !hasNewline(value) else { throw SeoFilesError.invalidArgument("value must not contain newlines") }
        return value
    }

    private static func isISODate(_ s: String) -> Bool {
        let b = Array(s.utf8)
        guard b.count == 10, b[4] == UInt8(ascii: "-"), b[7] == UInt8(ascii: "-") else { return false }
        func num(_ r: Range<Int>) -> Int? {
            var v = 0
            for i in r { guard (48...57).contains(b[i]) else { return nil }; v = v * 10 + Int(b[i] - 48) }
            return v
        }
        guard let y = num(0..<4), let m = num(5..<7), let d = num(8..<10), (1...12).contains(m), d >= 1 else { return false }
        let leap = (y % 4 == 0 && y % 100 != 0) || y % 400 == 0
        let days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
        return d <= days[m - 1]
    }
}
