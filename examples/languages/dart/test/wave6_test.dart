// SPDX-License-Identifier: Apache-2.0
// Wave 6 capability checks; every vector comes from the shared wave 6 reference vectors (caps6 ref.py).
import 'package:genlib_validation_example/content_negotiation.dart';
import 'package:genlib_validation_example/cookies.dart';
import 'package:genlib_validation_example/http_conditional.dart';
import 'package:genlib_validation_example/http_range.dart';
import 'package:genlib_validation_example/ip_cidr.dart';
import 'package:genlib_validation_example/rrule.dart';
import 'package:genlib_validation_example/string_similarity.dart';
import 'package:genlib_validation_example/url_normalize.dart';

import 'src/checks.dart';

bool _near(double a, double b, double eps) => (a - b).abs() <= eps;
bool _listEq<T>(List<T> a, List<T> b) => a.length == b.length && [for (var i = 0; i < a.length; i++) a[i] == b[i]].every((x) => x);

void runIpCidrTests(Checks c) {
  const canonical = [
    ('192.168.1.1', '192.168.1.1'),
    ('2001:DB8:0:0:0:0:0:1', '2001:db8::1'),
    ('2001:db8::0:1', '2001:db8::1'),
    ('::', '::'),
    ('::1', '::1'),
    ('2001:db8:0:0:1:0:0:1', '2001:db8::1:0:0:1'),
    ('2001:0db8:0000:0000:0000:ff00:0042:8329', '2001:db8::ff00:42:8329'),
    ('fe80::1:0:0:0', 'fe80::1:0:0:0'),
    ('::ffff:192.0.2.128', '::ffff:192.0.2.128'),
    ('::ffff:c000:280', '::ffff:192.0.2.128'),
    ('1:0:0:2:0:0:0:3', '1:0:0:2::3'),
    ('64:ff9b::198.51.100.7', '64:ff9b::c633:6407'),
  ];
  for (final (text, e) in canonical) {
    c.eq('ip canonical $text', e, canonicalIp(text));
  }
  const invalid = [
    '256.1.1.1',
    '01.2.3.4',
    '1.2.3',
    '1.2.3.4.5',
    '1:2:3:4:5:6:7:8:9',
    '1::2::3',
    '::g',
    'fe80::1%eth0',
    '[::1]',
    '',
    ' 1.2.3.4',
    '1.2.3.4/24',
    '12345::',
  ];
  for (final bad in invalid) {
    c.throws<FormatException>("ip invalid '$bad'", () => parseIp(bad));
  }
  c.eq('ip parse v4 length', 4, parseIp('192.168.1.1').length);
  c.eq('ip parse v6 length', 16, parseIp('::1').length);
  const contains = [
    ('10.0.0.0/8', '10.255.1.2', true),
    ('10.0.0.0/8', '11.0.0.1', false),
    ('192.168.1.0/24', '192.168.1.255', true),
    ('0.0.0.0/0', '8.8.8.8', true),
    ('2001:db8::/32', '2001:db8:ffff::1', true),
    ('2001:db8::/32', '2001:db9::1', false),
    ('10.0.0.0/8', '::ffff:10.0.0.1', false),
    ('::/0', '::1', true),
    ('192.168.1.1/32', '192.168.1.1', true),
  ];
  for (final (cidr, ip, e) in contains) {
    c.eq('cidr $cidr contains $ip', e, cidrContains(cidr, ip));
  }
  const invalidCidr = ['10.0.0.1/8', '10.0.0.0/33', '10.0.0.0', '10.0.0.0/08', '2001:db8::/129'];
  for (final bad in invalidCidr) {
    c.throws<FormatException>("cidr invalid '$bad'", () => cidrContains(bad, '10.0.0.1'));
  }
  const public = [
    ('8.8.8.8', true),
    ('10.1.2.3', false),
    ('127.0.0.1', false),
    ('169.254.169.254', false),
    ('100.64.0.1', false),
    ('172.31.255.255', false),
    ('172.32.0.1', true),
    ('192.168.0.10', false),
    ('0.0.0.0', false),
    ('255.255.255.255', false),
    ('224.0.0.1', false),
    ('2606:4700:4700::1111', true),
    ('::1', false),
    ('fd00::1', false),
    ('fe80::1', false),
    ('::ffff:127.0.0.1', false),
    ('::ffff:8.8.8.8', true),
    ('64:ff9b::a00:1', false),
    ('2001:db8::1', false),
    ('ff02::1', false),
  ];
  for (final (ip, e) in public) {
    c.eq('public $ip', e, isPublicIp(ip));
  }
}

