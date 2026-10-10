// SPDX-License-Identifier: Apache-2.0
// Vector tests for the wave 6 TypeScript recipes: IP/CIDR SSRF guard, HTTP Range, content negotiation,
// conditional requests, cookies, URL normalization, string similarity and RRULE expansion. The vectors
// are copied from the shared wave 6 vector set used by every language. Compiled with the same
// generated-tsconfig approach and strict flags as tests/wave5-capabilities.test.mjs.
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const recipeDir = join(root, 'examples/recipes');
const names = ['ip-cidr', 'http-range', 'content-negotiation', 'http-conditional', 'cookies', 'url-normalize', 'string-similarity', 'rrule'];
const out = mkdtempSync(join(tmpdir(), 'genlib-wave6-'));
after(() => rmSync(out, { recursive: true, force: true }));
const compilerOptions = {
  strict: true, noUncheckedIndexedAccess: true, exactOptionalPropertyTypes: true, noImplicitReturns: true,
  noFallthroughCasesInSwitch: true, noUnusedLocals: true, noUnusedParameters: true, skipLibCheck: true,
  target: 'ES2022', module: 'NodeNext', moduleResolution: 'NodeNext', lib: ['ES2022', 'DOM', 'DOM.Iterable'],
  rootDir: recipeDir, outDir: out,
};
const project = join(out, 'tsconfig.wave6.json');
writeFileSync(project, JSON.stringify({ compilerOptions, files: names.map((n) => join(recipeDir, `${n}.ts`)) }));
execFileSync(process.execPath, [join(root, 'node_modules/typescript/bin/tsc'), '-p', project], { stdio: 'pipe' });
writeFileSync(join(out, 'package.json'), '{"type":"module"}');
const load = (name) => import(pathToFileURL(join(out, `${name}.js`)).href);
const findTop = (...words) => JSON.parse(execFileSync(process.execPath, ['tools/agent-recipes.mjs', 'find', ...words], { cwd: root, encoding: 'utf8' })).matches[0]?.id;

