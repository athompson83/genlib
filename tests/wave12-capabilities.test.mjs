// SPDX-License-Identifier: Apache-2.0
// Vector tests for the wave 12 TypeScript recipes: URI templates, Bloom filters, descriptive statistics, interval
// sets, shell quoting, number words, pagination windows, text wrapping, Markdown tables and NDJSON. Every vector comes
// from tests/fixtures/wave12-vectors.json, the shared wave 12 vector set used by every language; do not edit it by
// hand. Compiled with the same generated-tsconfig approach and strict flags as tests/wave11-capabilities.test.mjs.
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const recipeDir = join(root, 'examples/recipes');
const names = ['url-template', 'bloom-filter', 'stats-summary', 'interval-merge', 'shell-quote', 'number-to-words',
  'pagination-window', 'text-wrap', 'markdown-table', 'ndjson'];
const out = mkdtempSync(join(tmpdir(), 'genlib-wave12-'));
after(() => rmSync(out, { recursive: true, force: true }));
const compilerOptions = {
  strict: true, noUncheckedIndexedAccess: true, exactOptionalPropertyTypes: true, noImplicitReturns: true,
  noFallthroughCasesInSwitch: true, noUnusedLocals: true, noUnusedParameters: true, skipLibCheck: true,
  target: 'ES2022', module: 'NodeNext', moduleResolution: 'NodeNext', lib: ['ES2022', 'DOM', 'DOM.Iterable'],
  rootDir: recipeDir, outDir: out,
};
const project = join(out, 'tsconfig.wave12.json');
writeFileSync(project, JSON.stringify({ compilerOptions, files: names.map((n) => join(recipeDir, `${n}.ts`)) }));
execFileSync(process.execPath, [join(root, 'node_modules/typescript/bin/tsc'), '-p', project], { stdio: 'pipe' });
writeFileSync(join(out, 'package.json'), '{"type":"module"}');
const load = (name) => import(pathToFileURL(join(out, `${name}.js`)).href);
const findTop = (...words) => JSON.parse(execFileSync(process.execPath, ['tools/agent-recipes.mjs', 'find', ...words], { cwd: root, encoding: 'utf8' })).matches[0]?.id;
const V = JSON.parse(readFileSync(join(root, 'tests/fixtures/wave12-vectors.json'), 'utf8'));
const label = (x) => JSON.stringify(x);
const close = (actual, expected, msg) => {
  assert.ok(Math.abs(actual - expected) <= 1e-9 * Math.max(Math.abs(actual), Math.abs(expected)) + 1e-12,
    `${msg}: ${actual} != ${expected}`);
};

test('URI templates expand like the shared vectors', async () => {
  const { expandTemplate, UrlTemplateError } = await load('url-template');
  const u = V.url_template;
  for (const [template, expected] of u.cases) assert.equal(expandTemplate(template, u.variables), expected, template);
  for (const template of u.invalid) assert.throws(() => expandTemplate(template, u.variables), UrlTemplateError, label(template));
  const asMap = { ...u.variables, keys: new Map(Object.entries(u.variables.keys)) };
  assert.equal(expandTemplate('{?keys*}', asMap), '?semi=%3B&dot=.&comma=%2C', 'Map keeps insertion order');
  assert.equal(expandTemplate('{?m*}', { m: new Map([['b', '2'], ['a', '1']]) }), '?b=2&a=1');
  assert.equal(expandTemplate('{x}', { x: null }), '');
  assert.throws(() => expandTemplate('{n}', { n: 5 }), UrlTemplateError);
  assert.equal(expandTemplate('\u{1F600}{var}', u.variables), '%F0%9F%98%80value', 'astral literal encodes once');
  assert.equal(expandTemplate('a%2Fb%zz%', {}), 'a%2Fb%25zz%25', 'literal triplets copied, lone % encoded');
});