void runHttpRangeTests(Checks c) {
  const cases = <(String?, String)>[
    ('bytes=0-499', 'ranges 0-499'),
    ('bytes=500-999', 'ranges 500-999'),
    ('bytes=-500', 'ranges 9500-9999'),
    ('bytes=9500-', 'ranges 9500-9999'),
    ('bytes=0-0,-1', 'ranges 0-0 9999-9999'),
    ('bytes= 0-1 , 5-6', 'ranges 0-1 5-6'),
    ('BYTES=0-99', 'ranges 0-99'),
    ('bytes=9999-20000', 'ranges 9999-9999'),
    ('bytes=10000-', 'unsatisfiable bytes */10000'),
    ('bytes=-0', 'unsatisfiable bytes */10000'),
    ('bytes=-20000', 'ranges 0-9999'),
    ('bytes=500-400', 'none'),
    ('items=0-1', 'none'),
    ('bytes=', 'none'),
    ('bytes=0-1,', 'none'),
    ('bytes=abc', 'none'),
    ('bytes=1-2-3', 'none'),
    (null, 'none'),
    ('bytes=10000-10001,20000-', 'unsatisfiable bytes */10000'),
  ];
  for (final (h, e) in cases) {
    c.eq("range '$h'", e, parseRange(h, 10000).toString());
  }
  const emptyFile = [('bytes=0-', 'unsatisfiable bytes */0'), ('bytes=-5', 'unsatisfiable bytes */0')];
  for (final (h, e) in emptyFile) {
    c.eq("range empty file '$h'", e, parseRange(h, 0).toString());
  }
  c.eq('content range', 'bytes 0-499/10000', contentRange(0, 499, 10000));
  c.eq('range 101 specs', 'none', parseRange('bytes=${List.filled(101, '0-0').join(',')}', 10).toString());
  c.eq('range 100 specs', 100, parseRange('bytes=${List.filled(100, '0-0').join(',')}', 10).ranges.length);
  c.eq('range huge size', 'ranges 9223372036854775806-9223372036854775806', parseRange('bytes=-1', 9223372036854775807).toString());
}

void runContentNegotiationTests(Checks c) {
  const mediaAvailable = ['application/json', 'text/html', 'text/csv'];
  const media = <(String?, String?)>[
    ('application/json', 'application/json'),
    ('text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8', 'text/html'),
    ('text/*;q=0.5, application/json;q=0.4', 'text/html'),
    ('*/*', 'application/json'),
    ('text/csv;q=0, text/*', 'text/html'),
    ('image/png', null),
    ('application/json;q=0', null),
    ('TEXT/HTML', 'text/html'),
    ('text/html;q=1.5, text/csv', 'text/csv'),
    (null, 'application/json'),
    ('', 'application/json'),
    ('application/*;q=0.2, */*;q=0.1', 'application/json'),
    ('text/html;level=1;q=0.7, text/csv;q=0.7', 'text/html'),
  ];
  for (final (h, e) in media) {
    c.eq("media '$h'", e, negotiateMediaType(h, mediaAvailable));
  }
  const languageAvailable = ['en', 'en-GB', 'fr', 'pt-BR'];
  const language = <(String?, String?)>[
    ('fr-CH, fr;q=0.9, en;q=0.8, de;q=0.7, *;q=0.5', 'fr'),
    ('en-GB', 'en-GB'),
    ('en-US,en;q=0.9', 'en'),
    ('pt', 'pt-BR'),
    ('de', null),
    ('de, *;q=0.1', 'en'),
    ('en;q=0, *', 'fr'),
    ('PT-br', 'pt-BR'),
    (null, 'en'),
    ('zh-Hant-TW', null),
  ];
  for (final (h, e) in language) {
    c.eq("language '$h'", e, negotiateLanguage(h, languageAvailable));
  }
}

