// Behavior tests for the single-file TypeScript recipes in examples/recipes.
// The recipes are compiled once with the repository's pinned TypeScript compiler under the
// strictest flags used in this repository (plus unused-code checks) into a scratch directory,
// then imported as ES modules. This works on every Node 22 release and in CI without relying
// on Node's type stripping.
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const recipeDir = join(root, 'examples/recipes');
const files = readdirSync(recipeDir).filter((f) => f.endsWith('.ts')).sort();
const out = mkdtempSync(join(tmpdir(), 'genlib-recipes-'));
after(() => rmSync(out, { recursive: true, force: true }));
// A generated tsconfig keeps this working on TypeScript 5.x and 7.x: TypeScript 7 refuses to
// compile files named on the command line while the repository's tsconfig.json is present.
const compilerOptions = {
  strict: true, noUncheckedIndexedAccess: true, exactOptionalPropertyTypes: true, noImplicitReturns: true,
  noFallthroughCasesInSwitch: true, noUnusedLocals: true, noUnusedParameters: true, skipLibCheck: true,
  // Recipes are copied into apps that may run TypeScript with Node's type stripping: erasable syntax only.
  erasableSyntaxOnly: true,
  target: 'ES2022', module: 'NodeNext', moduleResolution: 'NodeNext', lib: ['ES2022', 'DOM', 'DOM.Iterable'],
  rootDir: recipeDir, outDir: out,
};
const project = join(out, 'tsconfig.recipes.json');
writeFileSync(project, JSON.stringify({ compilerOptions, files: files.map((f) => join(recipeDir, f)) }));
execFileSync(process.execPath, [join(root, 'node_modules/typescript/bin/tsc'), '-p', project], { stdio: 'pipe' });
writeFileSync(join(out, 'package.json'), '{"type":"module"}');
const load = (name) => import(pathToFileURL(join(out, `${name}.js`)).href);

const registry = JSON.parse(readFileSync(join(root, 'resources/agent-recipes.json'), 'utf8')).entries;
const recipeEntries = registry.filter((e) => e.path.startsWith('examples/recipes/'));
const findRecipes = (...words) => JSON.parse(execFileSync(process.execPath, ['tools/agent-recipes.mjs', 'find', ...words], { cwd: root, encoding: 'utf8' })).matches;
const ch = (code) => String.fromCodePoint(code);

