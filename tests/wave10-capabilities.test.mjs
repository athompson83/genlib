// SPDX-License-Identifier: Apache-2.0
// Vector tests for the wave 10 TypeScript recipes: glob matching, .env parsing, form query strings, MIME types,
// data: URLs, ISO week dates, topological sort, Link headers, Content-Disposition and Cache-Control. Every vector
// comes from tests/fixtures/wave10-vectors.json, the shared wave 10 vector set used by every language (bytes are
// hex strings); do not edit it by hand. Compiled with the same generated-tsconfig approach and strict flags as
// tests/wave9-capabilities.test.mjs.
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const recipeDir = join(root, 'examples/recipes');
const names = ['glob-match', 'dotenv', 'query-string', 'mime-types', 'data-uri', 'iso-week', 'topo-sort', 'link-header', 'content-disposition', 'cache-control'];
const out = mkdtempSync(join(tmpdir(), 'genlib-wave10-'));
after(() => rmSync(out, { recursive: true, force: true }));
const compilerOptions = {
  strict: true, noUncheckedIndexedAccess: true, exactOptionalPropertyTypes: true, noImplicitReturns: true,
  noFallthroughCasesInSwitch: true, noUnusedLocals: true, noUnusedParameters: true, skipLibCheck: true,
  target: 'ES2022', module: 'NodeNext', moduleResolution: 'NodeNext', lib: ['ES2022', 'DOM', 'DOM.Iterable'],
  rootDir: recipeDir, outDir: out,
};
const project = join(out, 'tsconfig.wave10.json');
writeFileSync(project, JSON.stringify({ compilerOptions, files: names.map((n) => join(recipeDir, `${n}.ts`)) }));
execFileSync(process.execPath, [join(root, 'node_modules/typescript/bin/tsc'), '-p', project], { stdio: 'pipe' });
writeFileSync(join(out, 'package.json'), '{"type":"module"}');
const load = (name) => import(pathToFileURL(join(out, `${name}.js`)).href);
const findTop = (...words) => JSON.parse(execFileSync(process.execPath, ['tools/agent-recipes.mjs', 'find', ...words], { cwd: root, encoding: 'utf8' })).matches[0]?.id;
const V = JSON.parse(readFileSync(join(root, 'tests/fixtures/wave10-vectors.json'), 'utf8'));
const bytes = (hex) => Uint8Array.from(hex.match(/../g) ?? [], (h) => parseInt(h, 16));
const toHex = (data) => Array.from(data, (b) => b.toString(16).padStart(2, '0')).join('');
const entries = (obj) => Object.entries(obj);
const label = (x) => JSON.stringify(x);

test('glob matching matches the shared vectors', async () => {
  const { globMatch, globFilter } = await load('glob-match');
  for (const [pattern, path, dot, expected] of V.glob.match) assert.equal(globMatch(pattern, path, dot), expected, label([pattern, path, dot]));
  for (const pattern of V.glob.invalid) assert.throws(() => globMatch(pattern, 'x'), RangeError, label(pattern));
  assert.throws(() => globMatch('}', 'x'), RangeError);
  const paths = ['src/a.ts', 'src/b.js', 'src/.hidden/c.ts', 'lib/d.ts', 'README.md'];
  assert.deepEqual(globFilter('src/**/*.ts', paths), ['src/a.ts']);
  assert.deepEqual(globFilter('src/**/*.ts', paths, true), ['src/a.ts', 'src/.hidden/c.ts']);
  assert.deepEqual(globFilter('{src,lib}/*.ts', paths), ['src/a.ts', 'lib/d.ts']);
  assert.equal(globMatch('?', '\u{1F600}'), true, 'one code point per ?, not one UTF-16 unit');
  assert.equal(globMatch('[\u{1F600}-\u{1F64F}]', '\u{1F610}'), true, 'class ranges compare code points');
  assert.equal(globMatch('**/'.repeat(30) + '*a*a*a*a*a*a*a*a*b', `${'a/'.repeat(30)}${'a'.repeat(40)}`), false, 'memoized, no blowup');
});

test('dotenv parsing matches the shared vectors', async () => {
  const { parseDotenv } = await load('dotenv');
  for (const [text, expected] of V.dotenv.parse) assert.deepEqual([...parseDotenv(text)], entries(expected), label(text));
  for (const [text, vars, expected] of V.dotenv.expand) assert.deepEqual([...parseDotenv(text, true, vars)], entries(expected), label(text));
  for (const text of V.dotenv.invalid) assert.throws(() => parseDotenv(text), RangeError, label(text));
  assert.throws(() => parseDotenv("A=1\n\nB='x\n"), /^RangeError: line 3:/);
  assert.equal(parseDotenv('A=${toString}', true).get('A'), '', 'vars lookups ignore inherited properties');
});