void runHttpConditionalTests(Checks c) {
  const parse = [('"a", W/"b" ,"c"', '"a"|W/"b"|"c"'), ('*', '*'), (' * ', '*'), ('W/"x", bogus, "y"', 'W/"x"|"y"'), ('""', '""')];
  for (final (h, e) in parse) {
    final tags = parseEtags(h);
    c.eq("etag parse '$h'", e, tags.isWildcard ? '*' : tags.tags.join('|'));
  }
  final cases = <(String, int, int Function())>[
    (
      '{"method": "GET", "etag": "\\"v2\\"", "if_none_match": "\\"v2\\""}',
      304,
      () => evaluateConditional(method: 'GET', etag: '"v2"', ifNoneMatch: '"v2"'),
    ),
    (
      '{"method": "GET", "etag": "\\"v2\\"", "if_none_match": "W/\\"v2\\""}',
      304,
      () => evaluateConditional(method: 'GET', etag: '"v2"', ifNoneMatch: 'W/"v2"'),
    ),
    (
      '{"method": "GET", "etag": "W/\\"v2\\"", "if_none_match": "\\"v1\\", \\"v2\\""}',
      304,
      () => evaluateConditional(method: 'GET', etag: 'W/"v2"', ifNoneMatch: '"v1", "v2"'),
    ),
    (
      '{"method": "GET", "etag": "\\"v2\\"", "if_none_match": "\\"v1\\""}',
      200,
      () => evaluateConditional(method: 'GET', etag: '"v2"', ifNoneMatch: '"v1"'),
    ),
    (
      '{"method": "HEAD", "etag": "\\"v2\\"", "if_none_match": "*"}',
      304,
      () => evaluateConditional(method: 'HEAD', etag: '"v2"', ifNoneMatch: '*'),
    ),
    (
      '{"method": "PUT", "etag": "\\"v2\\"", "if_none_match": "*"}',
      412,
      () => evaluateConditional(method: 'PUT', etag: '"v2"', ifNoneMatch: '*'),
    ),
    ('{"method": "PUT", "if_none_match": "*"}', 200, () => evaluateConditional(method: 'PUT', ifNoneMatch: '*')),
    (
      '{"method": "PUT", "etag": "\\"v2\\"", "if_match": "\\"v2\\""}',
      200,
      () => evaluateConditional(method: 'PUT', etag: '"v2"', ifMatch: '"v2"'),
    ),
    (
      '{"method": "PUT", "etag": "\\"v2\\"", "if_match": "\\"v1\\""}',
      412,
      () => evaluateConditional(method: 'PUT', etag: '"v2"', ifMatch: '"v1"'),
    ),
    (
      '{"method": "PUT", "etag": "W/\\"v2\\"", "if_match": "W/\\"v2\\""}',
      412,
      () => evaluateConditional(method: 'PUT', etag: 'W/"v2"', ifMatch: 'W/"v2"'),
    ),
    ('{"method": "DELETE", "if_match": "*"}', 412, () => evaluateConditional(method: 'DELETE', ifMatch: '*')),
    (
      '{"method": "DELETE", "etag": "\\"a\\"", "if_match": "*"}',
      200,
      () => evaluateConditional(method: 'DELETE', etag: '"a"', ifMatch: '*'),
    ),
    (
      '{"method": "GET", "etag": "\\"v2\\"", "last_modified": 1792567680, "if_modified_since": "Wed, 21 Oct 2026 07:28:00 GMT"}',
      304,
      () => evaluateConditional(method: 'GET', etag: '"v2"', lastModified: 1792567680, ifModifiedSince: 'Wed, 21 Oct 2026 07:28:00 GMT'),
    ),
    (
      '{"method": "GET", "etag": "\\"v2\\"", "last_modified": 1792567680, "if_modified_since": "Tue, 20 Oct 2026 07:28:00 GMT"}',
      200,
      () => evaluateConditional(method: 'GET', etag: '"v2"', lastModified: 1792567680, ifModifiedSince: 'Tue, 20 Oct 2026 07:28:00 GMT'),
    ),
    (
      '{"method": "GET", "etag": "\\"v2\\"", "last_modified": 1792567680, "if_none_match": "\\"v1\\"", "if_modified_since": "Wed, 21 Oct 2026 07:28:00 GMT"}',
      200,
      () => evaluateConditional(
        method: 'GET',
        etag: '"v2"',
        lastModified: 1792567680,
        ifNoneMatch: '"v1"',
        ifModifiedSince: 'Wed, 21 Oct 2026 07:28:00 GMT',
      ),
    ),
    (
      '{"method": "POST", "last_modified": 1792567680, "if_modified_since": "Wed, 21 Oct 2026 07:28:00 GMT"}',
      200,
      () => evaluateConditional(method: 'POST', lastModified: 1792567680, ifModifiedSince: 'Wed, 21 Oct 2026 07:28:00 GMT'),
    ),
    (
      '{"method": "PUT", "last_modified": 1792567680, "if_unmodified_since": "Tue, 20 Oct 2026 07:28:00 GMT"}',
      412,
      () => evaluateConditional(method: 'PUT', lastModified: 1792567680, ifUnmodifiedSince: 'Tue, 20 Oct 2026 07:28:00 GMT'),
    ),
    (
      '{"method": "PUT", "last_modified": 1792567680, "if_unmodified_since": "Wed, 21 Oct 2026 07:28:00 GMT"}',
      200,
      () => evaluateConditional(method: 'PUT', lastModified: 1792567680, ifUnmodifiedSince: 'Wed, 21 Oct 2026 07:28:00 GMT'),
    ),
    (
      '{"method": "GET", "last_modified": 1792567680, "if_modified_since": "Wednesday, 21-Oct-26 07:28:00 GMT"}',
      200,
      () => evaluateConditional(method: 'GET', lastModified: 1792567680, ifModifiedSince: 'Wednesday, 21-Oct-26 07:28:00 GMT'),
    ),
    (
      '{"method": "GET", "etag": "\\"v2\\"", "if_none_match": "v2"}',
      200,
      () => evaluateConditional(method: 'GET', etag: '"v2"', ifNoneMatch: 'v2'),
    ),
    (
      '{"method": "PUT", "etag": "\\"v2\\"", "if_match": "\\"v2\\"", "if_unmodified_since": "Tue, 20 Oct 2026 07:28:00 GMT"}',
      200,
      () => evaluateConditional(method: 'PUT', etag: '"v2"', ifMatch: '"v2"', ifUnmodifiedSince: 'Tue, 20 Oct 2026 07:28:00 GMT'),
    ),
  ];
  for (final (name, e, run) in cases) {
    c.eq('conditional $name', e, run());
  }
  c.eq('http date format', 'Wed, 21 Oct 2026 07:28:00 GMT', formatHttpDate(1792567680));
  c.eq('http date parse', 1792567680, parseHttpDate('Wed, 21 Oct 2026 07:28:00 GMT'));
  c.eq('http date wrong weekday', null, parseHttpDate('Thu, 21 Oct 2026 07:28:00 GMT'));
  c.eq('http date epoch', 'Thu, 01 Jan 1970 00:00:00 GMT', formatHttpDate(0));
}