test('every recipe file is registered, licensed, focused and installable', () => {
  assert.ok(files.length >= 25, `expected at least 25 recipes, found ${files.length}`);
  assert.deepEqual(recipeEntries.map((e) => e.path.replace('examples/recipes/', '')).sort(), files);
  for (const entry of recipeEntries) {
    const body = readFileSync(join(root, entry.path), 'utf8');
    assert.match(body, /^\/\/ SPDX-License-Identifier: Apache-2\.0\n/, entry.id);
    assert.doesNotMatch(body, /^import |require\(/m, `${entry.id} must be dependency-free`);
    assert.ok(body.split('\n').length <= 160, `${entry.id} should stay focused`);
    assert.equal(entry.kind, 'source-example');
    assert.ok(['typescript', 'react', 'css', 'node'].includes(entry.platform));
    assert.ok(entry.taskTerms.length >= 6 && entry.checks.length >= 2 && entry.variants.length >= 1, entry.id);
  }
  const plan = spawnSync(process.execPath, ['tools/recipe-install.mjs', 'plan', 'money-minor-units', '--target', out], { cwd: root, encoding: 'utf8' });
  assert.equal(plan.status, 0, plan.stderr);
  assert.match(JSON.parse(plan.stdout).destination, /genlib\/money\.ts$/);
});

test('agent-recipes find routes common phrasings to the new recipes', () => {
  const top = (...words) => findRecipes(...words)[0]?.id;
  assert.equal(top('url', 'slug'), 'slugify-and-unique-slug');
  assert.equal(top('split', 'payment', 'cents'), 'money-minor-units');
  assert.equal(top('business', 'days'), 'date-ranges-and-business-days');
  assert.equal(top('cursor', 'pagination'), 'cursor-pagination');
  assert.equal(top('prototype', 'pollution'), 'deep-merge-and-pick-omit');
  assert.equal(top('debounce', 'search', 'input'), 'debounce-throttle');
  assert.equal(top('concurrency', 'limit'), 'async-pool');
  assert.equal(top('lru', 'cache'), 'lru-cache-with-ttl');
  assert.equal(top('semver', 'range'), 'semver-compare-and-range');
  assert.equal(top('path', 'traversal'), 'safe-filename-and-path-join');
  assert.equal(top('parse', 'csv', 'import'), 'csv-parse');
  assert.equal(top('query', 'string', 'filters'), 'url-query-state');
  assert.equal(top('decode', 'jwt'), 'jwt-decode-unverified');
  assert.equal(top('password', 'rules'), 'password-strength-policy');
  assert.equal(top('pluralization'), 'i18n-plural-and-message-format');
  assert.equal(top('contrast', 'wcag'), 'color-contrast-wcag');
  assert.equal(top('markdown', 'excerpt'), 'markdown-to-plaintext-excerpt');
  assert.equal(top('escape', 'html'), 'html-escape-and-safe-template');
  assert.equal(top('event', 'emitter'), 'event-emitter-typed');
  assert.equal(top('result', 'type'), 'result-type-and-error-mapping');
  assert.equal(top('feature', 'flag', 'rollout'), 'feature-flag-percentage-rollout');
  assert.equal(top('idempotency', 'key'), 'idempotency-key-store');
  assert.equal(top('outbox'), 'outbox-pattern-in-memory');
  assert.equal(top('state', 'machine'), 'state-machine-typed');
  assert.equal(top('diff', 'lines'), 'text-diff-lines');
  assert.equal(top('token', 'budget'), 'token-budget-truncation');
  // Existing routes keep their first place.
  assert.equal(top('shopping', 'cart'), 'storefront-cart');
  assert.equal(top('csv', 'export'), 'csv-export');
});

test('slugify and uniqueSlug', async () => {
  const { slugify, uniqueSlug } = await load('slugify');
  assert.equal(slugify('Héllo, Wörld!'), 'hello-world');
  assert.equal(slugify('Straße & Café'), 'strasse-and-cafe');
  assert.equal(slugify("  --It's  a__test--  "), 'its-a-test');
  assert.equal(slugify('Hello World', { separator: '_' }), 'hello_world');
  assert.equal(slugify('one two three', { maxLength: 8 }), 'one-two');
  assert.equal(slugify(ch(0x1f600) + ch(0x1f600)), 'item');
  assert.equal(slugify('!!!', { fallback: 'untitled' }), 'untitled');
  assert.equal(slugify('Привет мир'), 'item');
  assert.equal(slugify('Привет мир', { unicode: true }), 'привет-мир');
  assert.throws(() => slugify('x', { maxLength: 0 }), RangeError);
  assert.equal(uniqueSlug('Post', ['post', 'post-2']), 'post-3');
  assert.equal(uniqueSlug('Post', (s) => s === 'post'), 'post-2');
  assert.equal(uniqueSlug('Fresh', []), 'fresh');
  assert.equal(uniqueSlug('a'.repeat(10), ['aaaaaaaaaa'], { maxLength: 10 }), 'aaaaaaaa-2');
  assert.throws(() => uniqueSlug('x', () => true, { maxAttempts: 3 }), /No unique slug/);
});

test('money: parse, round, rate, allocate and format without floats', async () => {
  const m = await load('money');
  assert.equal(m.currencyExponent('USD'), 2);
  assert.equal(m.currencyExponent('JPY'), 0);
  assert.equal(m.currencyExponent('KWD'), 3);
  assert.throws(() => m.currencyExponent('usd'), RangeError);
  assert.equal(m.parseMoney('12.34', 'USD'), 1234);
  assert.equal(m.parseMoney('-0.07', 'USD'), -7);
  assert.equal(m.parseMoney('12', 'JPY'), 12);
  assert.equal(m.parseMoney('0.1', 'USD') + m.parseMoney('0.2', 'USD'), 30);
  assert.throws(() => m.parseMoney('1.005', 'USD'), /decimal places/);
  assert.equal(m.parseMoney('1.005', 'USD', 'half-even'), 100);
  assert.equal(m.parseMoney('1.015', 'USD', 'half-even'), 102);
  assert.equal(m.parseMoney('1.005', 'USD', 'half-up'), 101);
  assert.throws(() => m.parseMoney('1,000.00', 'USD'), RangeError);
  assert.equal(m.divideRounded(5n, 2n, 'half-even'), 2n);
  assert.equal(m.divideRounded(7n, 2n, 'half-even'), 4n);
  assert.equal(m.divideRounded(-5n, 2n, 'half-up'), -3n);
  assert.equal(m.divideRounded(-5n, 2n, 'floor'), -3n);
  assert.equal(m.divideRounded(-5n, 2n, 'ceil'), -2n);
  assert.equal(m.divideRounded(5n, -2n, 'truncate'), -2n);
  assert.throws(() => m.divideRounded(1n, 0n), RangeError);
  assert.equal(m.applyRate(1000, '0.0825'), 82);
  assert.equal(m.applyRate(1000, '0.0825', 'half-up'), 83);
  assert.equal(m.applyRate(-1000, '0.0825', 'half-up'), -83);
  assert.equal(m.applyRate(999, '1.5', 'half-up'), 1499);
  assert.deepEqual(m.allocate(100, [1, 1, 1]), [34, 33, 33]);
  assert.deepEqual(m.allocate(-100, [1, 1, 1]), [-34, -33, -33]);
  assert.deepEqual(m.allocate(5, [0, 1]), [0, 5]);
  assert.deepEqual(m.allocate(1, [3, 7]), [0, 1]);
  for (let i = 1; i < 200; i += 7) {
    const parts = m.allocate(i * 13, [3, 5, 11, 1]);
    assert.equal(parts.reduce((a, b) => a + b, 0), i * 13);
  }
  assert.throws(() => m.allocate(10, [0, 0]), RangeError);
  assert.throws(() => m.allocate(10, [1.5]), RangeError);
  assert.throws(() => m.allocate(0.5, [1]), RangeError);
  assert.equal(m.formatMoney(123456, 'EUR', 'de-DE').replace(/\s/g, ' '), '1.234,56 €');
  assert.equal(m.formatMoney(500, 'JPY', 'en-US'), '¥500');
  assert.equal(m.formatMoney(-1999, 'USD'), '-$19.99');
});

test('date ranges and business days are UTC-safe', async () => {
  const d = await load('date-ranges');
  assert.equal(d.toDayNumber('1970-01-02'), 1);
  assert.equal(d.fromDayNumber(19723), '2024-01-01');
  assert.throws(() => d.toDayNumber('2023-02-29'), /Invalid calendar date/);
  assert.throws(() => d.toDayNumber('2024-1-01'), /YYYY-MM-DD/);
  assert.equal(d.addDays('2024-02-28', 2), '2024-03-01');
  assert.equal(d.addDays('2024-03-01', -1), '2024-02-29');
  assert.equal(d.daysBetween('2024-03-09', '2024-03-11'), 2); // spans a US DST change
  assert.equal(d.weekday('2024-01-01'), 1);
  assert.equal(d.weekday('1969-12-28'), 0);
  assert.equal(d.countBusinessDays({ start: '2024-01-01', end: '2024-01-07' }), 5);
  assert.equal(d.countBusinessDays({ start: '2024-01-01', end: '2024-01-07' }, { holidays: ['2024-01-01'] }), 4);
  assert.equal(d.countBusinessDays({ start: '2024-01-07', end: '2024-01-07' }, { weekend: [5, 6] }), 1);
  assert.equal(d.addBusinessDays('2024-01-05', 1), '2024-01-08');
  assert.equal(d.addBusinessDays('2024-01-08', -1), '2024-01-05');
  assert.equal(d.addBusinessDays('2024-01-06', 0), '2024-01-08');
  assert.equal(d.addBusinessDays('2024-12-24', 1, { holidays: ['2024-12-25'] }), '2024-12-26');
  assert.equal(d.isBusinessDay('2024-01-05', { weekend: [5, 6] }), false);
  assert.deepEqual(d.eachDay({ start: '2024-02-28', end: '2024-03-01' }), ['2024-02-28', '2024-02-29', '2024-03-01']);
  assert.throws(() => d.eachDay({ start: '2024-01-02', end: '2024-01-01' }), /before start/);
  assert.throws(() => d.eachDay({ start: '2000-01-01', end: '2024-01-01' }), /maxDays/);
  assert.equal(d.rangesOverlap({ start: '2024-01-01', end: '2024-01-05' }, { start: '2024-01-05', end: '2024-01-09' }), true);
  assert.equal(d.rangesOverlap({ start: '2024-01-01', end: '2024-01-04' }, { start: '2024-01-05', end: '2024-01-09' }), false);
  assert.equal(d.dateInTimeZone(new Date('2024-01-01T03:00:00Z'), 'America/New_York'), '2023-12-31');
  assert.equal(d.dateInTimeZone(new Date('2024-01-01T03:00:00Z'), 'Asia/Tokyo'), '2024-01-01');
  assert.throws(() => d.isBusinessDay('2024-01-01', { weekend: [0, 1, 2, 3, 4, 5, 6] }), /working weekday/);
});

test('cursor pagination walks every item exactly once with opaque cursors', async () => {
  const c = await load('cursor-pagination');
  const cursor = c.encodeCursor(['naïve ' + ch(0x1f600), 7]);
  assert.match(cursor, /^[A-Za-z0-9_-]+$/);
  assert.deepEqual(c.decodeCursor(cursor, c.isCursorKey), ['naïve ' + ch(0x1f600), 7]);
  assert.throws(() => c.decodeCursor('!!!', c.isCursorKey), /Invalid cursor/);
  assert.throws(() => c.decodeCursor(c.encodeCursor({ a: 1 }), c.isCursorKey), /Invalid cursor/);
  assert.throws(() => c.decodeCursor(btoa('not json').replace(/=+$/, ''), c.isCursorKey), /Invalid cursor/);
  assert.throws(() => c.decodeCursor('a'.repeat(2000), c.isCursorKey), /Invalid cursor/);
  // Sort values repeat, so the id tie-breaker matters.
  const items = Array.from({ length: 25 }, (_, i) => ({ id: i + 1, score: Math.floor(i / 4) }));
  const key = (x) => [x.score, x.id];
  const seen = [];
  let request = { limit: 10 };
  let pages = 0;
  for (;;) {
    const page = c.paginate(items, key, request);
    seen.push(...page.items.map((x) => x.id));
    pages++;
    if (!page.hasMore) { assert.equal(page.nextCursor, null); break; }
    request = { limit: 10, cursor: page.nextCursor };
  }
  assert.equal(pages, 3);
  assert.deepEqual(seen, items.map((x) => x.id));
  assert.deepEqual(c.paginate(items, key, { cursor: c.encodeCursor([99, 99]) }).items, []);
  assert.equal(c.clampLimit(1000), 100);
  assert.equal(c.clampLimit(undefined), 20);
  assert.throws(() => c.clampLimit(0), RangeError);
});

test('deepMerge resists prototype pollution; pick and omit', async () => {
  const { deepMerge, mergeWith, pick, omit, isPlainObject } = await load('deep-merge');
  const base = { a: 1, nested: { x: 1, list: [1, 2] } };
  const merged = deepMerge(base, { nested: { y: 2, list: [3] } }, { a: undefined, b: 'b' });
  assert.deepEqual(merged, { a: 1, nested: { x: 1, y: 2, list: [3] }, b: 'b' });
  assert.deepEqual(base, { a: 1, nested: { x: 1, list: [1, 2] } });
  assert.notEqual(merged.nested, base.nested);
  assert.deepEqual(mergeWith({ arrays: 'concat' }, { l: [1] }, { l: [2] }), { l: [1, 2] });
  const evil = JSON.parse('{"__proto__": {"polluted": true}, "constructor": {"prototype": {"polluted": true}}, "ok": 1}');
  const safe = deepMerge({}, evil);
  assert.equal({}.polluted, undefined);
  assert.equal(Object.prototype.hasOwnProperty.call(safe, '__proto__'), false);
  assert.deepEqual(safe, { ok: 1 });
  const date = new Date(0);
  assert.equal(deepMerge({}, { when: date }).when, date);
  assert.equal(isPlainObject(Object.create(null)), true);
  assert.equal(isPlainObject(date), false);
  let deep = {};
  for (let i = 0; i < 100; i++) deep = { d: deep };
  assert.throws(() => deepMerge({}, deep), /maxDepth/);
  assert.deepEqual(pick({ a: 1, b: 2, c: 3 }, ['a', 'c', 'z']), { a: 1, c: 3 });
  assert.deepEqual(omit({ a: 1, b: 2, c: 3 }, ['b']), { a: 1, c: 3 });
});

test('debounce: trailing, leading, cancel, flush and pending', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { debounce } = await load('debounce-throttle');
  const calls = [];
  const fn = debounce((v) => calls.push(v), 100);
  fn(1); fn(2); t.mock.timers.tick(99); fn(3);
  assert.equal(fn.pending(), true);
  t.mock.timers.tick(99);
  assert.deepEqual(calls, []);
  t.mock.timers.tick(1);
  assert.deepEqual(calls, [3]);
  assert.equal(fn.pending(), false);
  fn(4); fn.cancel(); t.mock.timers.tick(200);
  assert.deepEqual(calls, [3]);
  fn(5); fn.flush();
  assert.deepEqual(calls, [3, 5]);
  t.mock.timers.tick(200);
  assert.deepEqual(calls, [3, 5]);
  const lead = [];
  const leading = debounce((v) => lead.push(v), 100, { leading: true, trailing: false });
  leading('a'); leading('b'); t.mock.timers.tick(100); leading('c');
  assert.deepEqual(lead, ['a', 'c']);
  const both = [];
  const leadTrail = debounce((v) => both.push(v), 50, { leading: true });
  leadTrail(1); t.mock.timers.tick(50);
  assert.deepEqual(both, [1]); // a single call is not repeated on the trailing edge
  leadTrail(2); leadTrail(3); t.mock.timers.tick(50);
  assert.deepEqual(both, [1, 2, 3]);
  assert.throws(() => debounce(() => {}, -1), RangeError);
});

