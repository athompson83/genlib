// SPDX-License-Identifier: Apache-2.0
// Vector tests for the marketing Tier A recipes (seo-files, structured-data, utm-links).
// Compiled with the same generated-tsconfig approach and strict flags as
// tests/capabilities.test.mjs, then imported as ES modules.
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const recipeDir = join(root, 'examples/recipes');
const names = ['seo-files', 'structured-data', 'utm-links'];
const out = mkdtempSync(join(tmpdir(), 'genlib-marketing-'));
after(() => rmSync(out, { recursive: true, force: true }));
const compilerOptions = {
  strict: true, noUncheckedIndexedAccess: true, exactOptionalPropertyTypes: true, noImplicitReturns: true,
  noFallthroughCasesInSwitch: true, noUnusedLocals: true, noUnusedParameters: true, skipLibCheck: true,
  target: 'ES2022', module: 'NodeNext', moduleResolution: 'NodeNext', lib: ['ES2022', 'DOM', 'DOM.Iterable'],
  rootDir: recipeDir, outDir: out,
};
const project = join(out, 'tsconfig.marketing.json');
writeFileSync(project, JSON.stringify({ compilerOptions, files: names.map((n) => join(recipeDir, `${n}.ts`)) }));
execFileSync(process.execPath, [join(root, 'node_modules/typescript/bin/tsc'), '-p', project], { stdio: 'pipe' });
writeFileSync(join(out, 'package.json'), '{"type":"module"}');
const load = (name) => import(pathToFileURL(join(out, `${name}.js`)).href);
const findTop = (...words) => JSON.parse(execFileSync(process.execPath, ['tools/agent-recipes.mjs', 'find', ...words], { cwd: root, encoding: 'utf8' })).matches[0]?.id;

const AI = ['GPTBot', 'ChatGPT-User', 'OAI-SearchBot', 'ClaudeBot', 'Claude-Web', 'anthropic-ai', 'Google-Extended',
  'PerplexityBot', 'CCBot', 'Bytespider', 'Applebot-Extended', 'Meta-ExternalAgent'].map((a) => `User-agent: ${a}\n`).join('');

test('marketing recipes are registered and routed', () => {
  const entries = JSON.parse(readFileSync(join(root, 'resources/agent-recipes.json'), 'utf8')).entries;
  for (const n of names) assert.ok(entries.some((e) => e.path === `examples/recipes/${n}.ts`), n);
  assert.equal(findTop('sitemap'), 'seo-files-sitemap-robots-llms');
  assert.equal(findTop('llms.txt'), 'seo-files-sitemap-robots-llms');
  assert.equal(findTop('json-ld'), 'structured-data-json-ld-meta');
  assert.equal(findTop('open', 'graph'), 'structured-data-json-ld-meta');
  assert.equal(findTop('utm'), 'utm-campaign-links');
});

test('seo-files: sitemap.xml vector, escaping and validation', async () => {
  const { sitemapXml } = await load('seo-files');
  assert.equal(sitemapXml([
    { loc: 'https://example.com/', lastmod: '2026-10-01', changefreq: 'weekly', priority: 1 },
    { loc: 'https://example.com/a?x=1&y=2' },
  ]), '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
    + '  <url>\n    <loc>https://example.com/</loc>\n    <lastmod>2026-10-01</lastmod>\n    <changefreq>weekly</changefreq>\n'
    + '    <priority>1.0</priority>\n  </url>\n  <url>\n    <loc>https://example.com/a?x=1&amp;y=2</loc>\n  </url>\n</urlset>\n');
  assert.match(sitemapXml([{ loc: "https://example.com/it's<\"x\">" }]), /<loc>https:\/\/example\.com\/it&apos;s&lt;&quot;x&quot;&gt;<\/loc>/);
  assert.match(sitemapXml([{ loc: 'https://e.com/', priority: 0 }]), /<priority>0\.0<\/priority>/);
  assert.match(sitemapXml([{ loc: 'https://e.com/', priority: 0.25 }]), /<priority>0\.3<\/priority>/);
  assert.match(sitemapXml([{ loc: 'https://e.com/', priority: 0.85 }]), /<priority>0\.9<\/priority>/);
  assert.throws(() => sitemapXml([{ loc: '/relative' }]), /absolute/);
  assert.throws(() => sitemapXml([{ loc: 'ftp://e.com/' }]), /absolute/);
  assert.throws(() => sitemapXml([{ loc: 'https://e.com/', lastmod: '2026-13-01' }]), /lastmod/);
  assert.throws(() => sitemapXml([{ loc: 'https://e.com/', lastmod: '2026-1-01' }]), /lastmod/);
  assert.throws(() => sitemapXml([{ loc: 'https://e.com/', changefreq: 'often' }]), /changefreq/);
  assert.throws(() => sitemapXml([{ loc: 'https://e.com/', priority: 1.1 }]), /priority/);
  assert.throws(() => sitemapXml([{ loc: 'https://e.com/', priority: -0.1 }]), /priority/);
  assert.throws(() => sitemapXml(Array.from({ length: 50001 }, () => ({ loc: 'https://e.com/' }))), /50000/);
});