void runCookiesTests(Checks c) {
  final serialize = <(String, String, String Function())>[
    (
      'sid',
      'sid=abc123; Path=/; Secure; HttpOnly; SameSite=Lax',
      () => serializeCookie('sid', 'abc123', path: '/', secure: true, httpOnly: true, sameSite: 'Lax'),
    ),
    (
      '__Host-session',
      '__Host-session=x.y.z; Max-Age=3600; Path=/; Secure; HttpOnly; SameSite=Strict',
      () => serializeCookie('__Host-session', 'x.y.z', path: '/', secure: true, httpOnly: true, sameSite: 'Strict', maxAge: 3600),
    ),
    (
      'theme',
      'theme=dark; Max-Age=0; Expires=Wed, 21 Oct 2026 07:28:00 GMT; Domain=example.com; Path=/app',
      () => serializeCookie('theme', 'dark', maxAge: 0, expires: 1792567680, domain: 'Example.COM', path: '/app'),
    ),
    (
      'embed',
      'embed=1; Secure; SameSite=None; Partitioned',
      () => serializeCookie('embed', '1', secure: true, sameSite: 'None', partitioned: true),
    ),
    ('empty', 'empty=', () => serializeCookie('empty', '')),
  ];
  for (final (name, e, run) in serialize) {
    c.eq('cookie serialize $name', e, run());
  }
  final invalid = <(String, void Function())>[
    ('{"name": "bad name", "value": "v"}', () => serializeCookie('bad name', 'v')),
    ('{"name": "n", "value": "a;b"}', () => serializeCookie('n', 'a;b')),
    ('{"name": "n", "value": "a b"}', () => serializeCookie('n', 'a b')),
    ('{"name": "n", "value": "a\\"b"}', () => serializeCookie('n', 'a"b')),
    ('{"name": "n", "value": "v", "sameSite": "None"}', () => serializeCookie('n', 'v', sameSite: 'None')),
    ('{"name": "__Secure-x", "value": "v"}', () => serializeCookie('__Secure-x', 'v')),
    ('{"name": "__Host-x", "value": "v", "secure": true, "path": "/a"}', () => serializeCookie('__Host-x', 'v', secure: true, path: '/a')),
    (
      '{"name": "__Host-x", "value": "v", "secure": true, "path": "/", "domain": "example.com"}',
      () => serializeCookie('__Host-x', 'v', secure: true, path: '/', domain: 'example.com'),
    ),
    ('{"name": "n", "value": "v", "path": "relative"}', () => serializeCookie('n', 'v', path: 'relative')),
    ('{"name": "n", "value": "v", "sameSite": "lax"}', () => serializeCookie('n', 'v', sameSite: 'lax')),
    ('{"name": "n", "value": "v", "partitioned": true}', () => serializeCookie('n', 'v', partitioned: true)),
    ('{"name": "n", "value": "v", "maxAge": -1}', () => serializeCookie('n', 'v', maxAge: -1)),
    ('{"name": "", "value": "v"}', () => serializeCookie('', 'v')),
  ];
  for (final (name, run) in invalid) {
    c.throws<ArgumentError>('cookie invalid $name', run);
  }
  const parse = <(String, List<(String, String)>)>[
    ('sid=abc; theme=dark', [('sid', 'abc'), ('theme', 'dark')]),
    (' a = 1 ;b=2;; c="quoted value" ;flag;d==x', [('a', '1'), ('b', '2'), ('c', 'quoted value'), ('d', '=x')]),
    ('a=1; a=2', [('a', '1'), ('a', '2')]),
    ('', []),
  ];
  for (final (h, e) in parse) {
    c.check("cookie parse '$h'", _listEq(e, parseCookieHeader(h)));
  }
}