test('query strings parse and stringify like the shared vectors', async () => {
  const { parseQuery, stringifyQuery, getAll } = await load('query-string');
  for (const [text, expected] of V.query.parse) assert.deepEqual(parseQuery(text), expected, label(text));
  for (const [pairs, expected] of V.query.stringify) {
    assert.equal(stringifyQuery(pairs), expected);
    assert.deepEqual(parseQuery(expected), pairs);
  }
  for (const [text, name, expected] of V.query.get_all) assert.deepEqual(getAll(parseQuery(text), name), expected);
  assert.deepEqual(parseQuery('b=%EF%BB%BFx'), [['b', '﻿x']], 'a decoded BOM is kept');
});

test('MIME types match the shared vectors', async () => {
  const { mimeTypeFor, extensionFor, contentTypeFor } = await load('mime-types');
  for (const [name, expected] of V.mime.type_for) assert.equal(mimeTypeFor(name), expected, name);
  for (const [mime, expected] of V.mime.extension_for) assert.equal(extensionFor(mime), expected, mime);
  for (const [name, expected] of V.mime.content_type) assert.equal(contentTypeFor(name), expected, name);
});

test('data: URLs parse and build like the shared vectors', async () => {
  const { parseDataUri, buildDataUri } = await load('data-uri');
  for (const [url, expected] of V.data_uri.parse) {
    const got = parseDataUri(url);
    assert.deepEqual({ mime: got.mime, params: [...got.params], base64: got.base64, data_hex: toHex(got.data) },
      { mime: expected.mime, params: entries(expected.params), base64: expected.base64, data_hex: expected.data_hex }, label(url));
  }
  for (const [hex, mime, b64, expected] of V.data_uri.build) {
    assert.equal(buildDataUri(bytes(hex), mime, b64), expected);
    assert.equal(toHex(parseDataUri(expected).data), hex);
  }
  for (const url of V.data_uri.invalid_parse) assert.throws(() => parseDataUri(url), RangeError, label(url));
  for (const [hex, mime] of V.data_uri.invalid_build) assert.throws(() => buildDataUri(bytes(hex), mime), RangeError, mime);
  assert.equal(buildDataUri(bytes('6869')), 'data:application/octet-stream;base64,aGk=');
});

test('ISO week dates match the shared vectors', async () => {
  const w = await load('iso-week');
  for (const [date, week, formatted] of V.iso_week.iso_week) {
    assert.deepEqual(w.isoWeek(...date), week, label(date));
    assert.equal(w.formatIsoWeek(...date), formatted);
    assert.deepEqual(w.fromIsoWeek(...week), date, label(week));
    assert.deepEqual(w.parseIsoWeek(formatted), date, formatted);
  }
  for (const [year, expected] of V.iso_week.weeks_in_year) assert.equal(w.weeksInYear(year), expected, String(year));
  for (const [week, expected] of V.iso_week.from_iso_week) assert.deepEqual(w.fromIsoWeek(...week), expected, label(week));
  for (const [text, expected] of V.iso_week.parse) assert.deepEqual(w.parseIsoWeek(text), expected, text);
  for (const text of V.iso_week.invalid) assert.throws(() => w.parseIsoWeek(text), RangeError, text);
  assert.throws(() => w.isoWeek(2021, 2, 29), RangeError);
  assert.throws(() => w.fromIsoWeek(9999, 52, 6), RangeError, 'past 9999-12-31');
  assert.throws(() => w.isoWeek(2026, 1, 1.5), RangeError);
});

test('topological sort matches the shared vectors', async () => {
  const { topoSort, topoLevels, CycleError } = await load('topo-sort');
  for (const [nodes, edges, expected] of V.topo.sort) assert.deepEqual(topoSort(nodes, edges), expected, label(nodes));
  for (const [nodes, edges, expected] of V.topo.levels) assert.deepEqual(topoLevels(nodes, edges), expected, label(nodes));
  const cycles = [...V.topo.cycle,
    // nodes only downstream of a cycle are dropped before the walk
    [['z', 'a', 'b'], [['a', 'z'], ['a', 'b'], ['b', 'a']], 'cycle: a -> b -> a'],
    [['s', 'x', 'y', 'd'], [['x', 'd'], ['x', 'y'], ['y', 'x'], ['d', 's']], 'cycle: x -> y -> x']];
  for (const [nodes, edges, message] of cycles) {
    for (const fn of [topoSort, topoLevels]) {
      assert.throws(() => fn(nodes, edges), (e) => e instanceof CycleError && e instanceof RangeError && e.message === message, label([nodes, edges]));
    }
  }
  for (const [nodes, edges] of V.topo.invalid) {
    for (const fn of [topoSort, topoLevels]) assert.throws(() => fn(nodes, edges), (e) => e instanceof RangeError && !(e instanceof CycleError), label(nodes));
  }
});

