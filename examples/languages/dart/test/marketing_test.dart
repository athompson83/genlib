// SPDX-License-Identifier: Apache-2.0
import 'package:genlib_validation_example/seo_files.dart';
import 'package:genlib_validation_example/structured_data.dart';
import 'package:genlib_validation_example/utm_links.dart';

import 'src/checks.dart';

void runSeoFilesTests(Checks c) {
  c.eq(
      'sitemap vector',
      '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n  <url>\n    <loc>https://example.com/</loc>\n    <lastmod>2026-10-01</lastmod>\n    <changefreq>weekly</changefreq>\n    <priority>1.0</priority>\n  </url>\n  <url>\n    <loc>https://example.com/a?x=1&amp;y=2</loc>\n  </url>\n</urlset>\n',
      sitemapXml(const [
        SitemapEntry('https://example.com/', lastmod: '2026-10-01', changefreq: 'weekly', priority: 1),
        SitemapEntry('https://example.com/a?x=1&y=2'),
      ]));
  c.check('sitemap escapes quotes',
      sitemapXml(const [SitemapEntry('https://ex.com/\'"<>')]).contains('<loc>https://ex.com/&apos;&quot;&lt;&gt;</loc>'));
  c.check('sitemap priority one decimal',
      sitemapXml(const [SitemapEntry('https://ex.com/', priority: 0.25)]).contains('<priority>0.3</priority>'));
  c.throws<ArgumentError>('sitemap relative loc', () => sitemapXml(const [SitemapEntry('/a')]));
  c.throws<ArgumentError>('sitemap ftp loc', () => sitemapXml(const [SitemapEntry('ftp://ex.com/')]));
  c.throws<ArgumentError>('sitemap bad lastmod', () => sitemapXml(const [SitemapEntry('https://ex.com/', lastmod: '2026-13-01')]));
  c.throws<ArgumentError>('sitemap bad changefreq', () => sitemapXml(const [SitemapEntry('https://ex.com/', changefreq: 'often')]));
  c.throws<ArgumentError>('sitemap priority > 1', () => sitemapXml(const [SitemapEntry('https://ex.com/', priority: 1.5)]));
  c.throws<ArgumentError>('sitemap > 50000', () => sitemapXml(List.filled(50001, const SitemapEntry('https://ex.com/'))));

  const rules = [RobotsRule('*', disallow: ['/admin'])];
  c.eq(
      'robots vector',
      'User-agent: *\nDisallow: /admin\n\nUser-agent: GPTBot\nUser-agent: ChatGPT-User\nUser-agent: OAI-SearchBot\nUser-agent: ClaudeBot\nUser-agent: Claude-Web\nUser-agent: anthropic-ai\nUser-agent: Google-Extended\nUser-agent: PerplexityBot\nUser-agent: CCBot\nUser-agent: Bytespider\nUser-agent: Applebot-Extended\nUser-agent: Meta-ExternalAgent\nDisallow: /\n\nSitemap: https://example.com/sitemap.xml\n',
      robotsTxt(rules, aiCrawlerPolicy: AiCrawlerPolicy.disallow, sitemaps: ['https://example.com/sitemap.xml']));
  c.eq('robots default no sitemaps', 'User-agent: *\nDisallow: /admin\n', robotsTxt(rules));
  c.check('robots allow AI',
      robotsTxt(rules, aiCrawlerPolicy: AiCrawlerPolicy.allow).endsWith('User-agent: Meta-ExternalAgent\nAllow: /\n'));
  c.eq('robots allow then disallow', 'User-agent: Googlebot\nAllow: /public\nDisallow: /*.pdf\$\n',
      robotsTxt(const [RobotsRule('Googlebot', allow: ['/public'], disallow: [r'/*.pdf$'])]));
  c.throws<ArgumentError>('robots bad path', () => robotsTxt(const [RobotsRule('*', disallow: ['admin'])]));
  c.throws<ArgumentError>('robots newline injection', () => robotsTxt(const [RobotsRule('*\nDisallow: /', disallow: ['/a'])]));
  c.throws<ArgumentError>('robots path newline', () => robotsTxt(const [RobotsRule('*', disallow: ['/a\r\nSitemap: x'])]));
  c.throws<ArgumentError>('robots relative sitemap', () => robotsTxt(rules, sitemaps: ['/sitemap.xml']));

  const sections = [
    LlmsSection('Docs', [
      LlmsLink('Quickstart', 'https://acme.dev/start', description: 'Install and launch'),
      LlmsLink('API [v2]', 'https://acme.dev/api'),
    ]),
    LlmsSection('Optional', [LlmsLink('Blog', 'https://acme.dev/blog')]),
  ];
  c.eq(
      'llms vector',
      '# Acme\n\n> Acme builds rockets.\n\n## Docs\n\n- [Quickstart](https://acme.dev/start): Install and launch\n- [API [v2\\]](https://acme.dev/api)\n\n## Optional\n\n- [Blog](https://acme.dev/blog)\n',
      llmsTxt(title: 'Acme', summary: 'Acme builds rockets.', sections: sections));
  c.throws<ArgumentError>('llms empty title', () => llmsTxt(title: '', summary: 's', sections: sections));
  c.throws<ArgumentError>('llms relative url',
      () => llmsTxt(title: 'Acme', sections: const [LlmsSection('Docs', [LlmsLink('a', '/a')])]));
  c.throws<ArgumentError>('llms newline', () => llmsTxt(title: 'Acme', summary: 'line1\nline2', sections: sections));
}

