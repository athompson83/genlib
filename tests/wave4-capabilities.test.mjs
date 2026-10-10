// SPDX-License-Identifier: Apache-2.0
// Vector tests for the wave 4 TypeScript recipes: ids (UUIDv7/ULID), retry-backoff, token-bucket,
// semver ranges, cron-next, WCAG contrast, geo and webhook signatures. Compiled with the same
// generated-tsconfig approach and strict flags as tests/marketing-capabilities.test.mjs.
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const recipeDir = join(root, 'examples/recipes');
const names = ['ids', 'retry-backoff', 'token-bucket', 'semver', 'cron-next', 'color-contrast', 'geo', 'webhook-signature'];
const out = mkdtempSync(join(tmpdir(), 'genlib-wave4-'));
after(() => rmSync(out, { recursive: true, force: true }));
const compilerOptions = {
  strict: true, noUncheckedIndexedAccess: true, exactOptionalPropertyTypes: true, noImplicitReturns: true,
  noFallthroughCasesInSwitch: true, noUnusedLocals: true, noUnusedParameters: true, skipLibCheck: true,
  target: 'ES2022', module: 'NodeNext', moduleResolution: 'NodeNext', lib: ['ES2022', 'DOM', 'DOM.Iterable'],
  rootDir: recipeDir, outDir: out,
};
const project = join(out, 'tsconfig.wave4.json');
writeFileSync(project, JSON.stringify({ compilerOptions, files: names.map((n) => join(recipeDir, `${n}.ts`)) }));
execFileSync(process.execPath, [join(root, 'node_modules/typescript/bin/tsc'), '-p', project], { stdio: 'pipe' });
writeFileSync(join(out, 'package.json'), '{"type":"module"}');
const load = (name) => import(pathToFileURL(join(out, `${name}.js`)).href);
const findTop = (...words) => JSON.parse(execFileSync(process.execPath, ['tools/agent-recipes.mjs', 'find', ...words], { cwd: root, encoding: 'utf8' })).matches[0]?.id;
const bytes = (...values) => Uint8Array.from(values);
const seq = Uint8Array.from({ length: 10 }, (_, i) => i + 1);

test('wave 4 recipes are registered and routed', () => {
  const entries = JSON.parse(readFileSync(join(root, 'resources/agent-recipes.json'), 'utf8')).entries;
  for (const n of names) assert.ok(entries.some((e) => e.path === `examples/recipes/${n}.ts`), n);
  assert.equal(findTop('uuidv7'), 'ids-uuidv7-ulid');
  assert.equal(findTop('ulid'), 'ids-uuidv7-ulid');
  assert.equal(findTop('exponential', 'backoff'), 'retry-backoff');
  assert.equal(findTop('retry-after'), 'retry-backoff');
  assert.equal(findTop('token', 'bucket'), 'token-bucket');
  assert.equal(findTop('rate', 'limiter'), 'token-bucket');
  assert.equal(findTop('semver', 'range'), 'semver-compare-and-range');
  assert.equal(findTop('cron', 'next', 'run'), 'cron-next-run');
  assert.equal(findTop('contrast', 'wcag'), 'color-contrast-wcag');
  assert.equal(findTop('geohash'), 'geo-distance-geohash');
  assert.equal(findTop('haversine', 'distance'), 'geo-distance-geohash');
  assert.equal(findTop('webhook', 'signature'), 'webhook-signature');
});