void runUrlNormalizeTests(Checks c) {
  const dots = [
    ('/a/b/c/./../../g', '/a/g'),
    ('mid/content=5/../6', 'mid/6'),
    ('/../a', '/a'),
    ('/a/./b/.', '/a/b/'),
    ('/a/b/..', '/a/'),
    ('.', ''),
    ('../x', 'x'),
    ('/a//b/../c', '/a//c'),
  ];
  for (final (p, e) in dots) {
    c.eq('remove dot segments $p', e, removeDotSegments(p));
  }
  const normalize = [
    ('HTTP://Example.COM:80/%7Euser/./a/../b?q=%2f', 'http://example.com/~user/b?q=%2F'),
    ('https://example.com', 'https://example.com/'),
    ('https://example.com:443/a%2Fb#frag', 'https://example.com/a%2Fb'),
    ('http://example.com:8080/A/B/../C?', 'http://example.com:8080/A/C'),
    ('https://[2001:DB8::0:1]:8443/x', 'https://[2001:db8::1]:8443/x'),
    ('https://example.com/%e2%82%ac', 'https://example.com/%E2%82%AC'),
    ('http://example.com:/p', 'http://example.com/p'),
    ('https://EXAMPLE.com/a%20b', 'https://example.com/a%20b'),
  ];
  for (final (u, e) in normalize) {
    c.eq('normalize $u', e, normalizeUrl(u));
  }
  const invalid = [
    'ftp://example.com/',
    'https://user@example.com/',
    'https://exa mple.com/',
    '//example.com/',
    'https://example.com/%zz',
    'https://example.com:99999/',
    'example.com/path',
    'https://[::g]/',
  ];
  for (final bad in invalid) {
    c.throws<FormatException>("normalize invalid '$bad'", () => normalizeUrl(bad));
  }
}