const IP_CANONICAL = [
  ["192.168.1.1", "192.168.1.1"],
  ["2001:DB8:0:0:0:0:0:1", "2001:db8::1"],
  ["2001:db8::0:1", "2001:db8::1"],
  ["::", "::"],
  ["::1", "::1"],
  ["2001:db8:0:0:1:0:0:1", "2001:db8::1:0:0:1"],
  ["2001:0db8:0000:0000:0000:ff00:0042:8329", "2001:db8::ff00:42:8329"],
  ["fe80::1:0:0:0", "fe80::1:0:0:0"],
  ["::ffff:192.0.2.128", "::ffff:192.0.2.128"],
  ["::ffff:c000:280", "::ffff:192.0.2.128"],
  ["1:0:0:2:0:0:0:3", "1:0:0:2::3"],
  ["64:ff9b::198.51.100.7", "64:ff9b::c633:6407"],
];
const IP_INVALID = ["256.1.1.1", "01.2.3.4", "1.2.3", "1.2.3.4.5", "1:2:3:4:5:6:7:8:9", "1::2::3", "::g", "fe80::1%eth0", "[::1]", "", " 1.2.3.4", "1.2.3.4/24", "12345::"];
const IP_CONTAINS = [
  ["10.0.0.0/8", "10.255.1.2", true],
  ["10.0.0.0/8", "11.0.0.1", false],
  ["192.168.1.0/24", "192.168.1.255", true],
  ["0.0.0.0/0", "8.8.8.8", true],
  ["2001:db8::/32", "2001:db8:ffff::1", true],
  ["2001:db8::/32", "2001:db9::1", false],
  ["10.0.0.0/8", "::ffff:10.0.0.1", false],
  ["::/0", "::1", true],
  ["192.168.1.1/32", "192.168.1.1", true],
];
const IP_INVALID_CIDR = ["10.0.0.1/8", "10.0.0.0/33", "10.0.0.0", "10.0.0.0/08", "2001:db8::/129"];
const IP_PUBLIC = [
  ["8.8.8.8", true],
  ["10.1.2.3", false],
  ["127.0.0.1", false],
  ["169.254.169.254", false],
  ["100.64.0.1", false],
  ["172.31.255.255", false],
  ["172.32.0.1", true],
  ["192.168.0.10", false],
  ["0.0.0.0", false],
  ["255.255.255.255", false],
  ["224.0.0.1", false],
  ["2606:4700:4700::1111", true],
  ["::1", false],
  ["fd00::1", false],
  ["fe80::1", false],
  ["::ffff:127.0.0.1", false],
  ["::ffff:8.8.8.8", true],
  ["64:ff9b::a00:1", false],
  ["2001:db8::1", false],
  ["ff02::1", false],
];
const RANGE_SIZE = 10000;
const RANGE_CASES = [
  ["bytes=0-499", {"kind": "ranges", "ranges": [[0, 499]]}],
  ["bytes=500-999", {"kind": "ranges", "ranges": [[500, 999]]}],
  ["bytes=-500", {"kind": "ranges", "ranges": [[9500, 9999]]}],
  ["bytes=9500-", {"kind": "ranges", "ranges": [[9500, 9999]]}],
  ["bytes=0-0,-1", {"kind": "ranges", "ranges": [[0, 0], [9999, 9999]]}],
  ["bytes= 0-1 , 5-6", {"kind": "ranges", "ranges": [[0, 1], [5, 6]]}],
  ["BYTES=0-99", {"kind": "ranges", "ranges": [[0, 99]]}],
  ["bytes=9999-20000", {"kind": "ranges", "ranges": [[9999, 9999]]}],
  ["bytes=10000-", {"kind": "unsatisfiable", "contentRange": "bytes */10000"}],
  ["bytes=-0", {"kind": "unsatisfiable", "contentRange": "bytes */10000"}],
  ["bytes=-20000", {"kind": "ranges", "ranges": [[0, 9999]]}],
  ["bytes=500-400", {"kind": "none"}],
  ["items=0-1", {"kind": "none"}],
  ["bytes=", {"kind": "none"}],
  ["bytes=0-1,", {"kind": "none"}],
  ["bytes=abc", {"kind": "none"}],
  ["bytes=1-2-3", {"kind": "none"}],
  [null, {"kind": "none"}],
  ["bytes=10000-10001,20000-", {"kind": "unsatisfiable", "contentRange": "bytes */10000"}],
];
const RANGE_EMPTY_FILE = [
  ["bytes=0-", {"kind": "unsatisfiable", "contentRange": "bytes */0"}],
  ["bytes=-5", {"kind": "unsatisfiable", "contentRange": "bytes */0"}],
];
const CONTENT_RANGE = [
  [0, 499, 10000, "bytes 0-499/10000"],
];
const MEDIA_AVAILABLE = ["application/json", "text/html", "text/csv"];
const MEDIA = [
  ["application/json", "application/json"],
  ["text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8", "text/html"],
  ["text/*;q=0.5, application/json;q=0.4", "text/html"],
  ["*/*", "application/json"],
  ["text/csv;q=0, text/*", "text/html"],
  ["image/png", null],
  ["application/json;q=0", null],
  ["TEXT/HTML", "text/html"],
  ["text/html;q=1.5, text/csv", "text/csv"],
  [null, "application/json"],
  ["", "application/json"],
  ["application/*;q=0.2, */*;q=0.1", "application/json"],
  ["text/html;level=1;q=0.7, text/csv;q=0.7", "text/html"],
];
const LANGUAGE_AVAILABLE = ["en", "en-GB", "fr", "pt-BR"];
const LANGUAGE = [
  ["fr-CH, fr;q=0.9, en;q=0.8, de;q=0.7, *;q=0.5", "fr"],
  ["en-GB", "en-GB"],
  ["en-US,en;q=0.9", "en"],
  ["pt", "pt-BR"],
  ["de", null],
  ["de, *;q=0.1", "en"],
  ["en;q=0, *", "fr"],
  ["PT-br", "pt-BR"],
  [null, "en"],
  ["zh-Hant-TW", null],
];
// Request fields use the TypeScript (camelCase) spelling of the shared vectors; lastModified is unix seconds.
const CONDITIONAL = [
  [{"method": "GET", "etag": "\"v2\"", "ifNoneMatch": "\"v2\""}, 304],
  [{"method": "GET", "etag": "\"v2\"", "ifNoneMatch": "W/\"v2\""}, 304],
  [{"method": "GET", "etag": "W/\"v2\"", "ifNoneMatch": "\"v1\", \"v2\""}, 304],
  [{"method": "GET", "etag": "\"v2\"", "ifNoneMatch": "\"v1\""}, 200],
  [{"method": "HEAD", "etag": "\"v2\"", "ifNoneMatch": "*"}, 304],
  [{"method": "PUT", "etag": "\"v2\"", "ifNoneMatch": "*"}, 412],
  [{"method": "PUT", "ifNoneMatch": "*"}, 200],
  [{"method": "PUT", "etag": "\"v2\"", "ifMatch": "\"v2\""}, 200],
  [{"method": "PUT", "etag": "\"v2\"", "ifMatch": "\"v1\""}, 412],
  [{"method": "PUT", "etag": "W/\"v2\"", "ifMatch": "W/\"v2\""}, 412],
  [{"method": "DELETE", "ifMatch": "*"}, 412],
  [{"method": "DELETE", "etag": "\"a\"", "ifMatch": "*"}, 200],
  [{"method": "GET", "etag": "\"v2\"", "lastModified": 1792567680, "ifModifiedSince": "Wed, 21 Oct 2026 07:28:00 GMT"}, 304],
  [{"method": "GET", "etag": "\"v2\"", "lastModified": 1792567680, "ifModifiedSince": "Tue, 20 Oct 2026 07:28:00 GMT"}, 200],
  [{"method": "GET", "etag": "\"v2\"", "lastModified": 1792567680, "ifNoneMatch": "\"v1\"", "ifModifiedSince": "Wed, 21 Oct 2026 07:28:00 GMT"}, 200],
  [{"method": "POST", "lastModified": 1792567680, "ifModifiedSince": "Wed, 21 Oct 2026 07:28:00 GMT"}, 200],
  [{"method": "PUT", "lastModified": 1792567680, "ifUnmodifiedSince": "Tue, 20 Oct 2026 07:28:00 GMT"}, 412],
  [{"method": "PUT", "lastModified": 1792567680, "ifUnmodifiedSince": "Wed, 21 Oct 2026 07:28:00 GMT"}, 200],
  [{"method": "GET", "lastModified": 1792567680, "ifModifiedSince": "Wednesday, 21-Oct-26 07:28:00 GMT"}, 200],
  [{"method": "GET", "etag": "\"v2\"", "ifNoneMatch": "v2"}, 200],
  [{"method": "PUT", "etag": "\"v2\"", "ifMatch": "\"v2\"", "ifUnmodifiedSince": "Tue, 20 Oct 2026 07:28:00 GMT"}, 200],
];
const ETAG_PARSE = [
  ["\"a\", W/\"b\" ,\"c\"", ["\"a\"", "W/\"b\"", "\"c\""]],
  ["*", "*"],
  [" * ", "*"],
  ["W/\"x\", bogus, \"y\"", ["W/\"x\"", "\"y\""]],
  ["\"\"", ["\"\""]],
];
const COOKIE_SERIALIZE = [
  [{"name": "sid", "value": "abc123", "path": "/", "secure": true, "httpOnly": true, "sameSite": "Lax"}, "sid=abc123; Path=/; Secure; HttpOnly; SameSite=Lax"],
  [{"name": "__Host-session", "value": "x.y.z", "path": "/", "secure": true, "httpOnly": true, "sameSite": "Strict", "maxAge": 3600}, "__Host-session=x.y.z; Max-Age=3600; Path=/; Secure; HttpOnly; SameSite=Strict"],
  [{"name": "theme", "value": "dark", "maxAge": 0, "expires": 1792567680, "domain": "Example.COM", "path": "/app"}, "theme=dark; Max-Age=0; Expires=Wed, 21 Oct 2026 07:28:00 GMT; Domain=example.com; Path=/app"],
  [{"name": "embed", "value": "1", "secure": true, "sameSite": "None", "partitioned": true}, "embed=1; Secure; SameSite=None; Partitioned"],
  [{"name": "empty", "value": ""}, "empty="],
];
const COOKIE_INVALID = [
  {"name": "bad name", "value": "v"},
  {"name": "n", "value": "a;b"},
  {"name": "n", "value": "a b"},
  {"name": "n", "value": "a\"b"},
  {"name": "n", "value": "v", "sameSite": "None"},
  {"name": "__Secure-x", "value": "v"},
  {"name": "__Host-x", "value": "v", "secure": true, "path": "/a"},
  {"name": "__Host-x", "value": "v", "secure": true, "path": "/", "domain": "example.com"},
  {"name": "n", "value": "v", "path": "relative"},
  {"name": "n", "value": "v", "sameSite": "lax"},
  {"name": "n", "value": "v", "partitioned": true},
  {"name": "n", "value": "v", "maxAge": -1},
  {"name": "", "value": "v"},
];
const COOKIE_PARSE = [
  ["sid=abc; theme=dark", [["sid", "abc"], ["theme", "dark"]]],
  [" a = 1 ;b=2;; c=\"quoted value\" ;flag;d==x", [["a", "1"], ["b", "2"], ["c", "quoted value"], ["d", "=x"]]],
  ["a=1; a=2", [["a", "1"], ["a", "2"]]],
  ["", []],
];
const DOT_SEGMENTS = [
  ["/a/b/c/./../../g", "/a/g"],
  ["mid/content=5/../6", "mid/6"],
  ["/../a", "/a"],
  ["/a/./b/.", "/a/b/"],
  ["/a/b/..", "/a/"],
  [".", ""],
  ["../x", "x"],
  ["/a//b/../c", "/a//c"],
];
const URL_NORMALIZE = [
  ["HTTP://Example.COM:80/%7Euser/./a/../b?q=%2f", "http://example.com/~user/b?q=%2F"],
  ["https://example.com", "https://example.com/"],
  ["https://example.com:443/a%2Fb#frag", "https://example.com/a%2Fb"],
  ["http://example.com:8080/A/B/../C?", "http://example.com:8080/A/C"],
  ["https://[2001:DB8::0:1]:8443/x", "https://[2001:db8::1]:8443/x"],
  ["https://example.com/%e2%82%ac", "https://example.com/%E2%82%AC"],
  ["http://example.com:/p", "http://example.com/p"],
  ["https://EXAMPLE.com/a%20b", "https://example.com/a%20b"],
];
const URL_INVALID = ["ftp://example.com/", "https://user@example.com/", "https://exa mple.com/", "//example.com/", "https://example.com/%zz", "https://example.com:99999/", "example.com/path", "https://[::g]/"];
// Columns: a, b, levenshtein, osa, jaro, jaroWinkler, ratio
const SIMILARITY = [
  ["kitten", "sitting", 3, 3, 0.746031746031746, 0.746031746031746, 0.5714285714285714],
  ["flaw", "lawn", 2, 2, 0.8333333333333334, 0.8333333333333334, 0.5],
  ["", "", 0, 0, 1.0, 1.0, 1.0],
  ["", "abc", 3, 3, 0.0, 0.0, 0.0],
  ["abc", "abc", 0, 0, 1.0, 1.0, 1.0],
  ["ca", "abc", 3, 3, 0.0, 0.0, 0.0],
  ["MARTHA", "MARHTA", 2, 1, 0.9444444444444445, 0.9611111111111111, 0.6666666666666667],
  ["DIXON", "DICKSONX", 4, 4, 0.7666666666666666, 0.8133333333333332, 0.5],
  ["DWAYNE", "DUANE", 2, 2, 0.8222222222222223, 0.8400000000000001, 0.6666666666666667],
  ["café", "cafe", 1, 1, 0.8333333333333334, 0.8833333333333334, 0.75],
  ["naïve", "naive", 1, 1, 0.8666666666666667, 0.8933333333333333, 0.8],
  ["🙂ab", "ab🙂", 2, 2, 0.0, 0.0, 0.33333333333333337],
  ["JELLYFISH", "SMELLYFISH", 2, 2, 0.8962962962962964, 0.8962962962962964, 0.8],
];
const RRULE_CASES = [
  ["2026-01-31T09:00:00Z", "FREQ=MONTHLY;COUNT=5", ["2026-01-31T09:00:00Z", "2026-03-31T09:00:00Z", "2026-05-31T09:00:00Z", "2026-07-31T09:00:00Z", "2026-08-31T09:00:00Z"]],
  ["2026-10-12T09:30:00Z", "FREQ=WEEKLY;BYDAY=MO,WE,FR;COUNT=7", ["2026-10-12T09:30:00Z", "2026-10-14T09:30:00Z", "2026-10-16T09:30:00Z", "2026-10-19T09:30:00Z", "2026-10-21T09:30:00Z", "2026-10-23T09:30:00Z", "2026-10-26T09:30:00Z"]],
  ["2026-10-01T00:00:00Z", "FREQ=DAILY;INTERVAL=10;UNTIL=20261115T000000Z", ["2026-10-01T00:00:00Z", "2026-10-11T00:00:00Z", "2026-10-21T00:00:00Z", "2026-10-31T00:00:00Z", "2026-11-10T00:00:00Z"]],
  ["2026-01-01T12:00:00Z", "FREQ=MONTHLY;BYDAY=-1FR;COUNT=4", ["2026-01-30T12:00:00Z", "2026-02-27T12:00:00Z", "2026-03-27T12:00:00Z", "2026-04-24T12:00:00Z"]],
  ["2026-01-01T12:00:00Z", "FREQ=MONTHLY;BYDAY=2TU,4TU;COUNT=6", ["2026-01-13T12:00:00Z", "2026-01-27T12:00:00Z", "2026-02-10T12:00:00Z", "2026-02-24T12:00:00Z", "2026-03-10T12:00:00Z", "2026-03-24T12:00:00Z"]],
  ["2026-01-15T08:00:00Z", "FREQ=MONTHLY;BYMONTHDAY=1,-1;COUNT=6", ["2026-01-31T08:00:00Z", "2026-02-01T08:00:00Z", "2026-02-28T08:00:00Z", "2026-03-01T08:00:00Z", "2026-03-31T08:00:00Z", "2026-04-01T08:00:00Z"]],
  ["2028-02-29T00:00:00Z", "FREQ=YEARLY;COUNT=3", ["2028-02-29T00:00:00Z", "2032-02-29T00:00:00Z", "2036-02-29T00:00:00Z"]],
  ["2026-03-10T10:00:00Z", "FREQ=YEARLY;BYMONTH=3,9;COUNT=5", ["2026-03-10T10:00:00Z", "2026-09-10T10:00:00Z", "2027-03-10T10:00:00Z", "2027-09-10T10:00:00Z", "2028-03-10T10:00:00Z"]],
  ["2026-10-14T18:00:00Z", "FREQ=WEEKLY;INTERVAL=2;BYDAY=TU;COUNT=3", ["2026-10-27T18:00:00Z", "2026-11-10T18:00:00Z", "2026-11-24T18:00:00Z"]],
  ["2026-10-14T18:00:00Z", "FREQ=WEEKLY;COUNT=2", ["2026-10-14T18:00:00Z", "2026-10-21T18:00:00Z"]],
  ["2026-01-31T09:00:00Z", "FREQ=MONTHLY;INTERVAL=2;BYMONTHDAY=31;UNTIL=20261231T235959Z", ["2026-01-31T09:00:00Z", "2026-03-31T09:00:00Z", "2026-05-31T09:00:00Z", "2026-07-31T09:00:00Z"]],
];
const RRULE_INVALID = ["FREQ=HOURLY", "COUNT=3", "FREQ=DAILY;COUNT=2;UNTIL=20261231T000000Z", "FREQ=WEEKLY;BYDAY=1MO", "FREQ=DAILY;BYDAY=MO", "FREQ=MONTHLY;BYMONTHDAY=32", "FREQ=MONTHLY;BYSETPOS=1", "FREQ=WEEKLY;INTERVAL=0", "FREQ=MONTHLY;BYDAY=MO;BYMONTHDAY=1", "FREQ=YEARLY;UNTIL=2026-12-31", "FREQ=DAILY;FREQ=DAILY", "FREQ=WEEKLY;BYDAY=XX"];