test('seo-files: robots.txt vectors, AI crawler groups and validation', async () => {
  const { robotsTxt } = await load('seo-files');
  const rules = [{ userAgent: '*', disallow: ['/admin'] }];
  assert.equal(robotsTxt({ rules, aiCrawlers: 'disallow', sitemaps: ['https://example.com/sitemap.xml'] }),
    `User-agent: *\nDisallow: /admin\n\n${AI}Disallow: /\n\nSitemap: https://example.com/sitemap.xml\n`);
  assert.equal(robotsTxt({ rules, aiCrawlers: 'default' }), 'User-agent: *\nDisallow: /admin\n');
  assert.equal(robotsTxt({ rules, aiCrawlers: 'allow' }), `User-agent: *\nDisallow: /admin\n\n${AI}Allow: /\n`);
  assert.equal(robotsTxt({ rules: [{ userAgent: 'Bingbot', allow: ['/public', '*.css'], disallow: ['/'] }] }),
    'User-agent: Bingbot\nAllow: /public\nAllow: *.css\nDisallow: /\n');
  assert.throws(() => robotsTxt({ rules: [{ userAgent: '*', disallow: ['admin'] }] }), /start with/);
  assert.throws(() => robotsTxt({ rules: [{ userAgent: '*\nUser-agent: evil', disallow: ['/'] }] }), /newline/);
  assert.throws(() => robotsTxt({ rules: [{ userAgent: '*', disallow: ['/a\r\nSitemap: x'] }] }), /newline/);
  assert.throws(() => robotsTxt({ rules, aiCrawlers: 'block' }), /aiCrawlers/);
  assert.throws(() => robotsTxt({ rules, sitemaps: ['/sitemap.xml'] }), /absolute/);
  assert.throws(() => robotsTxt({ rules: [{ userAgent: '*' }] }), /at least one/);
});

test('seo-files: llms.txt vector and validation', async () => {
  const { llmsTxt } = await load('seo-files');
  assert.equal(llmsTxt({
    title: 'Acme', summary: 'Acme builds rockets.', sections: [
      { name: 'Docs', links: [{ title: 'Quickstart', url: 'https://acme.dev/start', description: 'Install and launch' }, { title: 'API [v2]', url: 'https://acme.dev/api' }] },
      { name: 'Optional', links: [{ title: 'Blog', url: 'https://acme.dev/blog' }] },
    ],
  }), '# Acme\n\n> Acme builds rockets.\n\n## Docs\n\n- [Quickstart](https://acme.dev/start): Install and launch\n'
    + '- [API [v2\\]](https://acme.dev/api)\n\n## Optional\n\n- [Blog](https://acme.dev/blog)\n');
  assert.equal(llmsTxt({ title: 'Acme', summary: 'S', sections: [] }), '# Acme\n\n> S\n');
  assert.throws(() => llmsTxt({ title: '', summary: 'S', sections: [] }), /title/);
  assert.throws(() => llmsTxt({ title: 'A\nB', summary: 'S', sections: [] }), /newline/);
  assert.throws(() => llmsTxt({ title: 'A', summary: 'S\nT', sections: [] }), /newline/);
  assert.throws(() => llmsTxt({ title: 'A', summary: 'S', sections: [{ name: 'D', links: [{ title: 'x', url: '/rel' }] }] }), /absolute/);
  assert.throws(() => llmsTxt({ title: 'A', summary: 'S', sections: [{ name: 'D', links: [{ title: 'x', url: 'https://a.dev', description: 'a\nb' }] }] }), /newline/);
});

test('structured-data: JSON-LD script vector and value rules', async () => {
  const { jsonLdScript } = await load('structured-data');
  assert.equal(jsonLdScript({ '@context': 'https://schema.org', '@type': 'Organization', name: 'A&B </script>', url: 'https://ab.example', sameAs: ['https://x.com/ab'] }),
    '<script type="application/ld+json">{"@context":"https://schema.org","@type":"Organization","name":"A\\u0026B \\u003c/script\\u003e","url":"https://ab.example","sameAs":["https://x.com/ab"]}</script>');
  assert.equal(jsonLdScript({ a: 1, b: 2.5, c: true, d: null, e: { f: [1, 'x\u2028y\u2029'] }, g: 'q"\\\n' }),
    '<script type="application/ld+json">{"a":1,"b":2.5,"c":true,"d":null,"e":{"f":[1,"x\\u2028y\\u2029"]},"g":"q\\"\\\\\\n"}</script>');
  assert.throws(() => jsonLdScript({ n: NaN }), /finite/);
  assert.throws(() => jsonLdScript({ n: Infinity }), /finite/);
  assert.throws(() => jsonLdScript({ d: new Date(0) }), /unsupported/);
  assert.throws(() => jsonLdScript('x'), /object or an array/);
});

