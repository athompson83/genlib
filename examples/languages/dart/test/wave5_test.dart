// SPDX-License-Identifier: Apache-2.0
// Wave 5 capability checks; every vector comes from the shared wave 5 reference vectors.
import 'package:genlib_validation_example/check_digits.dart';
import 'package:genlib_validation_example/email_address.dart';
import 'package:genlib_validation_example/geometry.dart';
import 'package:genlib_validation_example/iso_duration.dart';
import 'package:genlib_validation_example/polyline.dart';
import 'package:genlib_validation_example/safe_redirect.dart';
import 'package:genlib_validation_example/signed_urls.dart';
import 'package:genlib_validation_example/tile_math.dart';

import 'src/checks.dart';

bool _near(double a, double b, double eps) => (a - b).abs() <= eps;

void runCheckDigitsTests(Checks c) {
  const luhn = [
    ('4539 1488 0343 6467', true), ('79927398713', true), ('79927398710', false), ('0', false),
    ('4539-1488-0343-6468', false), ('12a4', false), ('', false),
  ];
  for (final (s, e) in luhn) {
    c.eq("luhn '$s'", e, luhnValid(s));
  }
  c.eq('luhn check digit 7992739871', '3', luhnCheckDigit('7992739871'));
  c.eq('luhn check digit 453914880343646', '7', luhnCheckDigit('453914880343646'));
  c.throws<FormatException>('luhn check digit non-digit', () => luhnCheckDigit('12a'));
  c.throws<FormatException>('luhn check digit empty', () => luhnCheckDigit(''));
  const iban = [
    ('GB82 WEST 1234 5698 7654 32', true), ('DE89 3704 0044 0532 0130 00', true), ('gb82west12345698765432', true),
    ('GB82 WEST 1234 5698 7654 33', false), ('GB82-WEST', false), ('NO9386011117947', true), ('XX00', false),
  ];
  for (final (s, e) in iban) {
    c.eq("iban '$s'", e, ibanValid(s));
  }
  c.eq('iban format gb', 'GB82 WEST 1234 5698 7654 32', ibanFormat('gb82west12345698765432'));
  c.eq('iban format no', 'NO93 8601 1117 947', ibanFormat('NO9386011117947'));
  c.throws<FormatException>('iban format invalid', () => ibanFormat('GB82 WEST 1234 5698 7654 33'));
  const gtin = [
    ('4006381333931', true), ('036000291452', true), ('96385074', true), ('10614141000415', true),
    ('4006381333932', false), ('12345', false),
  ];
  for (final (s, e) in gtin) {
    c.eq("gtin '$s'", e, gtinValid(s));
  }
  const isbn10 = [('0-306-40615-2', true), ('0-8044-2957-X', true), ('0-306-40615-3', false), ('030640615', false)];
  for (final (s, e) in isbn10) {
    c.eq("isbn10 '$s'", e, isbn10Valid(s));
  }
  const isbn13 = [('978-0-306-40615-7', true), ('979-10-90636-07-1', true), ('978-0-306-40615-8', false), ('4006381333931', false)];
  for (final (s, e) in isbn13) {
    c.eq("isbn13 '$s'", e, isbn13Valid(s));
  }
  c.eq('isbn10 to 13 a', '9780306406157', isbn10To13('0-306-40615-2'));
  c.eq('isbn10 to 13 X', '9780804429573', isbn10To13('080442957X'));
  c.throws<FormatException>('isbn10 to 13 invalid', () => isbn10To13('0-306-40615-3'));
}