test('throttle: leading call, trailing latest arguments, cancel', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { throttle } = await load('debounce-throttle');
  const calls = [];
  const fn = throttle((v) => calls.push(v), 100);
  fn(1); fn(2); fn(3);
  assert.deepEqual(calls, [1]);
  t.mock.timers.tick(100);
  assert.deepEqual(calls, [1, 3]);
  fn(4);
  assert.deepEqual(calls, [1, 3]); // still inside the window opened by the trailing call
  t.mock.timers.tick(100);
  assert.deepEqual(calls, [1, 3, 4]);
  t.mock.timers.tick(100);
  fn(5);
  assert.deepEqual(calls, [1, 3, 4, 5]);
  fn(6); fn.cancel(); t.mock.timers.tick(300);
  assert.deepEqual(calls, [1, 3, 4, 5]);
  const noTrail = [];
  const nt = throttle((v) => noTrail.push(v), 100, { trailing: false });
  nt('a'); nt('b'); t.mock.timers.tick(100); nt('c');
  assert.deepEqual(noTrail, ['a', 'c']);
  assert.throws(() => throttle(() => {}, 0), RangeError);
});

test('async pool bounds concurrency, keeps order, stops on failure and abort', async () => {
  const { mapPool, mapPoolSettled } = await load('async-pool');
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  let active = 0;
  let peak = 0;
  const results = await mapPool([30, 5, 20, 1, 10, 2], async (ms, i) => {
    active++; peak = Math.max(peak, active);
    await sleep(ms);
    active--;
    return i * 10;
  }, { concurrency: 2 });
  assert.deepEqual(results, [0, 10, 20, 30, 40, 50]);
  assert.equal(peak, 2);
  assert.deepEqual(await mapPool([], async () => 1, { concurrency: 3 }), []);
  const started = [];
  let sawAbort = false;
  await assert.rejects(mapPool([1, 2, 3, 4, 5, 6], async (n, _i, signal) => {
    started.push(n);
    if (n === 2) throw new Error('boom');
    await sleep(5);
    sawAbort ||= signal.aborted;
    return n;
  }, { concurrency: 2 }), /boom/);
  assert.ok(sawAbort);
  assert.ok(started.length < 6, `stopped early, started ${started}`);
  const controller = new AbortController();
  const pending = mapPool([1, 2, 3], async () => { await sleep(20); return 1; }, { concurrency: 1, signal: controller.signal });
  controller.abort(new Error('user cancelled'));
  await assert.rejects(pending, /user cancelled/);
  await assert.rejects(mapPool([1], async () => 1, { concurrency: 1, signal: AbortSignal.abort() }), { name: 'AbortError' });
  await assert.rejects(mapPool([1], async () => 1, { concurrency: 0 }), RangeError);
  const settled = await mapPoolSettled([1, 2, 3], async (n) => { if (n === 2) throw new Error('two'); return n; }, { concurrency: 2 });
  assert.deepEqual(settled.map((s) => s.status), ['fulfilled', 'rejected', 'fulfilled']);
  assert.equal(settled[1].reason.message, 'two');
});

test('LRU cache evicts least recently used, expires by TTL and de-duplicates loads', async () => {
  const { LruCache } = await load('lru-cache');
  let now = 0;
  const evicted = [];
  const cache = new LruCache({ maxEntries: 2, ttlMs: 1000, now: () => now, onEvict: (k, why) => evicted.push(`${k}:${why}`) });
  cache.set('a', 1).set('b', 2);
  assert.equal(cache.get('a'), 1); // a becomes most recent
  cache.set('c', 3);
  assert.equal(cache.has('b'), false);
  assert.deepEqual(evicted, ['b:capacity']);
  assert.equal(cache.peek('a'), 1);
  cache.set('d', 4); // order was a, c; peek did not refresh a, so a is evicted
  assert.equal(cache.has('a'), false);
  now = 999;
  assert.equal(cache.get('d'), 4);
  now = 1000;
  assert.equal(cache.get('d'), undefined);
  assert.ok(evicted.includes('d:expired'));
  cache.set('forever', 1, undefined);
  assert.equal(cache.delete('forever'), true);
  assert.equal(cache.delete('forever'), false);
  assert.throws(() => new LruCache({ maxEntries: 0 }), RangeError);
  let loads = 0;
  const load1 = () => new Promise((r) => setTimeout(() => { loads++; r('v'); }, 5));
  const [x, y] = await Promise.all([cache.getOrLoad('k', load1), cache.getOrLoad('k', load1)]);
  assert.equal(x, 'v'); assert.equal(y, 'v'); assert.equal(loads, 1);
  assert.equal(await cache.getOrLoad('k', load1), 'v');
  assert.equal(loads, 1);
  await assert.rejects(cache.getOrLoad('bad', async () => { throw new Error('nope'); }), /nope/);
  assert.equal(await cache.getOrLoad('bad', async () => 'ok'), 'ok');
  cache.clear();
  assert.equal(cache.size, 0);
});

test('semver compare follows SemVer 2.0.0 precedence', async () => {
  const s = await load('semver');
  const ordered = ['1.0.0-alpha', '1.0.0-alpha.1', '1.0.0-alpha.beta', '1.0.0-beta', '1.0.0-beta.2', '1.0.0-beta.11', '1.0.0-rc.1', '1.0.0', '1.0.1', '1.10.0', '2.0.0'];
  assert.deepEqual(s.sortSemVer([...ordered].reverse()), ordered);
  assert.equal(s.compareSemVer('1.0.0+build.1', '1.0.0+build.2'), 0);
  assert.deepEqual(s.parseSemVer('v1.2.3-rc.1+sha.abc'), { major: 1, minor: 2, patch: 3, prerelease: ['rc', 1], build: ['sha', 'abc'] });
  for (const bad of ['1.0', '01.0.0', '1.0.0-', '1.0.0-01', 'x.y.z', '1.0.0+']) assert.throws(() => s.parseSemVer(bad), RangeError, bad);
});

test('semver satisfies npm-style ranges including prerelease rules', async () => {
  const { satisfies, maxSatisfying } = await load('semver');
  const cases = [
    ['1.2.3', '^1.2.0', true], ['2.0.0', '^1.2.0', false], ['0.2.5', '^0.2.3', true], ['0.3.0', '^0.2.3', false],
    ['0.0.3', '^0.0.3', true], ['0.0.4', '^0.0.3', false], ['1.9.9', '^1.2', true], ['0.9.0', '^0.x', true],
    ['1.2.9', '~1.2.3', true], ['1.3.0', '~1.2.3', false], ['1.9.0', '~1', true], ['1.2.0', '~1.2', true],
    ['1.5.0', '1.x', true], ['2.0.0', '1.x', false], ['1.2.7', '1.2.*', true], ['3.0.0', '*', true], ['3.0.0', '', true],
    ['1.5.0', '>=1.2.3 <2.0.0', true], ['2.0.0', '>=1.2.3 <2.0.0', false], ['2.5.0', '<2.0.0 || >=2.5.0', true],
    ['2.3.4', '1.2.3 - 2.3.4', true], ['2.3.5', '1.2.3 - 2.3.4', false], ['2.3.9', '1.2 - 2.3', true], ['2.4.0', '1.2 - 2.3', false],
    ['1.3.0', '>1.2', true], ['1.2.9', '>1.2', false], ['1.2.9', '<=1.2', true], ['1.3.0', '<=1.2', false], ['1.1.9', '<1.2', true],
    ['1.2.3', '= 1.2.3', true], ['1.2.3', '>= 1.0.0', true], ['1.2.4', '1.2.3', false],
    ['1.3.0-beta', '^1.2.0', false], ['1.2.3-beta.2', '^1.2.3-beta.1', true], ['1.2.4-beta', '^1.2.3-beta.1', false],
    ['2.0.0-rc.1', '<2.0.0', false], ['2.0.0-rc.1', '^1.0.0', false],
  ];
  for (const [version, range, expected] of cases) assert.equal(satisfies(version, range), expected, `${version} ${range}`);
  assert.equal(satisfies('1.3.0-beta', '^1.2.0', { includePrerelease: true }), true);
  assert.throws(() => satisfies('1.0.0', '>=banana'), RangeError);
  assert.equal(maxSatisfying(['1.2.3', '1.4.0', '2.0.0', '1.5.0-beta'], '^1.2.0'), '1.4.0');
  assert.equal(maxSatisfying(['3.0.0'], '^1.0.0'), null);
});

