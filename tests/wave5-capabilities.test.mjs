// SPDX-License-Identifier: Apache-2.0
// Vector tests for the wave 5 TypeScript recipes: check digits, signed URLs, polyline encoding, web map
// tiles, email address validation, ISO 8601 durations, planar geometry and safe redirects. Compiled with
// the same generated-tsconfig approach and strict flags as tests/wave4-capabilities.test.mjs.
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const recipeDir = join(root, 'examples/recipes');
const names = ['check-digits', 'signed-urls', 'polyline', 'tile-math', 'email-address', 'iso-duration', 'geometry', 'safe-redirect'];
const out = mkdtempSync(join(tmpdir(), 'genlib-wave5-'));
after(() => rmSync(out, { recursive: true, force: true }));
const compilerOptions = {
  strict: true, noUncheckedIndexedAccess: true, exactOptionalPropertyTypes: true, noImplicitReturns: true,
  noFallthroughCasesInSwitch: true, noUnusedLocals: true, noUnusedParameters: true, skipLibCheck: true,
  target: 'ES2022', module: 'NodeNext', moduleResolution: 'NodeNext', lib: ['ES2022', 'DOM', 'DOM.Iterable'],
  rootDir: recipeDir, outDir: out,
};
const project = join(out, 'tsconfig.wave5.json');
writeFileSync(project, JSON.stringify({ compilerOptions, files: names.map((n) => join(recipeDir, `${n}.ts`)) }));
execFileSync(process.execPath, [join(root, 'node_modules/typescript/bin/tsc'), '-p', project], { stdio: 'pipe' });
writeFileSync(join(out, 'package.json'), '{"type":"module"}');
const load = (name) => import(pathToFileURL(join(out, `${name}.js`)).href);
const findTop = (...words) => JSON.parse(execFileSync(process.execPath, ['tools/agent-recipes.mjs', 'find', ...words], { cwd: root, encoding: 'utf8' })).matches[0]?.id;
const near = (actual, expected, tolerance, label) => {
  assert.equal(actual.length, expected.length, label);
  actual.forEach((v, i) => assert.ok(Math.abs(v - expected[i]) <= tolerance, `${label}[${i}]: ${v} vs ${expected[i]}`));
};

test('wave 5 recipes are registered and routed', () => {
  const entries = JSON.parse(readFileSync(join(root, 'resources/agent-recipes.json'), 'utf8')).entries;
  for (const n of names) assert.ok(entries.some((e) => e.path === `examples/recipes/${n}.ts`), n);
  assert.equal(findTop('luhn'), 'check-digits');
  assert.equal(findTop('iban'), 'check-digits');
  assert.equal(findTop('isbn'), 'check-digits');
  assert.equal(findTop('signed', 'url'), 'signed-urls');
  assert.equal(findTop('polyline'), 'polyline-encoding');
  assert.equal(findTop('quadkey'), 'web-map-tiles');
  assert.equal(findTop('slippy', 'map'), 'web-map-tiles');
  assert.equal(findTop('email', 'validation'), 'email-address-validation');
  assert.equal(findTop('iso', '8601', 'duration'), 'iso-8601-durations');
  assert.equal(findTop('point', 'in', 'polygon'), 'geometry-polygons');
  assert.equal(findTop('douglas', 'peucker'), 'geometry-polygons');
  assert.equal(findTop('open', 'redirect'), 'safe-redirects');
});