void runSignedUrlsTests(Checks c) {
  const secret = 'url-signing-secret';
  const cases = [
    ('/files/report.pdf?user=42', 1790000000, '/files/report.pdf?user=42&expires=1790000000&signature=OBOJTlNq3AuDbND_6J4njKkDIXDMxhx0l0PmWaRbfaU'),
    ('/download/a%20b.zip', 1790003600, '/download/a%20b.zip?expires=1790003600&signature=SafK5ZH-apLeaJ-c1dhzp-kyiS3doOR7ywgvr8WDJOo'),
  ];
  void fails(String name, SignedUrlErrorKind kind, String signed, String s, int now, String prefix) =>
      c.throws<SignedUrlException>(name, () => verifyUrl(signed, s, now), (e) => e.kind == kind && e.message.startsWith(prefix));
  for (final (target, expires, signed) in cases) {
    c.eq('sign $target', signed, signUrl(target, secret, expires));
    var ok = true;
    try {
      verifyUrl(signed, secret, expires);
    } on SignedUrlException {
      ok = false;
    }
    c.check('verify $target at expires', ok);
    fails('expired $target', SignedUrlErrorKind.expired, signed, secret, expires + 1, 'expired');
    fails('path changed $target', SignedUrlErrorKind.badSignature, signed.replaceFirst('/', '/x'), secret, expires, 'bad signature');
    fails('other secret $target', SignedUrlErrorKind.badSignature, signed, '${secret}x', expires, 'bad signature');
    final last = signed[signed.length - 1];
    fails('signature char changed $target', SignedUrlErrorKind.badSignature, '${signed.substring(0, signed.length - 1)}${last == 'A' ? 'B' : 'A'}', secret,
        expires, 'bad signature');
    final at = signed.lastIndexOf('&signature=');
    fails('signature removed $target', SignedUrlErrorKind.malformed, signed.substring(0, at), secret, expires, 'malformed');
    fails('duplicate expires $target', SignedUrlErrorKind.malformed, '${signed.substring(0, at)}&expires=1${signed.substring(at)}', secret, expires,
        'malformed');
    fails('non-decimal expires $target', SignedUrlErrorKind.malformed, signed.replaceFirst('expires=$expires', 'expires=${expires}x'), secret, expires,
        'malformed');
  }
  fails('short signature', SignedUrlErrorKind.malformed, '/a?expires=1&signature=abc', secret, 0, 'malformed');
  c.throws<ArgumentError>('sign empty secret', () => signUrl('/a', '', 1));
  c.throws<ArgumentError>('sign existing expires', () => signUrl('/a?expires=5', secret, 1));
  c.throws<ArgumentError>('sign existing signature', () => signUrl('/a?x=1&signature', secret, 1));
  c.throws<ArgumentError>('sign fragment', () => signUrl('/a#b', secret, 1));
  c.throws<ArgumentError>('sign absolute', () => signUrl('https://ex.com/a', secret, 1));
  c.throws<ArgumentError>('verify empty secret', () => verifyUrl(cases[0].$3, '', 0));
}

void runPolylineTests(Checks c) {
  const google = [(38.5, -120.2), (40.7, -120.95), (43.252, -126.453)];
  const p6 = [(47.6062, -122.3321), (47.6205, -122.3493)];
  c.eq('polyline google', '_p~iF~ps|U_ulLnnqC_mqNvxq`@', encodePolyline(google));
  c.eq('polyline precision 6', 'ozsxyAf{pihFw|Z~q`@', encodePolyline(p6, precision: 6));
  c.eq('polyline empty encode', '', encodePolyline(const []));
  c.eq('polyline empty decode', 0, decodePolyline('').length);
  for (final (pts, text, precision) in [(google, '_p~iF~ps|U_ulLnnqC_mqNvxq`@', 5), (p6, 'ozsxyAf{pihFw|Z~q`@', 6)]) {
    final decoded = decodePolyline(text, precision: precision);
    final rt = decodePolyline(encodePolyline(pts, precision: precision), precision: precision);
    var ok = decoded.length == pts.length && rt.length == pts.length;
    for (var i = 0; ok && i < pts.length; i++) {
      final eps = 0.5 / (precision == 5 ? 1e5 : 1e6) + 1e-12;
      ok = _near(decoded[i].$1, pts[i].$1, eps) && _near(decoded[i].$2, pts[i].$2, eps) && _near(rt[i].$1, pts[i].$1, eps) && _near(rt[i].$2, pts[i].$2, eps);
    }
    c.check('polyline decode/round trip $text', ok);
  }
  c.eq('polyline halves round away from zero', 'A@CB', encodePolyline(const [(0.5, -0.5), (2.5, -2.5)], precision: 0));
  c.throws<FormatException>('polyline bad char', () => decodePolyline('_p~iF ps|U'));
  c.throws<FormatException>('polyline truncated chunk', () => decodePolyline('_p~iF~ps|'));
  c.throws<FormatException>('polyline lat without lon', () => decodePolyline('_p~iF'));
  c.throws<RangeError>('polyline lat 91', () => encodePolyline(const [(91.0, 0.0)]));
  c.throws<RangeError>('polyline precision 11', () => encodePolyline(google, precision: 11));
}

