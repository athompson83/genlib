// SPDX-License-Identifier: Apache-2.0
/// Deterministic sitemap.xml, robots.txt (with AI-crawler rules) and llms.txt generation.
library;

import 'src/web_text.dart';

/// One sitemap URL. [lastmod] is YYYY-MM-DD; [priority] is 0.0-1.0.
class SitemapEntry {
  final String loc;
  final String? lastmod;
  final String? changefreq;
  final double? priority;
  const SitemapEntry(this.loc, {this.lastmod, this.changefreq, this.priority});
}

/// One robots.txt group: a user agent with its Allow and Disallow paths.
class RobotsRule {
  final String userAgent;
  final List<String> allow;
  final List<String> disallow;
  const RobotsRule(this.userAgent, {this.allow = const [], this.disallow = const []});
}

/// Whether robots.txt adds one group for known AI crawlers.
enum AiCrawlerPolicy { defaultPolicy, allow, disallow }

class LlmsLink {
  final String title;
  final String url;
  final String? description;
  const LlmsLink(this.title, this.url, {this.description});
}

class LlmsSection {
  final String name;
  final List<LlmsLink> links;
  const LlmsSection(this.name, this.links);
}

const maxSitemapEntries = 50000;

/// AI crawler user agents, in output order.
const aiCrawlers = [
  'GPTBot', 'ChatGPT-User', 'OAI-SearchBot', 'ClaudeBot', 'Claude-Web', 'anthropic-ai', 'Google-Extended',
  'PerplexityBot', 'CCBot', 'Bytespider', 'Applebot-Extended', 'Meta-ExternalAgent', //
];

const _changeFrequencies = ['always', 'hourly', 'daily', 'weekly', 'monthly', 'yearly', 'never'];

/// Builds a sitemaps.org 0.9 urlset document with a trailing newline.
String sitemapXml(List<SitemapEntry> entries) {
  if (entries.length > maxSitemapEntries) {
    throw ArgumentError.value(entries.length, 'entries', 'a sitemap holds at most $maxSitemapEntries entries');
  }
  final out = StringBuffer('<?xml version="1.0" encoding="UTF-8"?>\n'
      '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n');
  for (final e in entries) {
    if (!isAbsoluteHttpUrl(e.loc)) throw ArgumentError.value(e.loc, 'loc', 'must be an absolute http(s) URL');
    out.write('  <url>\n    <loc>${xmlEscape(e.loc)}</loc>\n');
    final lastmod = e.lastmod;
    if (lastmod != null) {
      if (!_isIsoDate(lastmod)) throw ArgumentError.value(lastmod, 'lastmod', 'must be a YYYY-MM-DD date');
      out.write('    <lastmod>${xmlEscape(lastmod)}</lastmod>\n');
    }
    final changefreq = e.changefreq;
    if (changefreq != null) {
      if (!_changeFrequencies.contains(changefreq)) {
        throw ArgumentError.value(changefreq, 'changefreq', 'must be one of ${_changeFrequencies.join(', ')}');
      }
      out.write('    <changefreq>${xmlEscape(changefreq)}</changefreq>\n');
    }
    final p = e.priority;
    if (p != null) {
      if (p.isNaN || p < 0.0 || p > 1.0) throw ArgumentError.value(p, 'priority', 'must be between 0.0 and 1.0');
      final tenths = (p * 10).round();
      out.write('    <priority>${tenths ~/ 10}.${tenths % 10}</priority>\n');
    }
    out.write('  </url>\n');
  }
  out.write('</urlset>\n');
  return out.toString();
}

/// Builds robots.txt: rule groups, an optional AI-crawler group, then Sitemap lines.
String robotsTxt(List<RobotsRule> rules,
    {AiCrawlerPolicy aiCrawlerPolicy = AiCrawlerPolicy.defaultPolicy, List<String> sitemaps = const []}) {
  final groups = <String>[];
  for (final rule in rules) {
    if (rule.userAgent.trim().isEmpty || hasNewline(rule.userAgent)) {
      throw ArgumentError.value(rule.userAgent, 'userAgent', 'must be non-empty and single-line');
    }
    final g = StringBuffer('User-agent: ${rule.userAgent}\n');
    for (final path in rule.allow) {
      g.write('Allow: ${_checkPath(path)}\n');
    }
    for (final path in rule.disallow) {
      g.write('Disallow: ${_checkPath(path)}\n');
    }
    groups.add(g.toString());
  }
  if (aiCrawlerPolicy != AiCrawlerPolicy.defaultPolicy) {
    final g = StringBuffer();
    for (final bot in aiCrawlers) {
      g.write('User-agent: $bot\n');
    }
    g.write(aiCrawlerPolicy == AiCrawlerPolicy.allow ? 'Allow: /\n' : 'Disallow: /\n');
    groups.add(g.toString());
  }
  final sitemapLines = StringBuffer();
  for (final url in sitemaps) {
    if (!isAbsoluteHttpUrl(url)) throw ArgumentError.value(url, 'sitemaps', 'must be an absolute http(s) URL');
    sitemapLines.write('Sitemap: $url\n');
  }
  var body = groups.join('\n');
  if (body.isNotEmpty && sitemapLines.isNotEmpty) body += '\n';
  return body + sitemapLines.toString();
}

/// Builds an llms.txt file (https://llmstxt.org) with a single trailing newline.
String llmsTxt({required String title, String? summary, required List<LlmsSection> sections}) {
  if (title.trim().isEmpty) throw ArgumentError.value(title, 'title', 'must not be empty');
  final blocks = <String>['# ${_singleLine(title, 'title')}'];
  if (summary != null && summary.isNotEmpty) blocks.add('> ${_singleLine(summary, 'summary')}');
  for (final section in sections) {
    if (section.name.trim().isEmpty) throw ArgumentError.value(section.name, 'section name', 'must not be empty');
    blocks.add('## ${_singleLine(section.name, 'section name')}');
    final lines = <String>[];
    for (final link in section.links) {
      if (link.title.trim().isEmpty) throw ArgumentError.value(link.title, 'link title', 'must not be empty');
      if (!isAbsoluteHttpUrl(link.url)) throw ArgumentError.value(link.url, 'link url', 'must be an absolute http(s) URL');
      var line = '- [${_singleLine(link.title, 'link title').replaceAll(']', r'\]')}](${link.url})';
      final description = link.description;
      if (description != null && description.isNotEmpty) line += ': ${_singleLine(description, 'link description')}';
      lines.add(line);
    }
    if (lines.isNotEmpty) blocks.add(lines.join('\n'));
  }
  return '${blocks.join('\n\n')}\n';
}

String _checkPath(String path) {
  if (path.isEmpty || hasNewline(path) || (path[0] != '/' && path[0] != '*')) {
    throw ArgumentError.value(path, 'path', "must start with '/' or '*' and be single-line");
  }
  return path;
}

String _singleLine(String value, String name) {
  if (hasNewline(value)) throw ArgumentError.value(value, name, 'must not contain newlines');
  return value;
}

bool _isIsoDate(String s) {
  final m = RegExp(r'^(\d{4})-(\d{2})-(\d{2})$').firstMatch(s);
  if (m == null) return false;
  final y = int.parse(m[1]!), mo = int.parse(m[2]!), d = int.parse(m[3]!);
  if (mo < 1 || mo > 12 || d < 1) return false;
  const days = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  final leap = (y % 4 == 0 && y % 100 != 0) || y % 400 == 0;
  return d <= (mo == 2 && leap ? 29 : days[mo - 1]);
}