test('safe filenames and traversal-proof joins', async () => {
  const f = await load('safe-filename');
  const traversal = f.sanitizeFilename('../../etc/passwd');
  assert.ok(!traversal.includes('/') && !traversal.startsWith('.'), traversal);
  assert.equal(f.sanitizeFilename('CON.txt'), '_CON.txt');
  assert.equal(f.sanitizeFilename('lpt1'), '_lpt1');
  assert.equal(f.sanitizeFilename('a<b>:c?.png'), 'a_b__c_.png');
  assert.equal(f.sanitizeFilename('report. '), 'report');
  assert.equal(f.sanitizeFilename('   '), 'file');
  assert.equal(f.sanitizeFilename('..'), 'file');
  assert.equal(f.sanitizeFilename('tab\there'), 'tab_here');
  assert.equal(f.sanitizeFilename('invoice' + ch(0x202e) + 'fdp.exe'), 'invoicefdp.exe');
  const long = f.sanitizeFilename('é'.repeat(300) + '.pdf');
  assert.ok(new TextEncoder().encode(long).length <= 255);
  assert.ok(long.endsWith('.pdf'));
  assert.equal(f.sanitizeFilename('e' + ch(0x301) + '.txt'), 'é.txt'); // NFC
  assert.throws(() => f.sanitizeFilename('x', { replacement: '/' }), RangeError);
  assert.equal(f.sanitizeFilename('a/b', { replacement: '' }), 'ab');
  assert.equal(f.safeRelativePath('a/b', '../c', './d'), 'a/c/d');
  for (const bad of [['../x'], ['a', '../../x'], ['/etc/passwd'], ['C:/x'], ['a\\..\\b'], ['a' + ch(0) + 'b'], ['.'], ['']]) {
    assert.throws(() => f.safeRelativePath(...bad), Error, JSON.stringify(bad));
  }
  assert.equal(f.safeJoin('/srv/uploads/', 'u1', 'f.txt'), '/srv/uploads/u1/f.txt');
  assert.throws(() => f.safeJoin('srv', 'x'), /absolute/);
});

test('CSV parsing follows RFC 4180 and fails closed', async () => {
  const { parseCsv, csvToObjects, CsvError } = await load('csv-parse');
  assert.deepEqual(parseCsv('a,b\n1,2\n'), [['a', 'b'], ['1', '2']]);
  assert.deepEqual(parseCsv('a,b\r\n1,2'), [['a', 'b'], ['1', '2']]);
  assert.deepEqual(parseCsv('a\rb'), [['a'], ['b']]);
  assert.deepEqual(parseCsv('"x, y","line1\nline2","say ""hi"""'), [['x, y', 'line1\nline2', 'say "hi"']]);
  assert.deepEqual(parseCsv(',,'), [['', '', '']]);
  assert.deepEqual(parseCsv('a,\n'), [['a', '']]);
  assert.deepEqual(parseCsv('""'), [['']]);
  assert.deepEqual(parseCsv(''), []);
  assert.deepEqual(parseCsv(ch(0xfeff) + 'id\n1'), [['id'], ['1']]);
  assert.deepEqual(parseCsv('a;b\n"1;2";3', { delimiter: ';' }), [['a', 'b'], ['1;2', '3']]);
  assert.throws(() => parseCsv('"open'), CsvError);
  assert.throws(() => parseCsv('ab"c'), /Quote inside unquoted/);
  assert.deepEqual(parseCsv('ab"c', { strict: false }), [['ab"c']]);
  assert.throws(() => parseCsv('"a"b'), /after closing quote/);
  assert.throws(() => parseCsv('1\n2\n3', { maxRows: 2 }), /Too many rows/);
  assert.throws(() => parseCsv('a', { delimiter: '"' }), RangeError);
  assert.deepEqual(csvToObjects(parseCsv(' name ,age\nAda,36\n')), [{ name: 'Ada', age: '36' }]);
  assert.throws(() => csvToObjects([['a', 'a'], ['1', '2']]), /duplicate/);
  assert.throws(() => csvToObjects([['__proto__'], ['1']]), /reserved/);
  assert.throws(() => csvToObjects([['a', 'b'], ['1']]), /Expected 2 fields/);
  assert.deepEqual(csvToObjects([['a', 'b'], ['1']], { allowRagged: true }), [{ a: '1', b: '' }]);
  assert.deepEqual(csvToObjects([]), []);
});

test('typed URL query state parses leniently and serializes canonically', async () => {
  const { q, parseQuery, serializeQuery, updateQuery } = await load('url-query-state');
  const schema = { q: q.string(), page: q.int(1, { min: 1, max: 500 }), sort: q.enumOf(['new', 'top'], 'new'), tags: q.list(), open: q.boolean() };
  assert.deepEqual(parseQuery(schema, '?page=3&sort=top&tags=a&tags=b&tags=a&open=1&extra=x'), { q: '', page: 3, sort: 'top', tags: ['a', 'b'], open: true });
  assert.deepEqual(parseQuery(schema, 'page=0&sort=bad&open=maybe&q='), { q: '', page: 1, sort: 'new', tags: [], open: false });
  assert.equal(parseQuery(schema, 'page=1e3').page, 1);
  assert.equal(parseQuery(schema, 'page=501').page, 1);
  assert.equal(parseQuery(schema, new URLSearchParams('q=hi')).q, 'hi');
  assert.equal(serializeQuery(schema, { page: 2, q: 'hi there', tags: ['x'], sort: 'new' }), 'page=2&q=hi+there&tags=x');
  assert.equal(serializeQuery(schema, parseQuery(schema, '')), '');
  const state = { q: 'a&b=c', page: 4, sort: 'top', tags: ['x y', 'z'], open: true };
  assert.deepEqual(parseQuery(schema, serializeQuery(schema, state)), state);
  assert.equal(updateQuery(schema, 'q=shoes&page=7', { page: 1, sort: 'top' }), 'q=shoes&sort=top');
});