void runStringSimilarityTests(Checks c) {
  const pairs = [
    ('kitten', 'sitting', 3, 3, 0.746031746031746, 0.746031746031746, 0.5714285714285714),
    ('flaw', 'lawn', 2, 2, 0.8333333333333334, 0.8333333333333334, 0.5),
    ('', '', 0, 0, 1.0, 1.0, 1.0),
    ('', 'abc', 3, 3, 0.0, 0.0, 0.0),
    ('abc', 'abc', 0, 0, 1.0, 1.0, 1.0),
    ('ca', 'abc', 3, 3, 0.0, 0.0, 0.0),
    ('MARTHA', 'MARHTA', 2, 1, 0.9444444444444445, 0.9611111111111111, 0.6666666666666667),
    ('DIXON', 'DICKSONX', 4, 4, 0.7666666666666666, 0.8133333333333332, 0.5),
    ('DWAYNE', 'DUANE', 2, 2, 0.8222222222222223, 0.8400000000000001, 0.6666666666666667),
    ('caf\u{E9}', 'cafe', 1, 1, 0.8333333333333334, 0.8833333333333334, 0.75),
    ('na\u{EF}ve', 'naive', 1, 1, 0.8666666666666667, 0.8933333333333333, 0.8),
    ('\u{1F642}ab', 'ab\u{1F642}', 2, 2, 0.0, 0.0, 0.33333333333333337),
    ('JELLYFISH', 'SMELLYFISH', 2, 2, 0.8962962962962964, 0.8962962962962964, 0.8),
  ];
  for (final (a, b, lev, osa, j, jw, ratio) in pairs) {
    c.eq("levenshtein '$a' '$b'", lev, levenshtein(a, b));
    c.eq("osa '$a' '$b'", osa, damerauOsa(a, b));
    c.check("jaro '$a' '$b'", _near(j, jaro(a, b), 1e-12));
    c.check("jaro-winkler '$a' '$b'", _near(jw, jaroWinkler(a, b), 1e-12));
    c.check("ratio '$a' '$b'", _near(ratio, similarityRatio(a, b), 1e-12));
  }
}