test('check-digits: Luhn, IBAN, GTIN and ISBN vectors', async () => {
  const m = await load('check-digits');
  for (const [v, e] of [['4539 1488 0343 6467', true], ['79927398713', true], ['79927398710', false], ['0', false],
    ['4539-1488-0343-6468', false], ['12a4', false], ['', false]]) assert.equal(m.luhnValid(v), e, v);
  assert.equal(m.luhnCheckDigit('7992739871'), '3');
  assert.equal(m.luhnCheckDigit('453914880343646'), '7');
  assert.throws(() => m.luhnCheckDigit(''), RangeError);
  assert.throws(() => m.luhnCheckDigit('12a'), RangeError);
  assert.equal(m.luhnValid('１２３４'), false);
  for (const [v, e] of [['GB82 WEST 1234 5698 7654 32', true], ['DE89 3704 0044 0532 0130 00', true], ['gb82west12345698765432', true],
    ['GB82 WEST 1234 5698 7654 33', false], ['GB82-WEST', false], ['NO9386011117947', true], ['XX00', false]]) assert.equal(m.ibanValid(v), e, v);
  assert.equal(m.ibanFormat('gb82west12345698765432'), 'GB82 WEST 1234 5698 7654 32');
  assert.equal(m.ibanFormat('NO9386011117947'), 'NO93 8601 1117 947');
  assert.throws(() => m.ibanFormat('GB82 WEST 1234 5698 7654 33'), RangeError);
  for (const [v, e] of [['4006381333931', true], ['036000291452', true], ['96385074', true], ['10614141000415', true],
    ['4006381333932', false], ['12345', false]]) assert.equal(m.gtinValid(v), e, v);
  for (const [v, e] of [['0-306-40615-2', true], ['0-8044-2957-X', true], ['0-306-40615-3', false], ['030640615', false]]) assert.equal(m.isbn10Valid(v), e, v);
  assert.equal(m.isbn10Valid('0-8044-2957-x'), true);
  for (const [v, e] of [['978-0-306-40615-7', true], ['979-10-90636-07-1', true], ['978-0-306-40615-8', false], ['4006381333931', false]]) assert.equal(m.isbn13Valid(v), e, v);
  assert.equal(m.isbn10To13('0-306-40615-2'), '9780306406157');
  assert.equal(m.isbn10To13('080442957X'), '9780804429573');
  assert.throws(() => m.isbn10To13('0-306-40615-3'), RangeError);
});

test('signed-urls: byte-exact vectors, expiry, tampering and malformed input', async () => {
  const { signUrl, verifyUrl, SignedUrlError } = await load('signed-urls');
  const secret = 'url-signing-secret';
  const cases = [
    ['/files/report.pdf?user=42', 1790000000, '/files/report.pdf?user=42&expires=1790000000&signature=OBOJTlNq3AuDbND_6J4njKkDIXDMxhx0l0PmWaRbfaU'],
    ['/download/a%20b.zip', 1790003600, '/download/a%20b.zip?expires=1790003600&signature=SafK5ZH-apLeaJ-c1dhzp-kyiS3doOR7ywgvr8WDJOo'],
  ];
  const code = async (signed, key = secret, now = 1790000000) => {
    try { await verifyUrl(signed, key, now); } catch (error) { assert.ok(error instanceof SignedUrlError); return error.code; }
    return 'ok';
  };
  for (const [target, expires, signed] of cases) {
    assert.equal(await signUrl(target, secret, expires), signed);
    assert.equal(await verifyUrl(signed, secret, expires), expires);
    assert.equal(await code(signed, secret, expires + 1), 'expired');
    assert.equal(await code(signed.replace(target.slice(0, 3), `${target.slice(0, 2)}X`), secret, expires), 'bad signature');
    assert.equal(await code(signed, `${secret}x`, expires), 'bad signature');
    assert.equal(await code(signed.slice(0, -1) + (signed.endsWith('A') ? 'B' : 'A'), secret, expires), 'bad signature');
  }
  const [message, sig] = cases[0][2].split('&signature=');
  assert.equal(await code(message), 'malformed');
  assert.equal(await code(`${message}&expires=1790000000&signature=${sig}`), 'malformed');
  assert.equal(await code(`${message.replace('1790000000', '17900e0000')}&signature=${sig}`), 'malformed');
  assert.equal(await code(`${cases[0][2]}x`), 'malformed');
  assert.equal(await code(`/files/report.pdf?user=42&signature=${sig}`), 'malformed');
  for (const target of ['files', '/a#b', '/a?expires=1', '/a?x=1&signature=2', '/a?signature']) await assert.rejects(signUrl(target, secret, 1), RangeError, target);
  await assert.rejects(signUrl('/a', '', 1), RangeError);
  await assert.rejects(signUrl('/a', secret, -1), RangeError);
  await assert.rejects(verifyUrl(cases[0][2], '', 1), RangeError);
});