test('Bloom filters hash, size, serialize and union like the shared vectors', async () => {
  const { fnv1a64, bloomSizeFor, BloomFilter, BloomError } = await load('bloom-filter');
  const b = V.bloom;
  const enc = new TextEncoder();
  for (const [text, hex] of b.fnv1a64) assert.equal(fnv1a64(enc.encode(text)).toString(16).padStart(16, '0'), hex, text);
  for (const [n, p, m, k] of b.size_for) assert.deepEqual(bloomSizeFor(n, p), { m, k }, label([n, p]));
  for (const [n, p] of b.invalid_size) assert.throws(() => bloomSizeFor(n, p), BloomError, label([n, p]));
  const f = new BloomFilter(b.m, b.k);
  for (const [item, positions] of b.positions) assert.deepEqual(f.positions(item), positions, item);
  for (const item of b.added) f.add(item);
  assert.equal(f.serialize(), b.serialized);
  for (const [item, expected] of b.probes) assert.equal(f.mightContain(item), expected, item);
  assert.equal(f.countEstimate(), b.count_estimate);
  assert.equal(BloomFilter.deserialize(b.m, b.k, b.serialized).serialize(), b.serialized);
  const cherry = new BloomFilter(b.m, b.k);
  cherry.add('cherry');
  const u = f.union(cherry);
  assert.equal(u.serialize(), b.union_with_cherry);
  assert.equal(u.countEstimate(), b.union_count);
  for (const text of ['AAAA', 'A', '*'.repeat(43)]) assert.throws(() => BloomFilter.deserialize(b.m, b.k, text), BloomError, text);
  assert.throws(() => f.union(new BloomFilter(b.m, b.k + 1)), BloomError);
  assert.throws(() => new BloomFilter(4, 1), BloomError);
  assert.equal(new BloomFilter(8, 1, Uint8Array.of(255)).countEstimate(), null, 'saturated');
});

test('descriptive statistics match the shared vectors to 1e-9', async () => {
  const { summary, percentile, histogram, StatsError } = await load('stats-summary');
  const s = V.stats;
  for (const [xs, expected] of s.summary) {
    const got = summary(xs);
    assert.deepEqual(Object.keys(got).sort(), Object.keys(expected).sort());
    for (const [key, value] of Object.entries(expected)) close(got[key], value, `${label(xs)} ${key}`);
    assert.equal(got.count, expected.count);
  }
  for (const [xs, q, expected] of s.percentile) close(percentile(xs, q), expected, `${label(xs)} q=${q}`);
  for (const [xs, edges, expected] of s.histogram) assert.deepEqual(histogram(xs, edges), expected, label(edges));
  for (const xs of s.invalid_summary) assert.throws(() => summary(xs), StatsError);
  for (const [xs, q] of s.invalid_percentile) assert.throws(() => percentile(xs, q), StatsError, String(q));
  for (const edges of s.invalid_edges) assert.throws(() => histogram([1], edges), StatsError, label(edges));
  for (const xs of [[NaN], [1, Infinity]]) assert.throws(() => summary(xs), StatsError);
});

test('interval sets merge, intersect, subtract and query like the shared vectors', async () => {
  const iv = await load('interval-merge');
  const v = V.intervals;
  for (const [xs, expected] of v.merge) assert.deepEqual(iv.merge(xs), expected, label(xs));
  for (const [a, b, expected] of v.intersect) assert.deepEqual(iv.intersect(a, b), expected, label([a, b]));
  for (const [a, b, expected] of v.subtract) assert.deepEqual(iv.subtract(a, b), expected, label([a, b]));
  for (const [xs, lo, hi, expected] of v.gaps) assert.deepEqual(iv.gaps(xs, lo, hi), expected, label([xs, lo, hi]));
  for (const [xs, expected] of v.total) assert.equal(iv.total(xs), expected, label(xs));
  for (const [x, y, expected] of v.overlaps) assert.equal(iv.overlaps(x, y), expected, label([x, y]));
  for (const [xs, p, expected] of v.contains) assert.equal(iv.contains(xs, p), expected, String(p));
  for (const xs of v.invalid) assert.throws(() => iv.merge(xs), iv.IntervalError, label(xs));
  assert.throws(() => iv.gaps([], 5, 5), iv.IntervalError);
  assert.throws(() => iv.merge([[0.5, 2]]), iv.IntervalError);
  const input = [[3, 4], [1, 2]];
  iv.merge(input);
  assert.deepEqual(input, [[3, 4], [1, 2]], 'input not mutated');
});