void runRRuleTests(Checks c) {
  const cases = [
    (
      '2026-01-31T09:00:00Z',
      'FREQ=MONTHLY;COUNT=5',
      ['2026-01-31T09:00:00Z', '2026-03-31T09:00:00Z', '2026-05-31T09:00:00Z', '2026-07-31T09:00:00Z', '2026-08-31T09:00:00Z'],
    ),
    (
      '2026-10-12T09:30:00Z',
      'FREQ=WEEKLY;BYDAY=MO,WE,FR;COUNT=7',
      [
        '2026-10-12T09:30:00Z',
        '2026-10-14T09:30:00Z',
        '2026-10-16T09:30:00Z',
        '2026-10-19T09:30:00Z',
        '2026-10-21T09:30:00Z',
        '2026-10-23T09:30:00Z',
        '2026-10-26T09:30:00Z',
      ],
    ),
    (
      '2026-10-01T00:00:00Z',
      'FREQ=DAILY;INTERVAL=10;UNTIL=20261115T000000Z',
      ['2026-10-01T00:00:00Z', '2026-10-11T00:00:00Z', '2026-10-21T00:00:00Z', '2026-10-31T00:00:00Z', '2026-11-10T00:00:00Z'],
    ),
    (
      '2026-01-01T12:00:00Z',
      'FREQ=MONTHLY;BYDAY=-1FR;COUNT=4',
      ['2026-01-30T12:00:00Z', '2026-02-27T12:00:00Z', '2026-03-27T12:00:00Z', '2026-04-24T12:00:00Z'],
    ),
    (
      '2026-01-01T12:00:00Z',
      'FREQ=MONTHLY;BYDAY=2TU,4TU;COUNT=6',
      [
        '2026-01-13T12:00:00Z',
        '2026-01-27T12:00:00Z',
        '2026-02-10T12:00:00Z',
        '2026-02-24T12:00:00Z',
        '2026-03-10T12:00:00Z',
        '2026-03-24T12:00:00Z',
      ],
    ),
    (
      '2026-01-15T08:00:00Z',
      'FREQ=MONTHLY;BYMONTHDAY=1,-1;COUNT=6',
      [
        '2026-01-31T08:00:00Z',
        '2026-02-01T08:00:00Z',
        '2026-02-28T08:00:00Z',
        '2026-03-01T08:00:00Z',
        '2026-03-31T08:00:00Z',
        '2026-04-01T08:00:00Z',
      ],
    ),
    ('2028-02-29T00:00:00Z', 'FREQ=YEARLY;COUNT=3', ['2028-02-29T00:00:00Z', '2032-02-29T00:00:00Z', '2036-02-29T00:00:00Z']),
    (
      '2026-03-10T10:00:00Z',
      'FREQ=YEARLY;BYMONTH=3,9;COUNT=5',
      ['2026-03-10T10:00:00Z', '2026-09-10T10:00:00Z', '2027-03-10T10:00:00Z', '2027-09-10T10:00:00Z', '2028-03-10T10:00:00Z'],
    ),
    (
      '2026-10-14T18:00:00Z',
      'FREQ=WEEKLY;INTERVAL=2;BYDAY=TU;COUNT=3',
      ['2026-10-27T18:00:00Z', '2026-11-10T18:00:00Z', '2026-11-24T18:00:00Z'],
    ),
    ('2026-10-14T18:00:00Z', 'FREQ=WEEKLY;COUNT=2', ['2026-10-14T18:00:00Z', '2026-10-21T18:00:00Z']),
    (
      '2026-01-31T09:00:00Z',
      'FREQ=MONTHLY;INTERVAL=2;BYMONTHDAY=31;UNTIL=20261231T235959Z',
      ['2026-01-31T09:00:00Z', '2026-03-31T09:00:00Z', '2026-05-31T09:00:00Z', '2026-07-31T09:00:00Z'],
    ),
  ];
  for (final (start, rule, e) in cases) {
    c.check('rrule $start $rule', _listEq(e, expandRRule(start, rule)));
  }
  const invalid = [
    'FREQ=HOURLY',
    'COUNT=3',
    'FREQ=DAILY;COUNT=2;UNTIL=20261231T000000Z',
    'FREQ=WEEKLY;BYDAY=1MO',
    'FREQ=DAILY;BYDAY=MO',
    'FREQ=MONTHLY;BYMONTHDAY=32',
    'FREQ=MONTHLY;BYSETPOS=1',
    'FREQ=WEEKLY;INTERVAL=0',
    'FREQ=MONTHLY;BYDAY=MO;BYMONTHDAY=1',
    'FREQ=YEARLY;UNTIL=2026-12-31',
    'FREQ=DAILY;FREQ=DAILY',
    'FREQ=WEEKLY;BYDAY=XX',
  ];
  for (final bad in invalid) {
    c.throws<FormatException>("rrule invalid '$bad'", () => expandRRule('2026-01-01T00:00:00Z', bad));
  }
  c.throws<FormatException>('rrule bad dtstart', () => expandRRule('2026-02-30T00:00:00Z', 'FREQ=DAILY'));
  c.throws<RangeError>('rrule limit 0', () => expandRRule('2026-01-01T00:00:00Z', 'FREQ=DAILY', limit: 0));
  c.throws<RangeError>('rrule limit 1001', () => expandRRule('2026-01-01T00:00:00Z', 'FREQ=DAILY', limit: 1001));
  c.eq('rrule default limit 50', 50, expandRRule('2026-01-01T00:00:00Z', 'FREQ=DAILY').length);
  c.eq('rrule limit 3', 3, expandRRule('2026-01-01T00:00:00Z', 'FREQ=DAILY', limit: 3).length);
  c.eq('rrule until before start', 0, expandRRule('2026-01-01T00:00:00Z', 'FREQ=DAILY;UNTIL=20251231T000000Z').length);
}

void main() {
  final c = Checks('wave6');
  runIpCidrTests(c);
  runHttpRangeTests(c);
  runContentNegotiationTests(c);
  runHttpConditionalTests(c);
  runCookiesTests(c);
  runUrlNormalizeTests(c);
  runStringSimilarityTests(c);
  runRRuleTests(c);
  c.finish();
}