test('wave 6 recipes are registered and routed', () => {
  const entries = JSON.parse(readFileSync(join(root, 'resources/agent-recipes.json'), 'utf8')).entries;
  for (const n of names) assert.ok(entries.some((e) => e.path === `examples/recipes/${n}.ts`), n);
  assert.equal(findTop('ssrf'), 'ip-cidr-ssrf-guard');
  assert.equal(findTop('cidr'), 'ip-cidr-ssrf-guard');
  assert.equal(findTop('range', 'request'), 'http-range-requests');
  assert.equal(findTop('byte', 'range'), 'http-range-requests');
  assert.equal(findTop('accept-language'), 'content-negotiation');
  assert.equal(findTop('content', 'negotiation'), 'content-negotiation');
  assert.equal(findTop('etag'), 'http-conditional-requests');
  assert.equal(findTop('if-none-match'), 'http-conditional-requests');
  assert.equal(findTop('set-cookie'), 'cookies');
  assert.equal(findTop('samesite'), 'cookies');
  assert.equal(findTop('normalize', 'url'), 'url-normalization');
  assert.equal(findTop('levenshtein'), 'string-similarity');
  assert.equal(findTop('fuzzy', 'match'), 'string-similarity');
  assert.equal(findTop('rrule'), 'rrule-recurrence');
  assert.equal(findTop('recurrence', 'rule'), 'rrule-recurrence');
});