test('Link headers parse, find and format like the shared vectors', async () => {
  const { parseLinkHeader, findRel, formatLinkHeader } = await load('link-header');
  const plain = (links) => links.map((l) => ({ uri: l.uri, params: [...l.params] }));
  const toLinks = (links) => links.map((l) => ({ uri: l.uri, params: new Map(entries(l.params)) }));
  for (const [header, expected] of V.link.parse) assert.deepEqual(plain(parseLinkHeader(header)), plain(toLinks(expected)), label(header));
  for (const [header, rel, uri] of V.link.rel) assert.equal(findRel(parseLinkHeader(header), rel)?.uri ?? null, uri, rel);
  for (const [links, expected] of V.link.format) {
    assert.equal(formatLinkHeader(toLinks(links)), expected);
    assert.deepEqual(plain(parseLinkHeader(expected)), plain(toLinks(links)));
  }
  for (const header of V.link.invalid) assert.throws(() => parseLinkHeader(header), RangeError, label(header));
  assert.throws(() => parseLinkHeader("<a>; title*=UTF-8''%FF"), RangeError, 'invalid UTF-8');
  assert.equal(findRel(parseLinkHeader('<a>; title=x'), ''), null);
});

test('Content-Disposition builds and parses like the shared vectors', async () => {
  const { buildContentDisposition, parseContentDisposition, sanitizeFilename } = await load('content-disposition');
  for (const [filename, inline, expected] of V.disposition.build) {
    assert.equal(buildContentDisposition(filename, inline), expected, label(filename));
    assert.equal(parseContentDisposition(expected).filename, sanitizeFilename(filename));
  }
  for (const [header, expected] of V.disposition.parse) {
    const got = parseContentDisposition(header);
    assert.deepEqual({ ...got, params: [...got.params] }, { ...expected, params: entries(expected.params) }, label(header));
  }
  for (const header of V.disposition.invalid) assert.throws(() => parseContentDisposition(header), RangeError, label(header));
  assert.equal(sanitizeFilename(' ..a/b\\c\x7f.. '), 'a_b_c_');
  assert.equal(sanitizeFilename('...'), 'download');
});

test('Cache-Control parses, formats and computes freshness like the shared vectors', async () => {
  const { parseCacheControl, formatCacheControl, cacheFreshness } = await load('cache-control');
  for (const [header, expected] of V.cache_control.parse) assert.deepEqual([...parseCacheControl(header)], entries(expected), label(header));
  for (const [directives, expected] of V.cache_control.format) {
    assert.equal(formatCacheControl(entries(directives)), expected);
    assert.deepEqual([...parseCacheControl(expected)], entries(directives));
  }
  for (const [header, shared, expected] of V.cache_control.freshness) assert.equal(cacheFreshness(parseCacheControl(header), shared), expected, header);
  for (const header of V.cache_control.invalid) assert.throws(() => parseCacheControl(header), RangeError, label(header));
  assert.deepEqual([...parseCacheControl('max-age=٣')], [], 'only ASCII digits');
});

test('agent-recipes find routes wave 10 phrasings to the new recipes', () => {
  assert.equal(findTop('glob', 'pattern'), 'glob-match');
  assert.equal(findTop('wildcard', 'match', 'paths'), 'glob-match');
  assert.equal(findTop('dotenv'), 'dotenv-parse');
  assert.equal(findTop('env', 'file'), 'dotenv-parse');
  assert.equal(findTop('urlencoded'), 'query-string');
  assert.equal(findTop('repeated', 'params'), 'query-string');
  assert.equal(findTop('mime', 'type'), 'mime-types');
  assert.equal(findTop('content', 'type', 'from', 'extension'), 'mime-types');
  assert.equal(findTop('data', 'uri'), 'data-uri');
  assert.equal(findTop('base64', 'image'), 'data-uri');
  assert.equal(findTop('week', 'number'), 'iso-week');
  assert.equal(findTop('topological', 'sort'), 'topo-sort');
  assert.equal(findTop('dependency', 'order'), 'topo-sort');
  assert.equal(findTop('link', 'header', 'pagination'), 'link-header');
  assert.equal(findTop('content-disposition'), 'content-disposition');
  assert.equal(findTop('attachment', 'download', 'header'), 'content-disposition');
  assert.equal(findTop('cache-control'), 'cache-control');
  assert.equal(findTop('stale', 'while', 'revalidate'), 'cache-control');
  // existing recipes keep their routes
  assert.equal(findTop('query', 'string', 'filters'), 'url-query-state');
  assert.equal(findTop('magic', 'bytes'), 'file-signature');
  assert.equal(findTop('path', 'traversal'), 'safe-filename-and-path-join');
  assert.equal(findTop('lru', 'cache'), 'lru-cache-with-ttl');
  assert.equal(findTop('cursor', 'pagination'), 'cursor-pagination');
});