void runTileMathTests(Checks c) {
  const tiles = [
    (-122.4194, 37.7749, 12, 655, 1583), (0.0, 0.0, 0, 0, 0), (2.3522, 48.8566, 15, 16598, 11273),
    (179.9999, -89.9, 3, 7, 7), (-180.0, 85.1, 2, 0, 0),
  ];
  for (final (lon, lat, z, x, y) in tiles) {
    final t = lonLatToTile(lon, lat, z);
    c.check('tile $lon,$lat z$z', t.x == x && t.y == y);
  }
  const bounds = [
    (0, 0, 0, [-180.0, -85.0511287798066, 180.0, 85.0511287798066]),
    (655, 1583, 12, [-122.431640625, 37.718590325588146, -122.34375, 37.78808138412046]),
    (1, 1, 1, [0.0, -85.0511287798066, 180.0, 0.0]),
  ];
  for (final (x, y, z, e) in bounds) {
    final b = tileBounds(x, y, z);
    c.check('bounds $x/$y/$z', _near(b.west, e[0], 1e-9) && _near(b.south, e[1], 1e-9) && _near(b.east, e[2], 1e-9) && _near(b.north, e[3], 1e-9));
  }
  const quadkeys = [(3, 5, 3, '213'), (655, 1583, 12, '023010203333'), (0, 0, 1, '0')];
  for (final (x, y, z, key) in quadkeys) {
    c.eq('quadkey $x/$y/$z', key, tileToQuadkey(x, y, z));
    final t = quadkeyToTile(key);
    c.check('quadkey round trip $key', t.x == x && t.y == y && t.zoom == z);
  }
  final root = quadkeyToTile('');
  c.check('quadkey empty is zoom 0', root.x == 0 && root.y == 0 && root.zoom == 0);
  const mercator = [
    (0.0, 0.0, 0.0, -7.081154551613622e-10),
    (-122.4194, 37.7749, -13627665.271218073, 4547675.354340557),
    (180.0, 85.05112877980659, 20037508.342789244, 20037508.342789244),
  ];
  for (final (lon, lat, x, y) in mercator) {
    final m = lonLatToMercator(lon, lat);
    c.check('mercator $lon,$lat', _near(m.x, x, 1e-6) && _near(m.y, y, 1e-6));
  }
  c.throws<RangeError>('tile zoom 25', () => lonLatToTile(0, 0, 25));
  c.throws<RangeError>('tile zoom -1', () => lonLatToTile(0, 0, -1));
  c.throws<RangeError>('tile lon NaN', () => lonLatToTile(double.nan, 0, 1));
  c.throws<RangeError>('tile lon 181', () => lonLatToTile(181, 0, 1));
  c.throws<RangeError>('bounds x out of range', () => tileBounds(2, 0, 1));
  c.throws<RangeError>('bounds y negative', () => tileBounds(0, -1, 1));
  c.throws<FormatException>('quadkey digit 4', () => quadkeyToTile('0124'));
  c.throws<RangeError>('mercator lat 86', () => lonLatToMercator(0, 86));
}