test('ip-cidr: canonical text, invalid input, CIDR matching and public-address vectors', async () => {
  const m = await load('ip-cidr');
  for (const [text, expected] of IP_CANONICAL) assert.equal(m.canonicalIp(text), expected, text);
  assert.deepEqual(Array.from(m.parseIp('10.0.0.1')), [10, 0, 0, 1]);
  assert.equal(m.parseIp('::ffff:1.2.3.4').length, 16);
  for (const text of IP_INVALID) assert.throws(() => m.parseIp(text), RangeError, JSON.stringify(text));
  for (const [cidr, ip, expected] of IP_CONTAINS) assert.equal(m.cidrContains(cidr, ip), expected, `${cidr} ${ip}`);
  for (const cidr of IP_INVALID_CIDR) assert.throws(() => m.cidrContains(cidr, '10.0.0.1'), RangeError, cidr);
  for (const [ip, expected] of IP_PUBLIC) assert.equal(m.isPublicIp(ip), expected, ip);
});

test('http-range: Range header vectors, empty files and Content-Range', async () => {
  const { parseRange, contentRange } = await load('http-range');
  for (const [header, expected] of RANGE_CASES) assert.deepEqual(parseRange(header, RANGE_SIZE), expected, String(header));
  for (const [header, expected] of RANGE_EMPTY_FILE) assert.deepEqual(parseRange(header, 0), expected, header);
  for (const [start, end, size, expected] of CONTENT_RANGE) assert.equal(contentRange(start, end, size), expected);
  assert.throws(() => contentRange(5, 4, 10), RangeError);
  assert.deepEqual(parseRange(`bytes=${Array(101).fill('0-0').join(',')}`, RANGE_SIZE), { kind: 'none' });
  assert.equal(parseRange(`bytes=${Array(100).fill('0-0').join(',')}`, RANGE_SIZE).ranges.length, 100);
  const big = 2 ** 40;
  assert.deepEqual(parseRange('bytes=-1', big), { kind: 'ranges', ranges: [[big - 1, big - 1]] });
  assert.throws(() => parseRange('bytes=0-1', -1), RangeError);
});