test('structured-data: meta tag vectors and validation', async () => {
  const { metaTags } = await load('structured-data');
  assert.equal(metaTags({ title: 'Tom & "Jerry"', description: 'Cat <3 mouse', canonical: 'https://ex.com/tj', image: 'https://ex.com/tj.png', siteName: 'Ex' }), [
    '<title>Tom &amp; &quot;Jerry&quot;</title>',
    '<meta name="description" content="Cat &lt;3 mouse">',
    '<link rel="canonical" href="https://ex.com/tj">',
    '<meta property="og:title" content="Tom &amp; &quot;Jerry&quot;">',
    '<meta property="og:description" content="Cat &lt;3 mouse">',
    '<meta property="og:url" content="https://ex.com/tj">',
    '<meta property="og:image" content="https://ex.com/tj.png">',
    '<meta property="og:site_name" content="Ex">',
    '<meta property="og:type" content="website">',
    '<meta name="twitter:card" content="summary_large_image">',
    '<meta name="twitter:title" content="Tom &amp; &quot;Jerry&quot;">',
    '<meta name="twitter:description" content="Cat &lt;3 mouse">',
    '<meta name="twitter:image" content="https://ex.com/tj.png">',
  ].join('\n'));
  assert.equal(metaTags({ title: 'T' }), '<title>T</title>\n<meta property="og:title" content="T">\n<meta property="og:type" content="website">\n'
    + '<meta name="twitter:card" content="summary_large_image">\n<meta name="twitter:title" content="T">');
  assert.match(metaTags({ title: 'T', type: 'article', twitterCard: 'summary', locale: 'en_US' }),
    /og:type" content="article">\n<meta property="og:locale" content="en_US">\n<meta name="twitter:card" content="summary">/);
  assert.throws(() => metaTags({ title: 'T', canonical: 'http://ex.com' }), /canonical/);
  assert.throws(() => metaTags({ title: 'T', image: '/a.png' }), /image/);
  assert.throws(() => metaTags({ title: 'T', twitterCard: 'large' }), /twitterCard/);
  assert.throws(() => metaTags({ title: ' ' }), /title/);
});

test('utm-links: build, parse and strip vectors', async () => {
  const u = await load('utm-links');
  assert.equal(u.buildUtmUrl('https://ex.com/p?ref=a#top', { source: 'Newsletter', medium: 'email', campaign: 'Fall Sale' }),
    'https://ex.com/p?ref=a&utm_source=newsletter&utm_medium=email&utm_campaign=fall%20sale#top');
  assert.equal(u.buildUtmUrl('https://ex.com/?utm_source=old', { source: 'x', medium: 'y', campaign: 'z', content: 'Hero CTA' }),
    'https://ex.com/?utm_source=x&utm_medium=y&utm_campaign=z&utm_content=hero%20cta');
  assert.equal(u.buildUtmUrl('http://ex.com', { source: ' A ', medium: 'b', campaign: "c!*'()", term: 'k', id: 'Q4' }),
    'http://ex.com?utm_id=q4&utm_source=a&utm_medium=b&utm_campaign=c%21%2A%27%28%29&utm_term=k');
  assert.equal(u.buildUtmUrl('https://ex.com/?utm_medium=a&k=1&utm_medium=b', { source: 's', medium: 'm', campaign: 'c' }),
    'https://ex.com/?utm_medium=m&k=1&utm_source=s&utm_campaign=c');
  assert.equal(u.buildUtmUrl('https://ex.com/', { source: 'café', medium: 'm', campaign: 'c' }), 'https://ex.com/?utm_source=caf%C3%A9&utm_medium=m&utm_campaign=c');
  assert.throws(() => u.buildUtmUrl('https://ex.com/', { source: ' ', medium: 'm', campaign: 'c' }), /source is required/);
  assert.throws(() => u.buildUtmUrl('/p', { source: 's', medium: 'm', campaign: 'c' }), /absolute/);
  assert.throws(() => u.buildUtmUrl('mailto:a@b.c', { source: 's', medium: 'm', campaign: 'c' }), /absolute/);
  assert.deepEqual(u.parseUtm('https://ex.com/?a=1&utm_campaign=fall%20sale&utm_source=news+letter&utm_source=dup'), { source: 'news letter', campaign: 'fall sale' });
  assert.deepEqual(Object.keys(u.parseUtm('https://ex.com/?utm_content=c&utm_term=t&utm_id=i&utm_medium=m')), ['id', 'medium', 'term', 'content']);
  assert.deepEqual(u.parseUtm('https://ex.com/#utm_source=x'), {});
  assert.throws(() => u.parseUtm('https://ex.com/?utm_source=%E0%A4%A'), /percent-encoding/);
  assert.equal(u.stripTracking('https://ex.com/p?id=7&utm_source=x&gclid=abc&b=2#s'), 'https://ex.com/p?id=7&b=2#s');
  assert.equal(u.stripTracking('https://ex.com/?fbclid=1'), 'https://ex.com/');
  assert.equal(u.stripTracking('https://ex.com/?q=a%20b&msclkid=1&_hsenc=2&igshid=3&x=%2F'), 'https://ex.com/?q=a%20b&x=%2F');
  assert.throws(() => u.stripTracking('ex.com/?a=1'), /absolute/);
});