void runEmailAddressTests(Checks c) {
  final a63 = 'a' * 63;
  final valid = [
    ('user@example.com', true), ('first.last+tag@sub.Example.CO.uk', true), ("o'brien@example.ie", true), ('a@b', true),
    ('user@-example.com', false), ('user@example-.com', false), ('user@exa_mple.com', false), ('user example@example.com', false),
    ('user@@example.com', false), ('@example.com', false), ('user@', false), ('user@example..com', false), ('user.@example.com', true),
    ('ünïcode@example.com', false), ('${'x' * 64}@example.com', true), ('${'x' * 65}@example.com', false),
    ('u@$a63.$a63.$a63.${'b' * 59}', true), ('u@$a63.$a63.$a63.${'b' * 61}', false), ('user@${'a' * 64}.com', false),
  ];
  for (final (s, e) in valid) {
    c.eq("email '${s.length > 40 ? '${s.substring(0, 40)}...(${s.length})' : s}'", e, emailValid(s));
  }
  c.eq('email trailing newline rejected', false, emailValid('user@example.com\n'));
  c.eq('email normalize', 'Mixed.Case@example.com', emailNormalize('  Mixed.Case@Example.COM '));
  c.throws<FormatException>('email normalize invalid', () => emailNormalize('not an email'));
}

void runIsoDurationTests(Checks c) {
  const parse = [
    ('P1Y2M3DT4H5M6S', IsoDuration(years: 1, months: 2, days: 3, hours: 4, minutes: 5, milliseconds: 6000)),
    ('PT1H30M', IsoDuration(hours: 1, minutes: 30)),
    ('P2W', IsoDuration(weeks: 2)),
    ('PT0.5S', IsoDuration(milliseconds: 500)),
    ('PT36H', IsoDuration(hours: 36)),
    ('P0D', IsoDuration()),
    ('PT1.250S', IsoDuration(milliseconds: 1250)),
  ];
  for (final (s, e) in parse) {
    c.eq('duration parse $s', e, parseDuration(s));
  }
  for (final bad in ['P', 'PT', '1D', 'P1H', 'PT1D', 'P-1D', 'PT1.2345S', 'P1.5D', 'p1d', 'P1DT', '']) {
    c.throws<FormatException>("duration invalid '$bad'", () => parseDuration(bad));
  }
  c.throws<FormatException>('duration overflow', () => parseDuration('P99999999999999999999D'));
  const ms = [('PT1H30M', 5400000), ('P2W', 1209600000), ('P1DT0.5S', 86400500), ('PT36H', 129600000)];
  for (final (s, e) in ms) {
    c.eq('duration ms $s', e, durationMilliseconds(parseDuration(s)));
  }
  for (final s in ['P1Y', 'P1M']) {
    c.throws<ArgumentError>('duration not exact $s', () => durationMilliseconds(parseDuration(s)));
  }
  c.throws<RangeError>('duration ms overflow', () => durationMilliseconds(parseDuration('P9999999999999999W')));
  const format = [(0, 'PT0S'), (5400000, 'PT1H30M'), (90061001, 'P1DT1H1M1.001S'), (500, 'PT0.5S'), (129600000, 'P1DT12H'), (1209600000, 'P14D')];
  for (final (n, e) in format) {
    c.eq('duration format $n', e, formatDuration(n));
  }
  c.eq('duration format trims zeros', 'PT1.25S', formatDuration(1250));
  c.throws<RangeError>('duration format negative', () => formatDuration(-1));
}