test('polyline: Google and precision 6 vectors, round trip and rejection', async () => {
  const { encodePolyline, decodePolyline } = await load('polyline');
  const google = [[38.5, -120.2], [40.7, -120.95], [43.252, -126.453]];
  const p6 = [[47.6062, -122.3321], [47.6205, -122.3493]];
  assert.equal(encodePolyline(google), '_p~iF~ps|U_ulLnnqC_mqNvxq`@');
  assert.equal(encodePolyline(p6, 6), 'ozsxyAf{pihFw|Z~q`@');
  near(decodePolyline('_p~iF~ps|U_ulLnnqC_mqNvxq`@').flat(), google.flat(), 0.5e-5, 'google');
  near(decodePolyline('ozsxyAf{pihFw|Z~q`@', 6).flat(), p6.flat(), 0.5e-6, 'p6');
  assert.equal(encodePolyline([]), '');
  assert.deepEqual(decodePolyline(''), []);
  const pts = [[0.000005, -0.000005], [-89.99999, 179.99999], [12.345674, -98.765436]];
  near(decodePolyline(encodePolyline(pts)).flat(), pts.flat(), 0.5e-5, 'round trip');
  assert.deepEqual(decodePolyline(encodePolyline([[0.000005, -0.000005]])), [[0.00001, -0.00001]]);
  for (const bad of ['_p~iF~ps|U_', '_p~iF', ' ??', '\x7f?']) assert.throws(() => decodePolyline(bad), RangeError, JSON.stringify(bad));
  assert.throws(() => encodePolyline([[NaN, 0]]), RangeError);
  assert.throws(() => encodePolyline(google, -1), RangeError);
});

test('tile-math: tiles, bounds, quadkeys and Mercator meters', async () => {
  const m = await load('tile-math');
  for (const [lon, lat, z, x, y] of [[-122.4194, 37.7749, 12, 655, 1583], [0, 0, 0, 0, 0], [2.3522, 48.8566, 15, 16598, 11273],
    [179.9999, -89.9, 3, 7, 7], [-180, 85.1, 2, 0, 0]]) assert.deepEqual(m.lonLatToTile(lon, lat, z), [x, y]);
  for (const bad of [[0, 0, 25], [0, 0, -1], [181, 0, 1], [NaN, 0, 1], [0, Infinity, 1], [0, 0, 1.5]]) assert.throws(() => m.lonLatToTile(...bad), RangeError);
  for (const [x, y, z, b] of [[0, 0, 0, [-180.0, -85.0511287798066, 180.0, 85.0511287798066]],
    [655, 1583, 12, [-122.431640625, 37.718590325588146, -122.34375, 37.78808138412046]], [1, 1, 1, [0.0, -85.0511287798066, 180.0, 0.0]]]) near(m.tileBounds(x, y, z), b, 1e-9, `bounds ${x}/${y}/${z}`);
  for (const bad of [[1, 0, 0], [0, 2, 1], [-1, 0, 3]]) assert.throws(() => m.tileBounds(...bad), RangeError);
  for (const [x, y, z, key] of [[3, 5, 3, '213'], [655, 1583, 12, '023010203333'], [0, 0, 1, '0']]) {
    assert.equal(m.tileToQuadkey(x, y, z), key);
    assert.deepEqual(m.quadkeyToTile(key), { x, y, zoom: z });
  }
  assert.deepEqual(m.quadkeyToTile(''), { x: 0, y: 0, zoom: 0 });
  assert.throws(() => m.quadkeyToTile('0124'), RangeError);
  for (const [lon, lat, xy] of [[0, 0, [0.0, -7.081154551613622e-10]], [-122.4194, 37.7749, [-13627665.271218073, 4547675.354340557]],
    [180, 85.05112877980659, [20037508.342789244, 20037508.342789244]]]) near(m.lonLatToMercator(lon, lat), xy, 1e-6, `mercator ${lon},${lat}`);
  assert.throws(() => m.lonLatToMercator(0, 85.06), RangeError);
});