test('content-negotiation: Accept and Accept-Language vectors', async () => {
  const { negotiateMediaType, negotiateLanguage } = await load('content-negotiation');
  for (const [header, expected] of MEDIA) assert.equal(negotiateMediaType(header, MEDIA_AVAILABLE), expected, String(header));
  for (const [header, expected] of LANGUAGE) assert.equal(negotiateLanguage(header, LANGUAGE_AVAILABLE), expected, String(header));
  assert.equal(negotiateMediaType(null, []), null);
  assert.equal(negotiateLanguage('en', []), null);
});

test('http-conditional: RFC 9110 precondition order, ETag parsing and HTTP dates', async () => {
  const m = await load('http-conditional');
  for (const [request, expected] of CONDITIONAL) assert.equal(m.evaluateConditional(request), expected, JSON.stringify(request));
  for (const [header, expected] of ETAG_PARSE) assert.deepEqual(m.parseEtags(header), expected, header);
  assert.equal(m.parseHttpDate('Wed, 21 Oct 2026 07:28:00 GMT'), 1792567680);
  assert.equal(m.formatHttpDate(1792567680), 'Wed, 21 Oct 2026 07:28:00 GMT');
  for (const bad of ['Thu, 21 Oct 2026 07:28:00 GMT', 'Wed, 21 Oct 2026 07:28:00 UTC', 'Wed, 1 Oct 2026 07:28:00 GMT',
    'Sat, 30 Feb 2026 00:00:00 GMT', 'Wednesday, 21-Oct-26 07:28:00 GMT']) assert.equal(m.parseHttpDate(bad), null, bad);
});