void runGeometryTests(Checks c) {
  const square = [(0.0, 0.0), (4.0, 0.0), (4.0, 4.0), (0.0, 4.0)];
  const concave = [(0.0, 0.0), (6.0, 0.0), (6.0, 6.0), (3.0, 3.0), (0.0, 6.0)];
  const pip = [
    (square, (2.0, 2.0), true), (square, (5.0, 2.0), false), (square, (4.0, 2.0), true), (square, (0.0, 0.0), true),
    (square, (2.0, 4.000001), false), (concave, (3.0, 4.0), false), (concave, (3.0, 2.0), true), (concave, (1.0, 5.0), true),
    (concave, (3.0, 3.0), true),
  ];
  for (final (ring, p, e) in pip) {
    c.eq('pip ${ring.length} $p', e, pointInPolygon(p, ring));
  }
  c.eq('pip closed ring', true, pointInPolygon((2.0, 2.0), [...square, square.first]));
  c.eq('area square', 16.0, signedArea(square));
  c.eq('area reversed', -16.0, signedArea(square.reversed.toList()));
  c.eq('area concave', 27.0, signedArea(concave));
  final cs = centroid(square), cc = centroid(concave);
  c.check('centroid square', _near(cs.$1, 2.0, 1e-9) && _near(cs.$2, 2.0, 1e-9));
  c.check('centroid concave', _near(cc.$1, 3.0, 1e-9) && _near(cc.$2, 2.3333333333333335, 1e-9));
  c.throws<ArgumentError>('centroid zero area', () => centroid(const [(0.0, 0.0), (1.0, 1.0), (2.0, 2.0)]));
  c.throws<ArgumentError>('ring too short', () => signedArea(const [(0.0, 0.0), (1.0, 1.0)]));
  const line = [(0.0, 0.0), (1.0, 0.1), (2.0, -0.1), (3.0, 5.0), (4.0, 6.0), (5.0, 7.0), (6.0, 8.1), (7.0, 9.0), (8.0, 9.0), (9.0, 9.0)];
  const simplified = [
    (line, 1.0, [(0.0, 0.0), (2.0, -0.1), (3.0, 5.0), (7.0, 9.0), (9.0, 9.0)]),
    (line, 0.05, [(0.0, 0.0), (1.0, 0.1), (2.0, -0.1), (3.0, 5.0), (6.0, 8.1), (7.0, 9.0), (9.0, 9.0)]),
    ([(0.0, 0.0), (5.0, 5.0)], 1.0, [(0.0, 0.0), (5.0, 5.0)]),
  ];
  for (final (pts, tol, e) in simplified) {
    c.eq('simplify ${pts.length} tol $tol', e.join(' '), simplify(pts, tol).join(' '));
  }
  c.throws<RangeError>('simplify negative tolerance', () => simplify(line, -1));
  const areas = [
    ([(0.0, 0.0), (1.0, 0.0), (1.0, 1.0), (0.0, 1.0)], 12391399902.070992),
    ([(-0.13, 51.5), (-0.12, 51.5), (-0.12, 51.51), (-0.13, 51.51)], 771337.3090775362),
  ];
  for (final (ring, e) in areas) {
    final a = ringAreaSquareMeters(ring);
    c.check('ring area $e', ((a - e) / e).abs() <= 1e-9);
  }
}

void runSafeRedirectTests(Checks c) {
  const allowed = ['https://app.example.com', 'https://accounts.example.com:8443'];
  const cases = [
    ('/dashboard?tab=1#top', '/dashboard?tab=1#top'), ('//evil.com/x', '/'), (r'/\evil.com', '/'),
    ('https://app.example.com/settings', 'https://app.example.com/settings'), ('HTTPS://APP.EXAMPLE.COM:443/a', 'HTTPS://APP.EXAMPLE.COM:443/a'),
    ('https://app.example.com.evil.com/', '/'), ('https://user@app.example.com/', '/'), ('http://app.example.com/', '/'),
    ('https://accounts.example.com:8443/login', 'https://accounts.example.com:8443/login'), ('https://accounts.example.com/login', '/'),
    ('javascript:alert(1)', '/'), ('/ok path', '/'), ('dashboard', '/'), ('', '/'), ('/\t/evil.com', '/'), ('https://app.example.com:99999/', '/'),
  ];
  for (final (target, e) in cases) {
    c.eq("redirect '$target'", e, safeRedirect(target, allowed));
  }
  c.eq('redirect custom fallback', '/home', safeRedirect('//evil.com', allowed, fallback: '/home'));
  c.eq('redirect too long', '/', safeRedirect('/${'a' * 2048}', allowed));
  c.eq('redirect DEL', '/', safeRedirect('/a\u007fb', allowed));
  c.eq('redirect double dot host', '/', safeRedirect('https://app..example.com/', const ['https://app..example.com']));
}

void main() {
  final c = Checks('wave5');
  runCheckDigitsTests(c);
  runSignedUrlsTests(c);
  runPolylineTests(c);
  runTileMathTests(c);
  runEmailAddressTests(c);
  runIsoDurationTests(c);
  runGeometryTests(c);
  runSafeRedirectTests(c);
  c.finish();
}