test('email-address: WHATWG validity vectors and normalization', async () => {
  const { emailValid, emailNormalize } = await load('email-address');
  const a63 = 'a'.repeat(63);
  const cases = [['user@example.com', true], ['first.last+tag@sub.Example.CO.uk', true], ["o'brien@example.ie", true], ['a@b', true],
    ['user@-example.com', false], ['user@example-.com', false], ['user@exa_mple.com', false], ['user example@example.com', false],
    ['user@@example.com', false], ['@example.com', false], ['user@', false], ['user@example..com', false], ['user.@example.com', true],
    ['ünïcode@example.com', false], [`${'x'.repeat(64)}@example.com`, true], [`${'x'.repeat(65)}@example.com`, false],
    [`u@${[a63, a63, a63].join('.')}.${'b'.repeat(59)}`, true], [`u@${[a63, a63, a63].join('.')}.${'b'.repeat(61)}`, false],
    [`user@${'a'.repeat(64)}.com`, false]];
  for (const [v, e] of cases) assert.equal(emailValid(v), e, v);
  assert.equal(emailValid('user@example.com\n'), false);
  assert.equal(emailNormalize('  Mixed.Case@Example.COM '), 'Mixed.Case@example.com');
  assert.throws(() => emailNormalize(' not an email '), RangeError);
});

test('iso-duration: parse, invalid, milliseconds and format vectors', async () => {
  const { parseDuration, durationMilliseconds, formatDuration } = await load('iso-duration');
  const d = (years, months, weeks, days, hours, minutes, milliseconds) => ({ years, months, weeks, days, hours, minutes, milliseconds });
  for (const [s, e] of [['P1Y2M3DT4H5M6S', d(1, 2, 0, 3, 4, 5, 6000)], ['PT1H30M', d(0, 0, 0, 0, 1, 30, 0)], ['P2W', d(0, 0, 2, 0, 0, 0, 0)],
    ['PT0.5S', d(0, 0, 0, 0, 0, 0, 500)], ['PT36H', d(0, 0, 0, 0, 36, 0, 0)], ['P0D', d(0, 0, 0, 0, 0, 0, 0)], ['PT1.250S', d(0, 0, 0, 0, 0, 0, 1250)]]) {
    assert.deepEqual(parseDuration(s), e, s);
  }
  for (const s of ['P', 'PT', '1D', 'P1H', 'PT1D', 'P-1D', 'PT1.2345S', 'P1.5D', 'p1d', 'P1DT', '', 'PT1.S', 'P99999999999999999D']) assert.throws(() => parseDuration(s), RangeError, s);
  for (const [s, ms] of [['PT1H30M', 5400000], ['P2W', 1209600000], ['P1DT0.5S', 86400500], ['PT36H', 129600000]]) assert.equal(durationMilliseconds(parseDuration(s)), ms, s);
  for (const s of ['P1Y', 'P1M']) assert.throws(() => durationMilliseconds(parseDuration(s)), RangeError, s);
  for (const [ms, s] of [[0, 'PT0S'], [5400000, 'PT1H30M'], [90061001, 'P1DT1H1M1.001S'], [500, 'PT0.5S'], [129600000, 'P1DT12H'], [1209600000, 'P14D']]) {
    assert.equal(formatDuration(ms), s);
    assert.equal(durationMilliseconds(parseDuration(s)), ms);
  }
  assert.throws(() => formatDuration(-1), RangeError);
  assert.throws(() => formatDuration(1.5), RangeError);
});