test('shell quoting and splitting match the shared vectors and round-trip', async () => {
  const { shellQuote, shellJoin, shellSplit, ShellQuoteError } = await load('shell-quote');
  const v = V.shell;
  for (const [arg, expected] of v.quote) assert.equal(shellQuote(arg), expected, label(arg));
  for (const [args, expected] of v.join) assert.equal(shellJoin(args), expected, label(args));
  for (const [line, expected] of v.split) assert.deepEqual(shellSplit(line), expected, label(line));
  for (const arg of v.roundtrip) assert.deepEqual(shellSplit(shellQuote(arg)), [arg], label(arg));
  assert.deepEqual(shellSplit(shellJoin(v.roundtrip)), v.roundtrip);
  for (const line of v.invalid_split) assert.throws(() => shellSplit(line), ShellQuoteError, label(line));
});

test('number words, ordinals and money match the shared vectors', async () => {
  const { numberToWords, ordinalWords, ordinalSuffix, moneyWords } = await load('number-to-words');
  const v = V.number_words;
  for (const [n, expected] of v.words) assert.equal(numberToWords(n), expected, String(n));
  for (const [n, expected] of v.ordinal_words) assert.equal(ordinalWords(n), expected, String(n));
  for (const [n, expected] of v.ordinal_suffix) assert.equal(ordinalSuffix(n), expected, String(n));
  for (const [minor, major, minorName, exponent, expected] of v.money) assert.equal(moneyWords(minor, major, minorName, exponent), expected, String(minor));
  for (const n of [...v.invalid_words, 1.5]) assert.throws(() => numberToWords(n), RangeError, String(n));
  for (const n of v.invalid_ordinal) assert.throws(() => ordinalWords(n), RangeError, String(n));
  assert.throws(() => moneyWords(-1, 'dollar', 'cent'), RangeError);
  assert.throws(() => moneyWords(1, 'dollar', 'cent', 4), RangeError);
});

test('pagination windows match the shared vectors with null gaps', async () => {
  const { pageCount, pageOffset, pageWindow } = await load('pagination-window');
  const v = V.pagination;
  for (const [total, perPage, expected] of v.page_count) assert.equal(pageCount(total, perPage), expected, label([total, perPage]));
  for (const [page, perPage, expected] of v.offset) assert.equal(pageOffset(page, perPage), expected);
  for (const [current, total, siblings, boundaries, expected] of v.window) {
    assert.deepEqual(pageWindow(current, total, siblings, boundaries), expected.map((x) => (x === 'gap' ? null : x)),
      label([current, total, siblings, boundaries]));
  }
  for (const args of v.invalid_window) assert.throws(() => pageWindow(...args), RangeError, label(args));
  for (const args of v.invalid_page_count) assert.throws(() => pageCount(...args), RangeError, label(args));
  assert.throws(() => pageOffset(0, 10), RangeError);
});

test('text wrapping and truncation match the shared vectors by code point', async () => {
  const { wrapText, truncateText } = await load('text-wrap');
  const v = V.text_wrap;
  for (const [text, width, expected] of v.wrap) assert.equal(wrapText(text, width), expected, label([text, width]));
  for (const [text, maxLen, ellipsis, expected] of v.truncate) assert.equal(truncateText(text, maxLen, ellipsis), expected, label([text, maxLen]));
  for (const width of v.invalid_wrap) assert.throws(() => wrapText('text', width), RangeError, String(width));
  for (const [text, maxLen, ellipsis] of v.invalid_truncate) assert.throws(() => truncateText(text, maxLen, ellipsis), RangeError, label([text, maxLen]));
  assert.equal(truncateText('The quick brown fox jumps', 15), 'The quick…', 'default ellipsis');
});