test('cookies: Set-Cookie serialization, prefix rules and Cookie header parsing', async () => {
  const { serializeCookie, parseCookieHeader } = await load('cookies');
  const split = ({ name, value, ...options }) => [name, value, options];
  for (const [input, expected] of COOKIE_SERIALIZE) assert.equal(serializeCookie(...split(input)), expected);
  for (const input of COOKIE_INVALID) assert.throws(() => serializeCookie(...split(input)), RangeError, JSON.stringify(input));
  for (const [header, expected] of COOKIE_PARSE) assert.deepEqual(parseCookieHeader(header), expected, header);
});

test('url-normalize: dot segments, normalization and rejection vectors', async () => {
  const { removeDotSegments, normalizeUrl } = await load('url-normalize');
  for (const [path, expected] of DOT_SEGMENTS) assert.equal(removeDotSegments(path), expected, path);
  for (const [url, expected] of URL_NORMALIZE) {
    assert.equal(normalizeUrl(url), expected, url);
    assert.equal(normalizeUrl(expected), expected, expected);
  }
  for (const url of URL_INVALID) assert.throws(() => normalizeUrl(url), RangeError, url);
});

test('string-similarity: code-point distances and scores within 1e-12', async () => {
  const s = await load('string-similarity');
  const close = (actual, expected, label) => assert.ok(Math.abs(actual - expected) <= 1e-12, `${label}: ${actual} vs ${expected}`);
  for (const [a, b, lev, osa, jaro, jw, ratio] of SIMILARITY) {
    const label = `${a}|${b}`;
    assert.equal(s.levenshtein(a, b), lev, label);
    assert.equal(s.damerauOsa(a, b), osa, label);
    close(s.jaro(a, b), jaro, label);
    close(s.jaroWinkler(a, b), jw, label);
    close(s.similarityRatio(a, b), ratio, label);
  }
});

test('rrule: expansion vectors, invalid rules and limits', async () => {
  const { expandRRule } = await load('rrule');
  for (const [dtstart, rule, expected] of RRULE_CASES) assert.deepEqual(expandRRule(dtstart, rule), expected, rule);
  for (const rule of RRULE_INVALID) assert.throws(() => expandRRule('2026-01-01T00:00:00Z', rule), RangeError, rule);
  assert.equal(expandRRule('2026-01-01T00:00:00Z', 'FREQ=DAILY').length, 50);
  assert.equal(expandRRule('2026-01-01T00:00:00Z', 'FREQ=DAILY', 1000).length, 1000);
  for (const bad of [0, 1001, 1.5]) assert.throws(() => expandRRule('2026-01-01T00:00:00Z', 'FREQ=DAILY', bad), RangeError);
  for (const bad of ['2026-01-01 00:00:00', '2026-02-30T00:00:00Z', '2026-01-01T00:00:00+00:00']) assert.throws(() => expandRRule(bad, 'FREQ=DAILY'), RangeError, bad);
  assert.deepEqual(expandRRule('9999-12-30T00:00:00Z', 'FREQ=DAILY'), ['9999-12-30T00:00:00Z', '9999-12-31T00:00:00Z']);
});