test('JWT decoding is clearly unverified and rejects malformed tokens', async () => {
  const j = await load('jwt-decode-unverified');
  const seg = (obj) => btoa(String.fromCharCode(...new TextEncoder().encode(JSON.stringify(obj)))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const now = Date.UTC(2026, 0, 1);
  const token = `${seg({ alg: 'HS256', typ: 'JWT' })}.${seg({ sub: '42', name: 'José', exp: now / 1000 + 30 })}.sig`;
  const decoded = j.decodeJwtUnverified(token);
  assert.equal(decoded.verified, false);
  assert.equal(decoded.header.alg, 'HS256');
  assert.equal(decoded.payload.name, 'José');
  assert.equal(j.secondsUntilExpiry(decoded, now), 30);
  assert.equal(j.shouldRefresh(decoded, 60, now), true);
  assert.equal(j.shouldRefresh(decoded, 10, now), false);
  assert.equal(j.secondsUntilExpiry(j.decodeJwtUnverified(`${seg({ alg: 'none' })}.${seg({})}.`)), undefined);
  assert.throws(() => j.decodeJwtUnverified('a.b.c.d.e'), /JWE/);
  assert.throws(() => j.decodeJwtUnverified('only.two'), /compact JWT/);
  assert.throws(() => j.decodeJwtUnverified(`${seg({})}.${seg([1, 2])}.x`), /JSON object/);
  assert.throws(() => j.decodeJwtUnverified(`${seg({})}.***.x`), /Malformed/);
  assert.throws(() => j.decodeJwtUnverified(`${seg({})}.${btoa('nope')}.x`), /Malformed/);
  assert.throws(() => j.decodeJwtUnverified('x'.repeat(20000)), /too long/);
  assert.match(readFileSync(join(recipeDir, 'jwt-decode-unverified.ts'), 'utf8'), /NEVER USE FOR AUTHENTICATION OR AUTHORIZATION/);
});

test('password policy uses length and blocklists, not composition rules', async () => {
  const { checkPassword, PASSWORD_MESSAGES } = await load('password-policy');
  assert.deepEqual(checkPassword('correct horse battery staple'), { ok: true, issues: [], length: 28 });
  assert.equal(checkPassword('alllowercasewithoutanydigits').ok, true);
  assert.deepEqual(checkPassword('short').issues, ['too-short']);
  assert.ok(checkPassword('Password12345678', { blocklist: ['password12345678'] }).issues.includes('blocklisted'));
  assert.ok(checkPassword('aaaaaaaaaaaaaaaa').issues.includes('repetitive'));
  assert.ok(checkPassword('abcabcabcabcabcabc').issues.includes('repetitive'));
  assert.ok(checkPassword('abcdefghijklmnop').issues.includes('sequential'));
  assert.ok(checkPassword('9876543210987654').issues.length >= 0);
  assert.ok(checkPassword('alice-loves-the-river-2026', { contextWords: ['Alice', 'ab'] }).issues.includes('contains-context'));
  assert.equal(checkPassword('ab-loves-the-river-2026', { contextWords: ['ab'] }).ok, true);
  assert.equal(checkPassword(ch(0x1f600).repeat(7) + ch(0x1f680).repeat(8)).length, 15);
  assert.ok(checkPassword('x'.repeat(65) + 'y'.repeat(64)).issues.includes('too-long'));
  assert.equal(checkPassword('x'.repeat(60) + 'y'.repeat(4), { maxLength: 64 }).ok, true);
  assert.ok(checkPassword('long enough password' + ch(7)).issues.includes('control-characters'));
  assert.equal(checkPassword('twelve chars', { minLength: 8 }).ok, true);
  assert.throws(() => checkPassword('x', { minLength: 6 }), RangeError);
  assert.throws(() => checkPassword('x', { maxLength: 32 }), RangeError);
  for (const issue of ['too-short', 'too-long', 'blocklisted', 'repetitive', 'sequential', 'contains-context', 'control-characters']) assert.ok(PASSWORD_MESSAGES[issue]);
});

test('ICU-style messages pluralize with Intl.PluralRules', async () => {
  const { formatMessage, pluralForm } = await load('i18n-message');
  const files = '{n, plural, =0 {No files} one {# file} other {# files}}';
  assert.equal(formatMessage(files, { n: 0 }), 'No files');
  assert.equal(formatMessage(files, { n: 1 }), '1 file');
  assert.equal(formatMessage(files, { n: 1000 }), '1,000 files');
  assert.equal(formatMessage(files, { n: 1000 }, 'de'), '1.000 files');
  const pl = '{n, plural, one {# plik} few {# pliki} many {# plików} other {# pliku}}';
  assert.equal(formatMessage(pl, { n: 1 }, 'pl'), '1 plik');
  assert.equal(formatMessage(pl, { n: 3 }, 'pl'), '3 pliki');
  assert.equal(formatMessage(pl, { n: 5 }, 'pl'), '5 plików');
  assert.equal(formatMessage(pl, { n: 1.5 }, 'pl'), '1,5 pliku');
  assert.equal(formatMessage('{n, plural, zero {zero} other {other}}', { n: 0 }, 'ar'), 'zero');
  const ord = '{n, selectordinal, one {#st} two {#nd} few {#rd} other {#th}}';
  assert.deepEqual([1, 2, 3, 4, 11, 22, 103].map((n) => formatMessage(ord, { n })), ['1st', '2nd', '3rd', '4th', '11th', '22nd', '103rd']);
  const nested = '{who} {g, select, female {has {n, plural, one {# message} other {# messages}} for her} other {has # items}}';
  assert.equal(formatMessage(nested, { who: 'Ada', g: 'female', n: 2 }), 'Ada has 2 messages for her');
  assert.equal(formatMessage(nested, { who: 'Sam', g: 'x', n: 2 }), 'Sam has # items');
  assert.equal(formatMessage("Use '{'braces'}' and it''s fine"), "Use {braces} and it's fine");
  assert.equal(formatMessage('{v, number}', { v: 1234.5 }, 'de'), '1.234,5');
  assert.equal(formatMessage('Hi {name}', { name: null }), 'Hi ');
  assert.throws(() => formatMessage('Hi {name}', {}), /Missing message value/);
  assert.throws(() => formatMessage('{n, plural, one {x}}', { n: 1 }), /other/);
  assert.throws(() => formatMessage('{n, plural, other {x}', { n: 1 }), SyntaxError);
  assert.throws(() => formatMessage('oops }'), SyntaxError);
  assert.throws(() => formatMessage('{n, plural, other {x}}', { n: 'many' }), TypeError);
  assert.throws(() => formatMessage('{d, date}', { d: 1 }), SyntaxError);
  assert.equal(pluralForm(1, { one: 'item', other: 'items' }), 'item');
  assert.equal(pluralForm(2, { one: 'item', other: 'items' }), 'items');
});

test('WCAG contrast ratios and levels', async () => {
  const c = await load('color-contrast');
  assert.equal(c.contrastRatio('#000', '#fff'), 21);
  assert.equal(c.contrastRatio('#123456', '#123456'), 1);
  assert.equal(c.contrastRatio('#fff', '#000'), c.contrastRatio('#000', '#fff'));
  assert.equal(c.formatRatio(c.contrastRatio('#777777', '#ffffff')), '4.47:1');
  assert.equal(c.meetsContrast('#777777', '#ffffff'), false);
  assert.equal(c.meetsContrast('#777777', '#ffffff', 'AA', 'large-text'), true);
  assert.equal(c.meetsContrast('#767676', '#ffffff'), true);
  assert.equal(c.meetsContrast('#767676', '#ffffff', 'AAA'), false);
  assert.equal(c.wcagLevel(4.5), 'AA');
  assert.equal(c.wcagLevel(4.499), 'fail');
  assert.equal(c.wcagLevel(7), 'AAA');
  assert.equal(c.wcagLevel(4.5, 'large-text'), 'AAA');
  assert.equal(c.wcagLevel(3, 'non-text'), 'AA');
  assert.equal(c.wcagLevel(2.99, 'non-text'), 'fail');
  assert.deepEqual(c.parseHexColor('#abc'), { r: 170, g: 187, b: 204, a: 1 });
  assert.equal(c.parseHexColor('#00000080').a, 128 / 255);
  assert.throws(() => c.parseHexColor('#12'), RangeError);
  assert.throws(() => c.parseHexColor('red'), RangeError);
  assert.deepEqual(c.composite('#00000080', '#ffffff'), { r: 127, g: 127, b: 127, a: 1 });
  assert.ok(Math.abs(c.contrastRatio('#00000080', '#ffffff') - c.contrastRatio('#7f7f7f', '#ffffff')) < 1e-9);
  assert.throws(() => c.relativeLuminance('#0008'), RangeError);
  assert.equal(c.readableTextColor('#000000'), '#ffffff');
  assert.equal(c.readableTextColor('#ffff00'), '#000000');
  assert.equal(c.readableTextColor('#1e3a8a', ['#e5e7eb', '#111827']), '#e5e7eb');
  assert.throws(() => c.readableTextColor('#fff', []), RangeError);
});

test('markdown to plain text and word-safe excerpts', async () => {
  const { markdownToPlainText, excerpt, markdownExcerpt } = await load('markdown-excerpt');
  const md = [
    '---', 'title: Post', '---',
    '# Release *notes* #', '',
    'Read the [guide](https://x.test/g) and ![diagram](d.png) for **details** on `npm test`.',
    '', '> Quoted _text_ with snake_case_names', '',
    '- [x] done item', '1. numbered', '',
    '```js', 'console.log("hidden")', '```', '',
    '| a | b |', '| --- | --- |', '| 1 | 2 |', '',
    '<div class="x">html</div> 2 * 3 * 4 and \\*literal\\* AT&amp;T',
  ].join('\n');
  const text = markdownToPlainText(md);
  assert.equal(text, 'Release notes Read the guide and diagram for details on npm test. Quoted text with snake_case_names done item numbered a b 1 2 html 2 * 3 * 4 and *literal* AT&T');
  assert.match(markdownToPlainText(md, { keepCode: true }), /console\.log\("hidden"\)/);
  assert.equal(markdownToPlainText('# A\n\nPara one\nwraps\n\n\n\nB', { keepLineBreaks: true }), 'A\n\nPara one\nwraps\n\nB');
  assert.equal(markdownToPlainText('Title\n=====\nBody'), 'Title Body');
  assert.equal(markdownToPlainText('```\nunclosed fence'), '');
  assert.equal(excerpt('short text', 160), 'short text');
  const long = 'The quick brown fox jumps over the lazy dog again and again';
  const cut = excerpt(long, 30);
  assert.ok(cut.length <= 30 && cut.endsWith('...'), cut);
  assert.equal(cut, 'The quick brown fox jumps...');
  const emoji = excerpt(ch(0x1f600).repeat(50), 10);
  assert.equal(Array.from(emoji).length, 10);
  assert.ok(!emoji.includes(String.fromCharCode(0xd83d) + '.'));
  assert.equal(markdownExcerpt('## Hi **there**', 160), 'Hi there');
});

test('HTML escaping, auto-escaping template and URL allow-list', async () => {
  const { escapeHtml, html, trustedHtml, safeUrl, textToHtml, SafeHtml } = await load('html-escape');
  assert.equal(escapeHtml(`<img src=x onerror="a('b')">&` + '`'), '&lt;img src=x onerror=&quot;a(&#39;b&#39;)&quot;&gt;&amp;&#96;');
  assert.equal(escapeHtml(null), '');
  assert.equal(escapeHtml(42), '42');
  const name = '<b>Eve</b>';
  const items = ['a<', 'b>'];
  const view = html`<p title="${name}">${name}</p><ul>${items.map((i) => html`<li>${i}</li>`)}</ul>${null}${false}${undefined}${0}`;
  assert.ok(view instanceof SafeHtml);
  assert.equal(String(view), '<p title="&lt;b&gt;Eve&lt;/b&gt;">&lt;b&gt;Eve&lt;/b&gt;</p><ul><li>a&lt;</li><li>b&gt;</li></ul>0');
  assert.equal(String(html`${trustedHtml('<hr>')}`), '<hr>');
  assert.equal(String(html`${{ toString: () => '<x>' }}`), '&lt;x&gt;');
  assert.equal(safeUrl('javascript:alert(1)'), '#');
  assert.equal(safeUrl('  JaVaScRiPt:alert(1)'), '#');
  assert.equal(safeUrl('java\tscript:alert(1)'), '#');
  assert.equal(safeUrl('data:text/html,<script>'), '#');
  assert.equal(safeUrl('//evil.example/x'), '#');
  assert.equal(safeUrl('https://example.com/a?b=1'), 'https://example.com/a?b=1');
  assert.equal(safeUrl('mailto:a@b.test'), 'mailto:a@b.test');
  assert.equal(safeUrl('/path?x=1#y'), '/path?x=1#y');
  assert.equal(safeUrl('docs/page.html'), 'docs/page.html');
  assert.equal(safeUrl('#section'), '#section');
  assert.equal(safeUrl(''), '#');
  assert.equal(safeUrl('ftp://x.test', '/blocked'), '/blocked');
  assert.equal(String(textToHtml('a<b\nc')), 'a&lt;b<br>c');
});

test('typed emitter: subscribe, once, snapshot emit, errors and waitFor', async () => {
  const { TypedEmitter } = await load('typed-emitter');
  const bus = new TypedEmitter();
  const seen = [];
  const off = bus.on('saved', (e) => seen.push(e.id));
  bus.once('saved', (e) => seen.push(`once:${e.id}`));
  bus.emit('saved', { id: 'a' });
  bus.emit('saved', { id: 'b' });
  off();
  bus.emit('saved', { id: 'c' });
  assert.deepEqual(seen, ['a', 'once:a', 'b']);
  assert.equal(bus.listenerCount('saved'), 0);
  const order = [];
  const offA = bus.on('tick', () => { order.push('a'); offB(); bus.on('tick', () => order.push('late')); });
  const offB = bus.on('tick', () => order.push('b'));
  bus.emit('tick');
  assert.deepEqual(order, ['a', 'b']); // snapshot: removal and addition apply to the next emit
  offA();
  const ran = [];
  bus.on('err', () => { throw new Error('first'); });
  bus.on('err', () => ran.push('second'));
  assert.throws(() => bus.emit('err'), (e) => e instanceof AggregateError && e.errors[0].message === 'first');
  assert.deepEqual(ran, ['second']);
  const reported = [];
  const quiet = new TypedEmitter({ onListenerError: (e, ev) => reported.push(`${ev}:${e.message}`), maxListeners: 2 });
  quiet.on('x', () => { throw new Error('bad'); });
  quiet.emit('x');
  assert.deepEqual(reported, ['x:bad']);
  quiet.on('x', () => {});
  assert.throws(() => quiet.on('x', () => {}), /Too many listeners/);
  setTimeout(() => bus.emit('ready', 7), 1);
  assert.equal(await bus.waitFor('ready'), 7);
  const controller = new AbortController();
  const waiting = bus.waitFor('never', { signal: controller.signal });
  controller.abort(new Error('stop'));
  await assert.rejects(waiting, /stop/);
  assert.equal(bus.listenerCount('never'), 0);
  bus.removeAll();
  assert.equal(bus.listenerCount('tick'), 0);
});

test('Result helpers and safe error mapping', async () => {
  const r = await load('result');
  assert.deepEqual(r.map(r.ok(2), (x) => x * 2), r.ok(4));
  assert.deepEqual(r.map(r.err('e'), (x) => x * 2), r.err('e'));
  assert.deepEqual(r.mapErr(r.err('e'), (e) => e.toUpperCase()), r.err('E'));
  assert.deepEqual(r.andThen(r.ok(2), (x) => (x > 1 ? r.err('big') : r.ok(x))), r.err('big'));
  assert.equal(r.unwrapOr(r.err('x'), 5), 5);
  assert.deepEqual(r.all([r.ok(1), r.ok(2)]), r.ok([1, 2]));
  assert.deepEqual(r.all([r.ok(1), r.err('a'), r.err('b')]), r.err('a'));
  assert.throws(() => r.unwrap(r.err('plain')), (e) => e.cause === 'plain');
  assert.equal(r.unwrap(r.ok(3)), 3);
  assert.equal(r.toAppError(new DOMException('x', 'AbortError')).code, 'aborted');
  assert.equal(r.toAppError(new DOMException('x', 'TimeoutError')).code, 'timeout');
  assert.equal(r.toAppError(new TypeError('fetch failed')).code, 'network');
  assert.equal(r.toAppError({ status: 404 }).code, 'not_found');
  assert.equal(r.toAppError({ status: 429 }).retryable, true);
  const internal = r.toAppError(new Error('DB password=hunter2 at 10.0.0.1'));
  assert.equal(internal.code, 'internal');
  assert.equal(internal.status, 500);
  assert.doesNotMatch(internal.message, /hunter2/);
  assert.deepEqual(r.toPublicError(internal), { error: { code: 'internal', message: 'Something went wrong.', retryable: false } });
  const custom = r.appError('conflict', 'Already booked');
  assert.equal(r.toAppError(custom), custom);
  assert.deepEqual([400, 401, 403, 404, 409, 418, 429, 500, 502, 504].map(r.codeForStatus),
    ['bad_request', 'unauthenticated', 'forbidden', 'not_found', 'conflict', 'bad_request', 'rate_limited', 'internal', 'unavailable', 'timeout']);
  assert.deepEqual(await r.attempt(async () => 1), r.ok(1));
  const failed = await r.attempt(() => { throw Object.assign(new Error('x'), { status: 403 }); });
  assert.equal(failed.ok, false);
  assert.equal(failed.error.code, 'forbidden');
  assert.equal('cause' in r.appError('internal'), false);
});

test('feature flags bucket deterministically and roll out monotonically', async () => {
  const f = await load('feature-flag-rollout');
  assert.equal(f.fnv1a32(''), 0x811c9dc5);
  assert.equal(f.fnv1a32('a'), 0xe40c292c);
  assert.equal(f.fnv1a32('foobar'), 0xbf9cf968);
  assert.equal(f.fmix32(0), 0);
  assert.equal(f.fmix32(1), 0x514e28b7); // MurmurHash3 x86_32 of '' with seed 1
  const users = Array.from({ length: 10000 }, (_, i) => `user-${i}`);
  const flag = (percentage, extra = {}) => ({ key: 'new-checkout', enabled: true, percentage, ...extra });
  const at10 = users.filter((u) => f.isEnabled(flag(10), u));
  const at20 = new Set(users.filter((u) => f.isEnabled(flag(20), u)));
  assert.ok(at10.every((u) => at20.has(u)), 'raising the percentage keeps earlier subjects');
  assert.ok(Math.abs(at20.size - 2000) < 200, `~20%: ${at20.size}`);
  assert.equal(users.filter((u) => f.isEnabled(flag(0), u)).length, 0);
  assert.equal(users.filter((u) => f.isEnabled(flag(100), u)).length, users.length);
  assert.equal(f.isEnabled(flag(37.5), 'user-1'), f.isEnabled(flag(37.5), 'user-1'));
  const salted = users.filter((u) => f.isEnabled(flag(10, { salt: 'v2' }), u));
  assert.notDeepEqual(salted, at10);
  assert.deepEqual(f.evaluateFlag(flag(100, { enabled: false, allow: ['vip'] }), 'vip'), { on: false, reason: 'disabled' });
  assert.equal(f.evaluateFlag(flag(0, { allow: ['vip'] }), 'vip').reason, 'allowed');
  assert.equal(f.evaluateFlag(flag(100, { allow: ['x'], deny: ['x'] }), 'x').reason, 'denied');
  assert.throws(() => f.isEnabled(flag(101), 'u'), RangeError);
  assert.throws(() => f.bucketOf('k', ''), RangeError);
  const variants = [{ name: 'control', weight: 50 }, { name: 'treatment', weight: 50 }, { name: 'off', weight: 0 }];
  const counts = { control: 0, treatment: 0, off: 0 };
  for (const u of users) counts[f.chooseVariant('exp', u, variants)]++;
  assert.equal(counts.off, 0);
  assert.ok(Math.abs(counts.control - 5000) < 250, JSON.stringify(counts));
  assert.equal(f.chooseVariant('exp', 'user-9', variants), f.chooseVariant('exp', 'user-9', variants));
  assert.throws(() => f.chooseVariant('exp', 'u', [{ name: 'a', weight: 0 }]), RangeError);
  // Experiment independence: assignments in two experiments whose keys differ in a few characters must
  // not be correlated. Plain FNV-1a fails this (its low bit is the input's byte parity); fmix32 fixes it.
  const subjects = Array.from({ length: 10000 }, (_, i) => `u${i}`);
  const ab = [{ name: 'a', weight: 1 }, { name: 'b', weight: 1 }];
  for (const [k1, k2] of [['checkout-a', 'checkout-b'], ['exp1', 'exp2']]) {
    const buckets = chiSquare2x2(subjects, (u) => f.bucketOf(k1, u) % 2, (u) => f.bucketOf(k2, u) % 2);
    assert.ok(buckets < 10.83, `bucket parity ${k1}/${k2} chi-square ${buckets.toFixed(2)} (p <= 0.001)`);
    const arms = chiSquare2x2(subjects, (u) => f.chooseVariant(k1, u, ab) === 'a' ? 0 : 1, (u) => f.chooseVariant(k2, u, ab) === 'a' ? 0 : 1);
    assert.ok(arms < 10.83, `50/50 variants ${k1}/${k2} chi-square ${arms.toFixed(2)} (p <= 0.001)`);
  }
  const perBucket = new Array(100).fill(0);
  for (const u of subjects) perBucket[f.bucketOf('checkout-a', u) % 100]++;
  assert.ok(perBucket.every((n) => Math.abs(n - 100) <= 40), `uniform buckets: ${Math.min(...perBucket)}..${Math.max(...perBucket)}`);
  for (const [key, subject, bucket] of ROLLOUT_BUCKETS) assert.equal(f.bucketOf(key, subject), bucket, `${key}/${subject}`);
  assert.equal(f.bucketOf('checkout-a', 'u1', 'v2'), ROLLOUT_SALTED);
});

// Chi-square statistic of the 2x2 contingency table of two 0/1 assignments over the same subjects.
function chiSquare2x2(subjects, x, y) {
  const t = [[0, 0], [0, 0]];
  for (const s of subjects) t[x(s)][y(s)]++;
  const n = subjects.length;
  let chi = 0;
  for (const i of [0, 1]) for (const j of [0, 1]) {
    const expected = ((t[i][0] + t[i][1]) * (t[0][j] + t[1][j])) / n;
    chi += (t[i][j] - expected) ** 2 / expected;
  }
  return chi;
}
// bucketOf vectors (FNV-1a + fmix32, empty salt), shared with no other language.
const ROLLOUT_BUCKETS = [['new-checkout', 'user-1', 1510], ['new-checkout', 'user-2', 2752], ['checkout-a', 'u0', 9138], ['checkout-b', 'u0', 4891], ['exp1', 'u7', 5871], ['exp2', 'u7', 4336], ['banner', 'ünïcode', 1410]];
const ROLLOUT_SALTED = 5707;

test('idempotency store runs once, replays, and reports conflicts', async () => {
  const { MemoryIdempotencyStore, withIdempotency, IdempotencyConflict } = await load('idempotency-store');
  let now = 0;
  const store = new MemoryIdempotencyStore({ ttlMs: 1000, now: () => now });
  let runs = 0;
  const handler = async () => { runs++; return { orderId: `o${runs}` }; };
  const first = await withIdempotency(store, 'key-0001', 'fp-a', handler);
  const second = await withIdempotency(store, 'key-0001', 'fp-a', handler);
  assert.deepEqual(first, { response: { orderId: 'o1' }, replayed: false });
  assert.deepEqual(second, { response: { orderId: 'o1' }, replayed: true });
  assert.equal(runs, 1);
  await assert.rejects(withIdempotency(store, 'key-0001', 'fp-b', handler), (e) => e instanceof IdempotencyConflict && e.reason === 'mismatch');
  let release;
  const slow = withIdempotency(store, 'key-0002', 'fp', () => new Promise((r) => { release = r; }));
  await assert.rejects(withIdempotency(store, 'key-0002', 'fp', handler), (e) => e.reason === 'in-progress');
  release('done');
  assert.deepEqual(await slow, { response: 'done', replayed: false });
  await assert.rejects(withIdempotency(store, 'key-0003', 'fp', async () => { throw new Error('validation'); }), /validation/);
  assert.equal((await withIdempotency(store, 'key-0003', 'fp', handler)).replayed, false); // released, so it ran
  await assert.rejects(withIdempotency(store, 'key-0004', 'fp', async () => { throw new Error('timeout after charge?'); }, { releaseOnError: () => false }));
  await assert.rejects(withIdempotency(store, 'key-0004', 'fp', handler), (e) => e.reason === 'in-progress');
  now = 5000; // past the TTL
  assert.equal((await withIdempotency(store, 'key-0001', 'fp-b', handler)).replayed, false);
  await assert.rejects(store.begin('short', 'fp'), RangeError);
  await assert.rejects(store.complete('unknown-key', 'token', 1), /Unknown/);
});

test('an expired idempotency claim cannot be completed or released by its former owner', async () => {
  const { MemoryIdempotencyStore, IdempotencyClaimLost } = await load('idempotency-store');
  let now = 0;
  const store = new MemoryIdempotencyStore({ ttlMs: 1000, now: () => now });
  const first = await store.begin('key-claim', 'fp');
  now = 2000; // the first owner stalls past the TTL; a retry takes the key
  const second = await store.begin('key-claim', 'fp');
  assert.equal(second.state, 'started');
  assert.notEqual(first.token, second.token);
  await assert.rejects(store.complete('key-claim', first.token, 'late'), (e) => e instanceof IdempotencyClaimLost);
  await store.release('key-claim', first.token); // ignored: not the owner
  assert.equal((await store.begin('key-claim', 'fp')).state, 'in-progress');
  await store.complete('key-claim', second.token, 'fresh');
  assert.deepEqual(await store.begin('key-claim', 'fp'), { state: 'completed', response: 'fresh' });
  await assert.rejects(store.complete('key-claim', second.token, 'again'), (e) => e instanceof IdempotencyClaimLost);
});

test('outbox commits state and messages atomically and relays at least once', async () => {
  const { InMemoryOutbox } = await load('outbox');
  let now = 0;
  let id = 0;
  const outbox = new InMemoryOutbox({ orders: [] }, { now: () => now, newId: () => `m${++id}` });
  outbox.transaction((draft, enqueue) => { draft.orders.push('o1'); enqueue('order.created', { id: 'o1' }); enqueue('email.queued', { to: 'a' }); });
  assert.deepEqual(outbox.state, { orders: ['o1'] });
  assert.throws(() => outbox.transaction((draft, enqueue) => { draft.orders.push('o2'); enqueue('order.created', { id: 'o2' }); throw new Error('rollback'); }), /rollback/);
  assert.deepEqual(outbox.state, { orders: ['o1'] });
  assert.equal(outbox.messages().length, 2);
  assert.throws(() => outbox.transaction(async () => {}), TypeError);
  const snapshot = outbox.state;
  snapshot.orders.push('mutated');
  assert.deepEqual(outbox.state, { orders: ['o1'] });
  const published = [];
  let failEmail = true;
  const publish = async (m) => { if (m.topic === 'email.queued' && failEmail) throw new Error('smtp down'); published.push(m.id); };
  assert.deepEqual(await outbox.relay(publish, { baseDelayMs: 100, maxAttempts: 3 }), { sent: 1, failed: 1, dead: 0 });
  const email = outbox.messages().find((m) => m.id === 'm2');
  assert.equal(email.status, 'pending');
  assert.equal(email.nextAttemptAt, 100);
  assert.equal(email.lastError, 'smtp down');
  assert.deepEqual(await outbox.relay(publish), { sent: 0, failed: 0, dead: 0 }); // not due yet
  now = 100;
  assert.deepEqual(await outbox.relay(publish, { baseDelayMs: 100, maxAttempts: 3 }), { sent: 0, failed: 1, dead: 0 });
  now = 1000;
  assert.deepEqual(await outbox.relay(publish, { baseDelayMs: 100, maxAttempts: 3 }), { sent: 0, failed: 0, dead: 1 });
  assert.equal(outbox.messages().find((m) => m.id === 'm2').status, 'dead');
  failEmail = false;
  outbox.revive('m2');
  assert.deepEqual(await outbox.relay(publish), { sent: 1, failed: 0, dead: 0 });
  assert.deepEqual(published, ['m1', 'm2']);
  assert.throws(() => outbox.revive('m2'), /No dead message/);
  now = 10_000;
  assert.equal(outbox.prune(5000), 2);
  assert.equal(outbox.messages().length, 0);
  // Only one relay pass at a time.
  outbox.transaction((_d, enqueue) => { enqueue('t', 1); });
  let unblock;
  const blocking = outbox.relay(() => new Promise((r) => { unblock = r; }));
  assert.deepEqual(await outbox.relay(publish), { sent: 0, failed: 0, dead: 0 });
  unblock();
  assert.equal((await blocking).sent, 1);
});

test('outbox copies are deep: publisher and reader mutations never change a retry', async () => {
  const { InMemoryOutbox } = await load('outbox');
  const outbox = new InMemoryOutbox({}, { now: () => 0, newId: () => 'm1' });
  outbox.transaction((_d, enqueue) => { enqueue('order.created', { order: { id: 'o1', lines: [1] } }); });
  outbox.messages()[0].payload.order.id = 'changed-by-reader';
  const seen = [];
  let fail = true;
  const publish = async (m) => {
    seen.push(structuredClone(m.payload));
    m.payload.order.lines.push(99); // a misbehaving publisher
    if (fail) throw new Error('broker down');
  };
  await outbox.relay(publish, { baseDelayMs: 0 });
  fail = false;
  await outbox.relay(publish, { baseDelayMs: 0 });
  assert.deepEqual(seen, [{ order: { id: 'o1', lines: [1] } }, { order: { id: 'o1', lines: [1] } }]);
});

test('typed state machine validates transitions and guards', async () => {
  const { defineMachine, createActor, TransitionError } = await load('state-machine');
  const machine = defineMachine({ initial: 'draft', states: {
    draft: { on: { SUBMIT: 'pending' } },
    pending: { on: { APPROVE: 'approved', REJECT: 'draft' } },
    approved: { final: true },
  } });
  assert.equal(machine.next('draft', 'SUBMIT'), 'pending');
  assert.equal(machine.next('draft', 'APPROVE'), undefined);
  assert.equal(machine.next('draft', 'toString'), undefined); // inherited keys are not events
  assert.deepEqual(machine.events('pending'), ['APPROVE', 'REJECT']);
  assert.equal(machine.isFinal('approved'), true);
  assert.equal(machine.can('approved', 'SUBMIT'), false);
  assert.throws(() => defineMachine({ initial: 'a', states: { a: { on: { GO: 'missing' } } } }), /unknown state/);
  assert.throws(() => defineMachine({ initial: 'zzz', states: { a: {} } }), /initial/);
  assert.throws(() => defineMachine({ initial: 'a', states: { a: { final: true, on: { X: 'a' } } } }), /Final state/);
  const actor = createActor(machine);
  const log = [];
  const unsubscribe = actor.subscribe((state, event, previous) => log.push(`${previous}-${event}->${state}`));
  actor.send('SUBMIT');
  actor.send('REJECT');
  unsubscribe();
  actor.send('SUBMIT');
  assert.equal(actor.state, 'pending');
  assert.deepEqual(log, ['draft-SUBMIT->pending', 'pending-REJECT->draft']);
  assert.throws(() => actor.send('SUBMIT'), TransitionError);
  const guarded = createActor(machine, { initial: 'pending', context: { role: 'viewer' }, guard: (_s, e, ctx) => e !== 'APPROVE' || ctx.role === 'admin' });
  assert.throws(() => guarded.send('APPROVE'), /not allowed/);
  assert.equal(guarded.state, 'pending');
  assert.equal(guarded.send('REJECT'), 'draft');
});

test('line diff is minimal, reversible and renders unified hunks', async () => {
  const { diffLines, unifiedDiff, splitLines } = await load('text-diff');
  assert.deepEqual(splitLines('a\r\nb\n'), ['a', 'b']);
  assert.deepEqual(splitLines(''), []);
  assert.deepEqual(splitLines('\n'), ['']);
  assert.deepEqual(diffLines('', ''), []);
  assert.equal(unifiedDiff(diffLines('a\nb', 'a\nb')), '');
  assert.deepEqual(diffLines('', 'x\ny').map((o) => o.type), ['insert', 'insert']);
  assert.deepEqual(diffLines('x\ny', '').map((o) => o.type), ['delete', 'delete']);
  const classic = diffLines('ABCABBA'.split(''), 'CBABAC'.split(''));
  assert.equal(classic.filter((o) => o.type !== 'equal').length, 5);
  assert.equal(unifiedDiff(diffLines('a\nb\nc\n', 'a\nx\nc\n'), { fromFile: 'old.txt', toFile: 'new.txt' }),
    '--- old.txt\n+++ new.txt\n@@ -1,3 +1,3 @@\n a\n-b\n+x\n c\n');
  const big = Array.from({ length: 20 }, (_, i) => `line ${i}`);
  const changed = big.map((l, i) => (i === 2 || i === 17 ? `${l}!` : l));
  const hunks = unifiedDiff(diffLines(big, changed), { context: 2 });
  assert.equal(hunks.match(/^@@/gm).length, 2);
  assert.match(hunks, /@@ -1,5 \+1,5 @@/);
  assert.match(hunks, /@@ -16,5 \+16,5 @@/);
  assert.match(unifiedDiff(diffLines('', 'new')), /@@ -0,0 \+1,1 @@\n\+new/);
  assert.throws(() => diffLines(big, big.map((l) => `${l}?`), { maxEdits: 5 }), /maxEdits/);
  // Property check against an LCS dynamic program on random inputs.
  let seed = 7;
  const rand = (n) => { seed = (seed * 1103515245 + 12345) % 2 ** 31; return seed % n; };
  for (let round = 0; round < 60; round++) {
    const a = Array.from({ length: rand(12) }, () => 'abc'[rand(3)]);
    const b = Array.from({ length: rand(12) }, () => 'abc'[rand(3)]);
    const ops = diffLines(a, b);
    assert.deepEqual(ops.filter((o) => o.type !== 'insert').map((o) => o.line), a);
    assert.deepEqual(ops.filter((o) => o.type !== 'delete').map((o) => o.line), b);
    const dp = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
    for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] + 1 : Math.max(dp[i - 1][j], dp[i][j - 1]);
    assert.equal(ops.filter((o) => o.type !== 'equal').length, a.length + b.length - 2 * dp[a.length][b.length]);
  }
});