test('ids: UUIDv7 and ULID vectors, round trips and validation', async () => {
  const { uuidV7, ulid, uuidV7Time, ulidTime, newUuidV7, newUlid } = await load('ids');
  assert.equal(uuidV7(1790000000123, seq), '01a0c450-6c7b-7102-8304-05060708090a');
  assert.equal(ulid(1790000000123, seq), '01M3250V3V041061050R3GG28A');
  assert.equal(uuidV7(0, new Uint8Array(10)), '00000000-0000-7000-8000-000000000000');
  assert.equal(ulid(2 ** 48 - 1, new Uint8Array(10).fill(0xff)), '7ZZZZZZZZZZZZZZZZZZZZZZZZZ');
  assert.equal(uuidV7Time('01a0c450-6c7b-7102-8304-05060708090a'), 1790000000123);
  assert.equal(uuidV7Time('01A0C450-6C7B-7102-8304-05060708090A'), 1790000000123);
  assert.equal(uuidV7Time('00000000-0000-7000-8000-000000000000'), 0);
  assert.equal(ulidTime('01M3250V3V041061050R3GG28A'), 1790000000123);
  assert.equal(ulidTime('01m3250v3v041061050r3gg28a'), 1790000000123);
  assert.equal(ulidTime('7ZZZZZZZZZZZZZZZZZZZZZZZZZ'), 2 ** 48 - 1);
  assert.throws(() => uuidV7Time('01a0c450-6c7b-4102-8304-05060708090a'), /version 7/);
  assert.throws(() => uuidV7Time('01a0c450-6c7b-7102-c304-05060708090a'), /variant/);
  assert.throws(() => uuidV7Time('01a0c4506c7b71028304-05060708090a'), RangeError);
  assert.throws(() => uuidV7Time('01a0c450-6c7b-7102-8304-05060708090g'), RangeError);
  assert.throws(() => ulidTime('01M3250V3V041061050R3GG28'), /26/);
  assert.throws(() => ulidTime('01M3250V3V041061050R3GG28U'), /invalid ULID character/);
  assert.throws(() => ulidTime('8ZZZZZZZZZZZZZZZZZZZZZZZZZ'), /overflows/);
  assert.throws(() => uuidV7(-1, seq), RangeError);
  assert.throws(() => uuidV7(2 ** 48, seq), RangeError);
  assert.throws(() => ulid(1.5, seq), RangeError);
  assert.throws(() => ulid(0, new Uint8Array(9)), /10 bytes/);
  const a = newUuidV7();
  const b = newUuidV7();
  assert.match(a, /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.notEqual(a, b);
  const u = newUlid();
  assert.match(u, /^[0-7][0-9A-HJKMNP-TV-Z]{25}$/);
  assert.notEqual(u, newUlid());
  assert.ok(Math.abs(ulidTime(u) - Date.now()) < 60_000);
});

test('retry-backoff: full jitter vectors, overflow safety and Retry-After', async () => {
  const { backoffDelay, randomBackoffDelay, retryAfterMs } = await load('retry-backoff');
  assert.equal(backoffDelay(0, 100, 10000, 0.5), 50);
  assert.equal(backoffDelay(3, 100, 10000, 0.999), 799);
  assert.equal(backoffDelay(10, 100, 10000, 0.25), 2500);
  assert.equal(backoffDelay(3, 100, 10000, 0.0), 0);
  assert.equal(backoffDelay(5000, 100, 10000, 0.5), 5000);
  assert.equal(backoffDelay(Number.MAX_SAFE_INTEGER, 100, 10000, 0.5), 5000);
  for (const bad of [[-1, 100, 1000, 0], [1.5, 100, 1000, 0], [0, 0, 1000, 0], [0, 100, 99, 0], [0, 100, 1000, 1], [0, 100, 1000, -0.1], [0, 100, 1000, NaN]]) {
    assert.throws(() => backoffDelay(...bad), RangeError, JSON.stringify(bad));
  }
  const r = randomBackoffDelay(4, 100, 10000);
  assert.ok(Number.isInteger(r) && r >= 0 && r < 1600);
  assert.equal(retryAfterMs('120', 0), 120000);
  assert.equal(retryAfterMs('Wed, 21 Oct 2026 07:28:00 GMT', 1792567650000), 30000);
  assert.equal(retryAfterMs('Wed, 21 Oct 2015 07:28:00 GMT', 1792567650000), 0);
  assert.equal(retryAfterMs('0', 5), 0);
  for (const bad of ['', '-5', '1.5', 'soon', 'Thu, 21 Oct 2026 07:28:00 GMT', 'Wed, 32 Oct 2026 07:28:00 GMT', 'Wed, 21 Oct 2026 07:28:00 UTC', '9'.repeat(30)]) {
    assert.equal(retryAfterMs(bad, 0), null, bad);
  }
  assert.throws(() => retryAfterMs('1', NaN), RangeError);
});

test('token-bucket: vector sequence with injected clock', async () => {
  const { newBucket, take } = await load('token-bucket');
  const vectors = [[0, 1, true, 4000, 0], [0, 1, true, 3000, 0], [0, 1, true, 2000, 0], [0, 1, true, 1000, 0], [0, 1, true, 0, 0],
    [0, 1, false, 0, 500], [250, 1, false, 500, 250], [500, 1, true, 0, 0], [500, 2, false, 0, 1000], [3000, 5, true, 0, 0]]
    .map(([now, cost, allowed, tokensMilli, retryAfterMs]) => ({ now, cost, allowed, tokensMilli, retryAfterMs }));
  let state = newBucket(5, 0);
  assert.deepEqual(state, { tokensMilli: 5000, lastMs: 0 });
  for (const [i, step] of vectors.entries()) {
    const result = take(state, step.now, step.cost, 5, 2);
    assert.equal(result.allowed, step.allowed, `step ${i}`);
    assert.equal(result.state.tokensMilli, step.tokensMilli, `step ${i}`);
    assert.equal(result.retryAfterMs, step.retryAfterMs, `step ${i}`);
    state = result.state;
  }
  const back = take({ tokensMilli: 1000, lastMs: 10_000 }, 5_000, 1, 5, 2);
  assert.deepEqual(back, { allowed: true, state: { tokensMilli: 0, lastMs: 10_000 }, retryAfterMs: 0 });
  assert.equal(take({ tokensMilli: 0, lastMs: 0 }, Number.MAX_SAFE_INTEGER, 1, 5, 1000).state.tokensMilli, 4000);
  assert.throws(() => take(state, 3000, 6, 5, 2), /exceeds capacity/);
  assert.throws(() => take(state, 3000, 0, 5, 2), RangeError);
  assert.throws(() => take(state, 3000, 1, 5, 0), RangeError);
  assert.throws(() => take({ tokensMilli: 6000, lastMs: 0 }, 1, 1, 5, 2), /out of range/);
  assert.throws(() => newBucket(0, 0), RangeError);
  assert.throws(() => newBucket(1, 0.5), RangeError);
});

test('semver: sort vector and npm-style satisfies vectors', async () => {
  const { sortSemVer, compareSemVer, satisfies, parseSemVer } = await load('semver');
  const sorted = ['0.9.9', '1.0.0-alpha', '1.0.0-alpha.1', '1.0.0-alpha.beta', '1.0.0-beta', '1.0.0-beta.2',
    '1.0.0-beta.11', '1.0.0-rc.1', '1.0.0', '1.0.0+build.5', '2.0.0'];
  const shuffled = ['2.0.0', '1.0.0-rc.1', '1.0.0', '1.0.0-beta.11', '1.0.0-alpha', '1.0.0+build.5', '0.9.9',
    '1.0.0-beta.2', '1.0.0-alpha.beta', '1.0.0-beta', '1.0.0-alpha.1'];
  assert.deepEqual(sortSemVer(shuffled), sorted);
  assert.equal(compareSemVer('1.0.0', '1.0.0+build.5'), 0);
  const cases = [
    ['1.2.3', '^1.0.0', true], ['2.0.0', '^1.0.0', false], ['0.2.5', '^0.2.3', true], ['0.3.0', '^0.2.3', false],
    ['0.0.4', '^0.0.3', false], ['1.2.9', '~1.2.3', true], ['1.3.0', '~1.2.3', false], ['1.5.0', '1.x', true],
    ['1.5.0', '>=1.2.0 <1.5.0', false], ['1.4.9', '>=1.2.0 <1.5.0', true], ['3.1.0', '^1.0.0 || ^3.0.0', true],
    ['1.2.3-beta.2', '^1.2.3-beta.1', true], ['1.2.4-beta.1', '^1.2.3-beta.1', false], ['1.3.0-rc.1', '^1.2.0', false],
    ['1.2.0', '1.0.0 - 1.2.0', true], ['1.2.1', '1.0.0 - 1.2.0', false], ['0.0.1', '*', true], ['2.0.0', '<=1.x', false],
  ];
  for (const [version, range, expected] of cases) assert.equal(satisfies(version, range), expected, `${version} ${range}`);
  for (const bad of ['01.0.0', '1.0', '1.0.0-', '1.0.0-01', '1.0.0+']) assert.throws(() => parseSemVer(bad), RangeError, bad);
});

test('cron-next: vectors including Vixie day rule and leap day', async () => {
  const { nextRun } = await load('cron-next');
  const cases = [
    ['*/15 * * * *', '2026-10-10T12:07:30Z', '2026-10-10T12:15:00Z'],
    ['0 9 * * 1-5', '2026-10-10T12:00:00Z', '2026-10-12T09:00:00Z'],
    ['30 2 1 * *', '2026-10-10T00:00:00Z', '2026-11-01T02:30:00Z'],
    ['0 0 29 2 *', '2026-03-01T00:00:00Z', '2028-02-29T00:00:00Z'],
    ['0 12 13 * 5', '2026-10-10T00:00:00Z', '2026-10-13T12:00:00Z'],
    ['59 23 31 12 *', '2026-12-31T23:59:00Z', '2027-12-31T23:59:00Z'],
    ['0 0 * * 0', '2026-10-10T00:00:00Z', '2026-10-11T00:00:00Z'],
    ['5,10 8-9 * * *', '2026-10-10T09:10:00Z', '2026-10-11T08:05:00Z'],
  ];
  for (const [expr, afterIso, expected] of cases) assert.equal(nextRun(expr, afterIso), expected, expr);
  assert.equal(nextRun('0 0 * * 7', '2026-10-10T00:00:00Z'), '2026-10-11T00:00:00Z');
  assert.equal(nextRun('10/20 * * * *', '2026-10-10T00:00:00Z'), '2026-10-10T00:10:00Z');
  for (const bad of ['* * * *', '60 * * * *', '* 24 * * *', '* * 0 * *', '* * * 13 *', '* * * * 8', '5-1 * * * *',
    '*/0 * * * *', 'MON * * * *', '? * * * *', '1-2-3 * * * *', '1/2/3 * * * *', '* * L * *']) {
    assert.throws(() => nextRun(bad, '2026-10-10T00:00:00Z'), RangeError, bad);
  }
  assert.throws(() => nextRun('0 0 30 2 *', '2026-10-10T00:00:00Z'), /within 5 years/);
  assert.throws(() => nextRun('* * * * *', '2026-02-30T00:00:00Z'), /invalid date/);
  assert.throws(() => nextRun('* * * * *', '2026-10-10 00:00'), RangeError);
});

test('wcag-contrast: ratio vectors and AA/AAA thresholds', async () => {
  const { contrastRatio, contrastRatio2, passes, relativeLuminance } = await load('color-contrast');
  assert.equal(contrastRatio2('#000', '#fff'), 21.0);
  assert.equal(contrastRatio2('#767676', '#ffffff'), 4.54);
  assert.equal(contrastRatio2('#1a73e8', '#ffffff'), 4.51);
  assert.equal(contrastRatio2('#abc', '#aabbcc'), 1.0);
  assert.equal(contrastRatio2('#ffff00', '#ffffff'), 1.07);
  assert.equal(contrastRatio2('#FFFFFF', '#767676'), 4.54);
  assert.equal(relativeLuminance('#fff'), 1);
  assert.equal(relativeLuminance('#000000'), 0);
  assert.equal(passes(contrastRatio('#767676', '#ffffff'), 'AA'), true);
  assert.equal(passes(contrastRatio('#767676', '#ffffff'), 'AAA'), false);
  assert.equal(passes(contrastRatio('#ffff00', '#ffffff'), 'AA', true), false);
  assert.equal(passes(contrastRatio('#000', '#fff'), 'AAA'), true);
  assert.equal(passes(4.499, 'AA'), false);
  assert.equal(passes(3, 'AA', true), true);
  assert.equal(passes(4.5, 'AAA', true), true);
  assert.throws(() => passes(0.5, 'AA'), RangeError);
  assert.throws(() => passes(5, 'A'), RangeError);
  for (const bad of ['#12', '#12345', '#ggg', 'red']) assert.throws(() => relativeLuminance(bad), RangeError, bad);
});

test('geo: haversine, geohash and bounding box vectors', async () => {
  const { haversineMeters, geohashEncode, geohashDecode, boundingBox } = await load('geo');
  assert.equal(Math.round(haversineMeters(51.5074, -0.1278, 48.8566, 2.3522)), 343557);
  assert.equal(Math.round(haversineMeters(10, 10, 10, 10)), 0);
  assert.equal(Math.round(haversineMeters(0, 0, 0, 180)), 20015114);
  const hashes = [[37.7749, -122.4194, 9, '9q8yyk8yt'], [0, 0, 5, 's0000'], [-33.8688, 151.2093, 7, 'r3gx2f7']];
  for (const [lat, lon, precision, hash] of hashes) {
    assert.equal(geohashEncode(lat, lon, precision), hash);
    const cell = geohashDecode(hash);
    assert.ok(Math.abs(cell.lat - lat) <= cell.latError && Math.abs(cell.lon - lon) <= cell.lonError, hash);
    assert.deepEqual(geohashDecode(hash.toUpperCase()), cell);
  }
  for (const bad of ['', 'abc', 'u4pruydqqvj8x', 'i']) assert.throws(() => geohashDecode(bad), RangeError, bad);
  assert.throws(() => geohashEncode(0, 0, 13), RangeError);
  assert.throws(() => haversineMeters(91, 0, 0, 0), RangeError);
  assert.throws(() => haversineMeters(0, 181, 0, 0), RangeError);
  const [lat, lon, radius] = [51.5, -0.12, 10000];
  const box = boundingBox(lat, lon, radius);
  const midLat = (box.minLat + box.maxLat) / 2;
  for (const [pLat, pLon] of [[box.maxLat, lon], [box.minLat, lon], [lat, box.minLon], [lat, box.maxLon]]) {
    assert.ok(haversineMeters(lat, lon, pLat, pLon) >= radius - 1, `${pLat},${pLon}`);
  }
  assert.ok(Math.abs(midLat - lat) < 1e-9);
  assert.ok(box.maxLon - box.minLon > box.maxLat - box.minLat);
  assert.deepEqual(boundingBox(89.99, 0, 10000), { minLat: 89.99 - (10000 / 6371008.8) * 180 / Math.PI, maxLat: 90, minLon: -180, maxLon: 180 });
  const edge = boundingBox(0, 179.99, 10000);
  assert.equal(edge.minLon, -180);
  assert.equal(edge.maxLon, 180);
  assert.throws(() => boundingBox(0, 0, -1), RangeError);
});

test('webhook-signature: Stripe-style header vector and verification failures', async () => {
  const { signWebhook, verifyWebhook } = await load('webhook-signature');
  const secret = 'whsec_test_secret_0123456789abcd';
  const t = 1790000000;
  const body = '{"id":"evt_1","amount":1999}';
  const header = 't=1790000000,v1=ad4e559e93bea390aff65b8c1eaec615bbdf3df1ef1d1c908b03299c20cf44a6';
  assert.equal(await signWebhook(secret, t, body), header);
  assert.equal(await signWebhook(secret, t, new TextEncoder().encode(body)), header);
  const code = async (promise) => { try { await promise; return 'ok'; } catch (error) { return error.code ?? error.name; } };
  assert.equal(await code(verifyWebhook(header, body, secret, t)), 'ok');
  assert.equal(await code(verifyWebhook(header, body, secret, t + 300)), 'ok');
  assert.equal(await code(verifyWebhook(header, body, secret, t - 300)), 'ok');
  assert.equal(await code(verifyWebhook(header, body, secret, t + 301)), 'expired');
  assert.equal(await code(verifyWebhook(header, body, secret, t - 301)), 'expired');
  assert.equal(await code(verifyWebhook(header, body.replace('1999', '1998'), secret, t)), 'bad signature');
  assert.equal(await code(verifyWebhook(header, body, `${secret}x`, t)), 'bad signature');
  assert.equal(await code(verifyWebhook(header.replace(/a6$/, 'a7'), body, secret, t)), 'bad signature');
  const v1 = header.slice(header.indexOf('v1='));
  assert.equal(await code(verifyWebhook(`t=${t},v1=${'0'.repeat(64)},${v1}`, body, secret, t)), 'ok');
  assert.equal(await code(verifyWebhook(` t = ${t} , v0=abc , ${v1} `, body, secret, t)), 'ok');
  assert.equal(await code(verifyWebhook(v1, body, secret, t)), 'malformed');
  assert.equal(await code(verifyWebhook(`t=${t},t=${t},${v1}`, body, secret, t)), 'malformed');
  assert.equal(await code(verifyWebhook(`t=${t},v1=${'z'.repeat(64)}`, body, secret, t)), 'malformed');
  assert.equal(await code(verifyWebhook(`t=${t}`, body, secret, t)), 'malformed');
  assert.equal(await code(verifyWebhook(`t=abc,${v1}`, body, secret, t)), 'malformed');
  assert.equal(await code(verifyWebhook(`t=${t},${v1.toUpperCase().replace('V1', 'v1')}`, body, secret, t)), 'malformed');
  assert.equal(await code(verifyWebhook(header, body, '', t)), 'RangeError');
  await assert.rejects(signWebhook('', t, body), RangeError);
  await assert.rejects(signWebhook(secret, -1, body), RangeError);
});