test('geometry: point in polygon, area, centroid, simplify and ring area vectors', async () => {
  const g = await load('geometry');
  const square = [[0, 0], [4, 0], [4, 4], [0, 4]];
  const concave = [[0, 0], [6, 0], [6, 6], [3, 3], [0, 6]];
  const line = [[0, 0], [1, 0.1], [2, -0.1], [3, 5], [4, 6], [5, 7], [6, 8.1], [7, 9], [8, 9], [9, 9]];
  for (const [ring, p, e] of [[square, [2, 2], true], [square, [5, 2], false], [square, [4, 2], true], [square, [0, 0], true], [square, [2, 4.000001], false],
    [concave, [3, 4], false], [concave, [3, 2], true], [concave, [1, 5], true], [concave, [3, 3], true]]) {
    assert.equal(g.pointInPolygon(p, ring), e, JSON.stringify(p));
    assert.equal(g.pointInPolygon(p, [...ring, ring[0]]), e);
  }
  assert.throws(() => g.pointInPolygon([0, 0], [[0, 0], [1, 1], [0, 0]]), RangeError);
  assert.equal(g.signedArea(square), 16);
  assert.equal(g.signedArea([...square].reverse()), -16);
  assert.equal(g.signedArea(concave), 27);
  near(g.centroid(square), [2.0, 2.0], 1e-9, 'square centroid');
  near(g.centroid(concave), [3.0, 2.3333333333333335], 1e-9, 'concave centroid');
  assert.throws(() => g.centroid([[0, 0], [1, 1], [2, 2]]), RangeError);
  assert.deepEqual(g.simplify(line, 1), [[0, 0], [2, -0.1], [3, 5], [7, 9], [9, 9]]);
  assert.deepEqual(g.simplify(line, 0.05), [[0, 0], [1, 0.1], [2, -0.1], [3, 5], [6, 8.1], [7, 9], [9, 9]]);
  assert.deepEqual(g.simplify([[0, 0], [5, 5]], 1), [[0, 0], [5, 5]]);
  assert.throws(() => g.simplify(line, -1), RangeError);
  for (const [ring, area] of [[[[0, 0], [1, 0], [1, 1], [0, 1]], 12391399902.070992],
    [[[-0.13, 51.5], [-0.12, 51.5], [-0.12, 51.51], [-0.13, 51.51]], 771337.3090775362]]) {
    assert.ok(Math.abs(g.ringAreaSquareMeters(ring) - area) / area <= 1e-9, String(area));
  }
});

test('safe-redirect: allowed-origin vectors and unsafe forms', async () => {
  const { safeRedirect } = await load('safe-redirect');
  const allowed = ['https://app.example.com', 'https://accounts.example.com:8443'];
  const cases = [['/dashboard?tab=1#top', '/dashboard?tab=1#top'], ['//evil.com/x', '/'], ['/\\evil.com', '/'],
    ['https://app.example.com/settings', 'https://app.example.com/settings'], ['HTTPS://APP.EXAMPLE.COM:443/a', 'HTTPS://APP.EXAMPLE.COM:443/a'],
    ['https://app.example.com.evil.com/', '/'], ['https://user@app.example.com/', '/'], ['http://app.example.com/', '/'],
    ['https://accounts.example.com:8443/login', 'https://accounts.example.com:8443/login'], ['https://accounts.example.com/login', '/'],
    ['javascript:alert(1)', '/'], ['/ok path', '/'], ['dashboard', '/'], ['', '/'], ['/\t/evil.com', '/'], ['https://app.example.com:99999/', '/']];
  for (const [target, expected] of cases) {
    assert.equal(safeRedirect(target, allowed), expected, target);
    assert.equal(safeRedirect(target, allowed, '/home'), expected === '/' ? '/home' : expected, target);
  }
  assert.equal(safeRedirect(`/${'a'.repeat(2048)}`, allowed), '/');
  assert.equal(safeRedirect('/x\x7f', allowed), '/');
  assert.equal(safeRedirect('https://app..example.com/', allowed), '/');
  assert.equal(safeRedirect('https://app.example.com', ['HTTPS://App.Example.com:443']), 'https://app.example.com');
});