void runStructuredDataTests(Checks c) {
  c.eq(
      'json-ld vector',
      r'<script type="application/ld+json">{"@context":"https://schema.org","@type":"Organization","name":"A\u0026B \u003c/script\u003e","url":"https://ab.example","sameAs":["https://x.com/ab"]}</script>',
      jsonLdScript({
        '@context': 'https://schema.org',
        '@type': 'Organization',
        'name': 'A&B </script>',
        'url': 'https://ab.example',
        'sameAs': ['https://x.com/ab'],
      }));
  c.eq(
      'json-ld scalars',
      r'<script type="application/ld+json">{"n":3,"f":2.5,"w":2,"t":true,"z":null,"s":"q\"\\\n\u2028\u2029","o":{"a":[]}}</script>',
      jsonLdScript({
        'n': 3,
        'f': 2.5,
        'w': 2.0,
        't': true,
        'z': null,
        's': 'q"\\\n\u2028\u2029',
        'o': {'a': []},
      }));
  c.throws<ArgumentError>('json-ld NaN', () => jsonLdScript({'x': double.nan}));
  c.throws<ArgumentError>('json-ld Infinity', () => jsonLdScript({'x': double.infinity}));
  c.eq(
      'meta vector',
      '<title>Tom &amp; &quot;Jerry&quot;</title>\n<meta name="description" content="Cat &lt;3 mouse">\n<link rel="canonical" href="https://ex.com/tj">\n<meta property="og:title" content="Tom &amp; &quot;Jerry&quot;">\n<meta property="og:description" content="Cat &lt;3 mouse">\n<meta property="og:url" content="https://ex.com/tj">\n<meta property="og:image" content="https://ex.com/tj.png">\n<meta property="og:site_name" content="Ex">\n<meta property="og:type" content="website">\n<meta name="twitter:card" content="summary_large_image">\n<meta name="twitter:title" content="Tom &amp; &quot;Jerry&quot;">\n<meta name="twitter:description" content="Cat &lt;3 mouse">\n<meta name="twitter:image" content="https://ex.com/tj.png">',
      metaTags(
          title: 'Tom & "Jerry"',
          description: 'Cat <3 mouse',
          canonical: 'https://ex.com/tj',
          image: 'https://ex.com/tj.png',
          siteName: 'Ex'));
  c.eq(
      'meta title only',
      '<title>T</title>\n<meta property="og:title" content="T">\n<meta property="og:type" content="website">\n<meta name="twitter:card" content="summary_large_image">\n<meta name="twitter:title" content="T">',
      metaTags(title: 'T'));
  c.eq('meta title only 5 lines', 5, metaTags(title: 'T').split('\n').length);
  c.throws<ArgumentError>('meta http canonical', () => metaTags(title: 'T', canonical: 'http://ex.com'));
  c.throws<ArgumentError>('meta bad twitter card', () => metaTags(title: 'T', twitterCard: 'big'));
  c.throws<ArgumentError>('meta empty title', () => metaTags(title: ' '));
}

void runUtmLinksTests(Checks c) {
  c.eq('utm build vector 1', 'https://ex.com/p?ref=a&utm_source=newsletter&utm_medium=email&utm_campaign=fall%20sale#top',
      buildUtmUrl('https://ex.com/p?ref=a#top', source: 'Newsletter', medium: 'email', campaign: 'Fall Sale'));
  c.eq('utm build vector 2', 'https://ex.com/?utm_source=x&utm_medium=y&utm_campaign=z&utm_content=hero%20cta',
      buildUtmUrl('https://ex.com/?utm_source=old', source: 'x', medium: 'y', campaign: 'z', content: 'Hero CTA'));
  c.eq('utm build id first', 'https://ex.com/?utm_id=c1&utm_source=a&utm_medium=b&utm_campaign=c&utm_term=t',
      buildUtmUrl('https://ex.com/', source: ' A ', medium: 'b', campaign: 'c', term: 't', id: 'C1'));
  c.throws<ArgumentError>('utm missing campaign', () => buildUtmUrl('https://ex.com/', source: 'a', medium: 'b', campaign: '  '));
  c.throws<ArgumentError>('utm relative base', () => buildUtmUrl('/p', source: 'a', medium: 'b', campaign: 'c'));
  c.throws<ArgumentError>('utm javascript base', () => buildUtmUrl('javascript:alert(1)', source: 'a', medium: 'b', campaign: 'c'));
  final parsed = parseUtm('https://ex.com/?a=1&utm_campaign=fall%20sale&utm_source=news+letter&utm_source=dup');
  c.eq('utm parse vector', 'source=news letter;campaign=fall sale', parsed.entries.map((e) => '${e.key}=${e.value}').join(';'));
  c.eq('utm parse keys', 2, parsed.length);
  c.eq('utm strip vector 1', 'https://ex.com/p?id=7&b=2#s', stripTracking('https://ex.com/p?id=7&utm_source=x&gclid=abc&b=2#s'));
  c.eq('utm strip vector 2', 'https://ex.com/', stripTracking('https://ex.com/?fbclid=1'));
  c.eq('utm strip keeps encoding', 'https://ex.com/?q=a%20b+c', stripTracking('https://ex.com/?q=a%20b+c&msclkid=9&_hsenc=x'));
}

void main() {
  final c = Checks('marketing');
  runSeoFilesTests(c);
  runStructuredDataTests(c);
  runUtmLinksTests(c);
  c.finish();
}