test('Markdown tables render like the shared vectors', async () => {
  const { markdownTable } = await load('markdown-table');
  const v = V.markdown_table;
  for (const [headers, rows, align, expected] of v.cases) assert.equal(markdownTable(headers, rows, align), expected, label(headers));
  for (const [headers, rows, align] of v.invalid) assert.throws(() => markdownTable(headers, rows, align), RangeError, label([headers, rows, align]));
  assert.equal(markdownTable(['a'], [['1']]), '| a   |\n| --- |\n| 1   |', 'align omitted');
});

test('NDJSON parses and stringifies like the shared vectors', async () => {
  const { parseNdjson, stringifyNdjson, NdjsonError } = await load('ndjson');
  const v = V.ndjson;
  for (const [text, expected] of v.parse) assert.deepEqual(parseNdjson(text), expected, label(text));
  for (const [text, line] of v.invalid_parse) {
    assert.throws(() => parseNdjson(text), (e) => e instanceof NdjsonError && e.line === line && e.message.includes(`line ${line}`), label(text));
  }
  for (const [values, expected] of v.stringify) {
    assert.equal(stringifyNdjson(values), expected, label(values));
    assert.deepEqual(parseNdjson(expected), values);
  }
  assert.equal(stringifyNdjson([new Map([['2', 1], ['1', 2]])]), '{"2":1,"1":2}\n', 'Map keeps key order');
  for (const bad of [NaN, undefined, 1n, () => 1]) assert.throws(() => stringifyNdjson([bad]), NdjsonError, String(bad));
});

test('agent-recipes find routes wave 12 phrasings to the new recipes', () => {
  assert.equal(findTop('uri', 'template'), 'url-template');
  assert.equal(findTop('rfc', '6570'), 'url-template');
  assert.equal(findTop('bloom', 'filter'), 'bloom-filter');
  assert.equal(findTop('seen', 'before'), 'bloom-filter');
  assert.equal(findTop('standard', 'deviation'), 'stats-summary');
  assert.equal(findTop('p95', 'latency'), 'stats-summary');
  assert.equal(findTop('percentile'), 'stats-summary');
  assert.equal(findTop('merge', 'intervals'), 'interval-merge');
  assert.equal(findTop('free', 'slots'), 'interval-merge');
  assert.equal(findTop('shell', 'quote'), 'shell-quote');
  assert.equal(findTop('split', 'command', 'line'), 'shell-quote');
  assert.equal(findTop('number', 'to', 'words'), 'number-to-words');
  assert.equal(findTop('amount', 'in', 'words'), 'number-to-words');
  assert.equal(findTop('page', 'numbers'), 'pagination-window');
  assert.equal(findTop('pagination', 'buttons'), 'pagination-window');
  assert.equal(findTop('word', 'wrap'), 'text-wrap');
  assert.equal(findTop('markdown', 'table'), 'markdown-table');
  assert.equal(findTop('gfm', 'table'), 'markdown-table');
  assert.equal(findTop('ndjson'), 'ndjson');
  assert.equal(findTop('json', 'lines'), 'ndjson');
  // Existing recipes keep their phrasings.
  assert.equal(findTop('cursor', 'pagination'), 'cursor-pagination');
  assert.equal(findTop('markdown', 'excerpt'), 'markdown-to-plaintext-excerpt');
  assert.equal(findTop('fnv1a'), 'non-crypto-hashing');
  assert.equal(findTop('plural'), 'i18n-plural-and-message-format');
  assert.equal(findTop('deep', 'merge'), 'deep-merge-and-pick-omit');
});