test('token budget estimates, truncates and trims history', async () => {
  const t = await load('token-budget');
  assert.equal(t.estimateTokens(''), 0);
  assert.equal(t.estimateTokens('abcd'), 1);
  assert.equal(t.estimateTokens('abcde'), 2);
  const msg = (role, n, extra = {}) => ({ role, content: role[0].repeat(n), ...extra });
  const history = [msg('system', 40), msg('user', 40), msg('assistant', 40), msg('user', 40)];
  const trimmed = t.trimToBudget(history, 45);
  assert.deepEqual(trimmed.messages, [history[0], history[2], history[3]]);
  assert.equal(trimmed.dropped, 1);
  assert.equal(trimmed.estimatedTokens, 42);
  assert.equal(trimmed.truncatedLatest, false);
  assert.equal(t.trimToBudget(history, 100).dropped, 0);
  assert.equal(t.trimToBudget(history, 100, { reserveForOutput: 60 }).messages.length, 2);
  const grouped = [msg('system', 4), msg('user', 40), msg('assistant', 40, { group: 'call1' }), msg('tool', 40, { group: 'call1' }), msg('user', 40)];
  const g = t.trimToBudget(grouped, 40);
  assert.deepEqual(g.messages.map((m) => m.role), ['system', 'user']); // tool call and result dropped together
  assert.equal(t.trimToBudget(grouped, 60).messages.length, 4);
  const huge = [msg('system', 8), { role: 'user', content: 'start ' + 'x'.repeat(4000) + ' end' }];
  const h = t.trimToBudget(huge, 100);
  assert.equal(h.truncatedLatest, true);
  assert.ok(h.estimatedTokens <= 100, String(h.estimatedTokens));
  assert.ok(h.messages[1].content.endsWith(' end'));
  assert.throws(() => t.trimToBudget([msg('system', 400)], 50), /System messages/);
  assert.throws(() => t.trimToBudget(history, 10, { reserveForOutput: 10 }), RangeError);
  const emoji = ch(0x1f600).repeat(100);
  const kept = t.truncateToTokens(emoji, 10, { marker: '|' });
  assert.ok(kept.endsWith('|'));
  assert.ok(Array.from(kept.slice(0, -1)).every((c) => c === ch(0x1f600)), 'no split surrogate pairs');
  assert.equal(t.truncateToTokens('short', 10), 'short');
  assert.ok(t.truncateToTokens('a'.repeat(100) + 'END', 5, { keep: 'end', marker: '|' }).endsWith('END'));
  assert.equal(t.trimToBudget(history, 45, { estimate: () => 1, perMessageOverhead: 0 }).dropped, 0);
});
