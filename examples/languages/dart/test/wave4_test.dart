// SPDX-License-Identifier: Apache-2.0
import 'dart:math' as math;

import 'package:genlib_validation_example/cron_next.dart';
import 'package:genlib_validation_example/geo.dart';
import 'package:genlib_validation_example/ids.dart';
import 'package:genlib_validation_example/retry_backoff.dart';
import 'package:genlib_validation_example/semver.dart' as semver;
import 'package:genlib_validation_example/token_bucket.dart';
import 'package:genlib_validation_example/wcag_contrast.dart';
import 'package:genlib_validation_example/webhook_signature.dart';

import 'src/checks.dart';

void runIdsTests(Checks c) {
  final random = List<int>.generate(10, (i) => i + 1);
  c.eq('uuid7 vector', '01a0c450-6c7b-7102-8304-05060708090a', uuidV7(1790000000123, random));
  c.eq('ulid vector', '01M3250V3V041061050R3GG28A', ulid(1790000000123, random));
  c.eq('uuid7 zero', '00000000-0000-7000-8000-000000000000', uuidV7(0, List.filled(10, 0)));
  c.eq('ulid max time', '7ZZZZZZZZZZZZZZZZZZZZZZZZZ', ulid((1 << 48) - 1, List.filled(10, 0xff)));
  c.eq('uuid7 time', 1790000000123, uuidV7Time('01a0c450-6c7b-7102-8304-05060708090a'));
  c.eq('uuid7 time upper', 1790000000123, uuidV7Time('01A0C450-6C7B-7102-8304-05060708090A'));
  c.eq('uuid7 zero time', 0, uuidV7Time('00000000-0000-7000-8000-000000000000'));
  c.eq('ulid time', 1790000000123, ulidTime('01M3250V3V041061050R3GG28A'));
  c.eq('ulid time lower', 1790000000123, ulidTime('01m3250v3v041061050r3gg28a'));
  c.eq('ulid max time parse', (1 << 48) - 1, ulidTime('7ZZZZZZZZZZZZZZZZZZZZZZZZZ'));
  c.throws<FormatException>('uuid7 version 4', () => uuidV7Time('01a0c450-6c7b-4102-8304-05060708090a'));
  c.throws<FormatException>('uuid7 bad variant', () => uuidV7Time('01a0c450-6c7b-7102-c304-05060708090a'));
  c.throws<FormatException>('uuid7 short', () => uuidV7Time('01a0c450-6c7b-7102-8304-05060708090'));
  c.throws<FormatException>('uuid7 bad char', () => uuidV7Time('01a0c450-6c7b-7102-8304-05060708090g'));
  c.throws<FormatException>('ulid first char 8', () => ulidTime('80000000000000000000000000'));
  c.throws<FormatException>('ulid bad char U', () => ulidTime('01M3250V3V041061050R3GG28U'));
  c.throws<FormatException>('ulid short', () => ulidTime('01M3250V3V041061050R3GG28'));
  c.throws<RangeError>('uuid7 negative time', () => uuidV7(-1, random));
  c.throws<RangeError>('ulid time 2^48', () => ulid(1 << 48, random));
  c.throws<ArgumentError>('uuid7 9 random bytes', () => uuidV7(0, List.filled(9, 0)));
  c.throws<ArgumentError>('uuid7 byte 256', () => uuidV7(0, [256, ...List.filled(9, 0)]));
  final u1 = newUuidV7(), u2 = newUuidV7();
  c.check('newUuidV7 format',
      RegExp(r'^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$').hasMatch(u1) && u1 != u2);
  final l1 = newUlid(), l2 = newUlid();
  c.check('newUlid format', RegExp(r'^[0-7][0-9A-HJKMNP-TV-Z]{25}$').hasMatch(l1) && l1 != l2);
}

void runRetryBackoffTests(Checks c) {
  c.eq('backoff a0', 50, backoffDelay(0, 100, 10000, 0.5));
  c.eq('backoff a3', 799, backoffDelay(3, 100, 10000, 0.999));
  c.eq('backoff a10', 2500, backoffDelay(10, 100, 10000, 0.25));
  c.eq('backoff a3zero', 0, backoffDelay(3, 100, 10000, 0.0));
  c.eq('backoff huge attempt capped', 5000, backoffDelay(10000, 100, 10000, 0.5));
  c.eq('backoff attempt 62 capped', 3000, backoffDelay(62, 3000, 6000, 0.5));
  c.throws<RangeError>('backoff fraction 1', () => backoffDelay(0, 100, 1000, 1.0));
  c.throws<RangeError>('backoff fraction NaN', () => backoffDelay(0, 100, 1000, double.nan));
  c.throws<RangeError>('backoff negative attempt', () => backoffDelay(-1, 100, 1000, 0.5));
  c.throws<RangeError>('backoff base 0', () => backoffDelay(0, 0, 1000, 0.5));
  c.throws<RangeError>('backoff cap < base', () => backoffDelay(0, 100, 99, 0.5));
  c.eq('retry-after secs', 120000, retryAfterMs('120', 0));
  c.eq('retry-after date', 30000, retryAfterMs('Wed, 21 Oct 2026 07:28:00 GMT', 1792567650000));
  c.eq('retry-after past', 0, retryAfterMs('Wed, 21 Oct 2015 07:28:00 GMT', 1792567650000));
  for (final bad in ['', '-5', '1.5', 'soon', '21 Oct 2026 07:28:00 GMT', 'Wed, 21 Oct 2026 07:28:00 UTC', 'Thu, 21 Oct 2026 07:28:00 GMT', 'Wed, 31 Feb 2026 07:28:00 GMT']) {
    c.eq("retry-after invalid '$bad'", null, retryAfterMs(bad, 0));
  }
  c.throws<RangeError>('retry-after overflow', () => retryAfterMs('99999999999999999', 0));
}

void runTokenBucketTests(Checks c) {
  const steps = [
    (0, 1, true, 4000, 0), (0, 1, true, 3000, 0), (0, 1, true, 2000, 0), (0, 1, true, 1000, 0), (0, 1, true, 0, 0),
    (0, 1, false, 0, 500), (250, 1, false, 500, 250), (500, 1, true, 0, 0), (500, 2, false, 0, 1000), (3000, 5, true, 0, 0),
  ];
  var bucket = newBucket(5, 0);
  c.eq('bucket starts full', 5000, bucket.tokensMilli);
  for (var i = 0; i < steps.length; i++) {
    final (now, cost, allowed, tokensMilli, retry) = steps[i];
    final r = take(bucket, now, cost, 5, 2);
    c.check('bucket step $i', r.allowed == allowed && r.state.tokensMilli == tokensMilli && r.retryAfterMs == retry);
    bucket = r.state;
  }
  final back = take(const BucketState(1000, 5000), 1000, 1, 5, 2);
  c.check('bucket clock backwards adds nothing', back.allowed && back.state.tokensMilli == 0 && back.state.lastMs == 5000);
  c.eq('bucket huge gap refills without overflow', 4000,
      take(const BucketState(0, -9223372036854775807), 9223372036854775807, 1, 5, 9223372036854775807).state.tokensMilli);
  c.eq('bucket huge rate retry', 1, take(const BucketState(0, 0), 0, 1, 5, 9223372036854775807).retryAfterMs);
  c.throws<RangeError>('bucket cost > capacity', () => take(newBucket(5, 0), 0, 6, 5, 2));
  c.throws<RangeError>('bucket rate 0', () => take(newBucket(5, 0), 0, 1, 5, 0));
  c.throws<RangeError>('bucket capacity overflow', () => newBucket(9223372036854775807, 0));
}

void runSemverTests(Checks c) {
  const sorted = ['0.9.9', '1.0.0-alpha', '1.0.0-alpha.1', '1.0.0-alpha.beta', '1.0.0-beta', '1.0.0-beta.2', '1.0.0-beta.11', '1.0.0-rc.1', '1.0.0', '1.0.0+build.5', '2.0.0'];
  const input = ['1.0.0-rc.1', '2.0.0', '1.0.0-beta.11', '1.0.0', '1.0.0-alpha.beta', '0.9.9', '1.0.0-beta', '1.0.0+build.5', '1.0.0-alpha.1', '1.0.0-beta.2', '1.0.0-alpha'];
  // List.sort is not guaranteed stable, so ties fall back to input order explicitly.
  final indexed = [for (var i = 0; i < input.length; i++) (i, semver.parseVersion(input[i]))]
    ..sort((a, b) {
      final cmp = semver.compareVersions(a.$2, b.$2);
      return cmp != 0 ? cmp : a.$1.compareTo(b.$1);
    });
  c.eq('semver sort', sorted.join(' '), indexed.map((e) => input[e.$1]).join(' '));
  c.eq('semver build ignored', 0, semver.compare('1.0.0', '1.0.0+build.5'));
  c.eq('semver parse round trip', '1.2.3-rc.1+b.7', semver.parseVersion('1.2.3-rc.1+b.7').toString());
  for (final bad in ['1.2', '01.2.3', '1.2.3-01', '1.2.3-', '1.2.3+', 'v1.2.3', '1.2.3.4', ' 1.2.3', '1.2.3-a..b', '99999999999999999999.0.0']) {
    c.throws<FormatException>("semver invalid '$bad'", () => semver.parseVersion(bad));
  }
  const vectors = [
    ('1.2.3', '^1.0.0', true), ('2.0.0', '^1.0.0', false), ('0.2.5', '^0.2.3', true), ('0.3.0', '^0.2.3', false),
    ('0.0.4', '^0.0.3', false), ('1.2.9', '~1.2.3', true), ('1.3.0', '~1.2.3', false), ('1.5.0', '1.x', true),
    ('1.5.0', '>=1.2.0 <1.5.0', false), ('1.4.9', '>=1.2.0 <1.5.0', true), ('3.1.0', '^1.0.0 || ^3.0.0', true),
    ('1.2.3-beta.2', '^1.2.3-beta.1', true), ('1.2.4-beta.1', '^1.2.3-beta.1', false), ('1.3.0-rc.1', '^1.2.0', false),
    ('1.2.0', '1.0.0 - 1.2.0', true), ('1.2.1', '1.0.0 - 1.2.0', false), ('0.0.1', '*', true), ('2.0.0', '<=1.x', false),
  ];
  for (final (v, r, e) in vectors) {
    c.eq("satisfies $v '$r'", e, semver.satisfies(v, r));
  }
  c.check('satisfies >= with space', semver.satisfies('1.2.3', '>= 1.2.3'));
  c.check('satisfies 1.2.x', semver.satisfies('1.2.7', '1.2.x') && !semver.satisfies('1.3.0', '1.2.x'));
  c.check('satisfies >1.x', semver.satisfies('2.0.0', '>1.x') && !semver.satisfies('1.9.9', '>1.x'));
  c.check('satisfies <1.2.x', semver.satisfies('1.1.9', '<1.2.x') && !semver.satisfies('1.2.0', '<1.2.x'));
  c.check('satisfies prerelease excluded by *', !semver.satisfies('1.0.0-beta', '*'));
  c.throws<FormatException>('satisfies bad range', () => semver.satisfies('1.0.0', '^1.0.0.0'));
  c.throws<FormatException>('satisfies bad version', () => semver.satisfies('1.0', '*'));
}

void runCronNextTests(Checks c) {
  const vectors = [
    ('*/15 * * * *', '2026-10-10T12:07:30Z', '2026-10-10T12:15:00Z'),
    ('0 9 * * 1-5', '2026-10-10T12:00:00Z', '2026-10-12T09:00:00Z'),
    ('30 2 1 * *', '2026-10-10T00:00:00Z', '2026-11-01T02:30:00Z'),
    ('0 0 29 2 *', '2026-03-01T00:00:00Z', '2028-02-29T00:00:00Z'),
    ('0 12 13 * 5', '2026-10-10T00:00:00Z', '2026-10-13T12:00:00Z'),
    ('59 23 31 12 *', '2026-12-31T23:59:00Z', '2027-12-31T23:59:00Z'),
    ('0 0 * * 0', '2026-10-10T00:00:00Z', '2026-10-11T00:00:00Z'),
    ('5,10 8-9 * * *', '2026-10-10T09:10:00Z', '2026-10-11T08:05:00Z'),
  ];
  for (final (expr, after, expected) in vectors) {
    c.eq("cron '$expr' after $after", expected, nextRun(expr, after));
  }
  c.eq('cron dow 7 is Sunday', '2026-10-11T00:00:00Z', nextRun('0 0 * * 7', '2026-10-10T00:00:00Z'));
  c.eq('cron N/step', '2026-10-10T00:50:00Z', nextRun('50/5 * * * *', '2026-10-10T00:00:00Z'));
  c.eq('cron dom star step with dow uses AND', '2026-10-13T00:00:00Z', nextRun('0 0 */2 * 2', '2026-10-10T00:00:00Z'));
  for (final bad in ['* * * *', '60 * * * *', '* 24 * * *', '* * 0 * *', '* * * 13 *', '* * * * 8', '*/0 * * * *', '5-1 * * * *', 'MON * * * *', '? * * * *', 'L * * * *']) {
    c.throws<FormatException>("cron invalid '$bad'", () => nextRun(bad, '2026-10-10T00:00:00Z'));
  }
  c.throws<FormatException>('cron bad after', () => nextRun('* * * * *', '2026-10-10 00:00:00'));
  c.throws<FormatException>('cron after Feb 30', () => nextRun('* * * * *', '2026-02-30T00:00:00Z'));
  c.throws<StateError>('cron Feb 31 gives up', () => nextRun('0 0 31 2 *', '2026-10-10T00:00:00Z'));
}

void runWcagContrastTests(Checks c) {
  c.eq('wcag bw', 21.0, contrastRatio2('#000', '#fff'));
  c.eq('wcag grey', 4.54, contrastRatio2('#767676', '#ffffff'));
  c.eq('wcag blue', 4.51, contrastRatio2('#1a73e8', '#ffffff'));
  c.eq('wcag same', 1.0, contrastRatio2('#abc', '#aabbcc'));
  c.eq('wcag yellow', 1.07, contrastRatio2('#ffff00', '#ffffff'));
  c.check('wcag grey passes AA', passes(contrastRatio('#767676', '#ffffff'), WcagLevel.aa));
  c.check('wcag grey fails AAA', !passes(contrastRatio('#767676', '#ffffff'), WcagLevel.aaa));
  c.check('wcag yellow fails AA large', !passes(contrastRatio('#ffff00', '#ffffff'), WcagLevel.aa, largeText: true));
  c.check('wcag bw passes AAA', passes(contrastRatio('#000', '#FFF'), WcagLevel.aaa));
  c.check('wcag symmetric', contrastRatio('#1a73e8', '#fff') == contrastRatio('#fff', '#1a73e8'));
  for (final bad in ['000', '#00', '#0000', '#gggggg', '#1234567', '']) {
    c.throws<FormatException>("wcag invalid '$bad'", () => relativeLuminance(bad));
  }
}

void runGeoTests(Checks c) {
  c.eq('geo london-paris', 343557, haversineMeters(51.5074, -0.1278, 48.8566, 2.3522).round());
  c.eq('geo same point', 0, haversineMeters(10, 10, 10, 10).round());
  c.eq('geo antipode', 20015114, haversineMeters(0, 0, 0, 180).round());
  const hashes = [(37.7749, -122.4194, 9, '9q8yyk8yt'), (0.0, 0.0, 5, 's0000'), (-33.8688, 151.2093, 7, 'r3gx2f7')];
  for (final (lat, lon, precision, hash) in hashes) {
    c.eq('geohash $hash', hash, geohashEncode(lat, lon, precision));
    final cell = geohashDecode(hash);
    c.check('geohash decode $hash', (cell.lat - lat).abs() <= cell.latError && (cell.lon - lon).abs() <= cell.lonError);
    final upper = geohashDecode(hash.toUpperCase());
    c.check('geohash decode upper $hash', upper.lat == cell.lat && upper.lon == cell.lon);
  }
  c.throws<FormatException>('geohash invalid char a', () => geohashDecode('9q8a'));
  c.throws<FormatException>('geohash empty', () => geohashDecode(''));
  c.throws<RangeError>('geohash precision 13', () => geohashEncode(0, 0, 13));
  c.throws<RangeError>('geo lat 91', () => haversineMeters(91, 0, 0, 0));
  c.throws<RangeError>('geo lon -181', () => haversineMeters(0, -181, 0, 0));
  final box = boundingBox(51.5, -0.12, 10000);
  c.check('bbox north', haversineMeters(51.5, -0.12, box.maxLat, -0.12) >= 9999);
  c.check('bbox south', haversineMeters(51.5, -0.12, box.minLat, -0.12) >= 9999);
  c.check('bbox east', haversineMeters(51.5, -0.12, 51.5, box.maxLon) >= 9999);
  c.check('bbox west', haversineMeters(51.5, -0.12, 51.5, box.minLon) >= 9999);
  c.check('bbox not huge', box.maxLat - box.minLat < 0.2 && box.maxLon - box.minLon < 0.4);
  final polar = boundingBox(89.99, 0, 10000);
  c.check('bbox near pole spans all longitudes', polar.maxLat == 90 && polar.minLon == -180 && polar.maxLon == 180);
  c.throws<RangeError>('bbox negative radius', () => boundingBox(0, 0, -1));
  // Regression: the half-width is asin(sin(r)/cos(lat)), not 2*asin(sin(r/2)/cos(lat)).
  final wide = boundingBox(60, 0, 0.1 * earthRadiusMeters);
  final half = wide.maxLon * math.pi / 180;
  final want = math.asin(math.sin(0.1) / math.cos(math.pi / 3));
  c.check('bbox lat 60 r 0.1 half-width $half want $want', (half - want).abs() <= 1e-6 * want && (half - 0.20101).abs() < 1e-5);
  c.check('bbox lat 60 symmetric', (wide.minLon + wide.maxLon).abs() < 1e-12);
  String? outside;
  for (final cLat in const [0.0, 45.0, 60.0, 75.0, -70.0]) {
    for (final radius in const [1000.0, 100000.0, 1000000.0]) {
      final b = boundingBox(cLat, 0, radius);
      final d = radius / earthRadiusMeters;
      final p1 = cLat * math.pi / 180;
      for (var i = 0; i < 360 && outside == null; i++) {
        final t = i * math.pi / 180;
        final p2 = math.asin(math.sin(p1) * math.cos(d) + math.cos(p1) * math.sin(d) * math.cos(t));
        final l2 = math.atan2(math.sin(t) * math.sin(d) * math.cos(p1), math.cos(d) - math.sin(p1) * math.sin(p2));
        final pLat = p2 * 180 / math.pi, pLon = l2 * 180 / math.pi;
        if (pLat < b.minLat - 1e-9 || pLat > b.maxLat + 1e-9 || pLon < b.minLon - 1e-9 || pLon > b.maxLon + 1e-9) {
          outside = 'center $cLat, radius $radius, bearing $i: $pLat,$pLon outside [${b.minLat}, ${b.minLon}, ${b.maxLat}, ${b.maxLon}]';
        }
      }
    }
  }
  c.check('bbox contains circle points at 360 bearings ${outside ?? ''}', outside == null);
  for (final (cLon, bearing) in const [(179.9, 90.0), (-179.9, 270.0)]) {
    final b = boundingBox(10, cLon, 50000);
    c.check('bbox antimeridian center lon $cLon spans all longitudes [${b.minLon}, ${b.maxLon}]', b.minLon == -180 && b.maxLon == 180);
    final d = 50000 / earthRadiusMeters, p1 = 10 * math.pi / 180, t = bearing * math.pi / 180;
    final p2 = math.asin(math.sin(p1) * math.cos(d) + math.cos(p1) * math.sin(d) * math.cos(t));
    final l2 = cLon * math.pi / 180 + math.atan2(math.sin(t) * math.sin(d) * math.cos(p1), math.cos(d) - math.sin(p1) * math.sin(p2));
    final pLat = p2 * 180 / math.pi, pLon = (l2 * 180 / math.pi + 540) % 360 - 180;
    c.check('bbox antimeridian far-side point $pLat,$pLon inside',
        pLon.abs() > 179.5 && pLat >= b.minLat && pLat <= b.maxLat && pLon >= b.minLon && pLon <= b.maxLon);
  }
}

void runWebhookSignatureTests(Checks c) {
  const secret = 'whsec_test_secret_0123456789abcd';
  const body = '{"id":"evt_1","amount":1999}';
  const t = 1790000000;
  const header = 't=1790000000,v1=ad4e559e93bea390aff65b8c1eaec615bbdf3df1ef1d1c908b03299c20cf44a6';
  c.eq('webhook sign vector', header, signWebhook(secret, t, body));
  bool verifies(String h, String b, String s, int now) {
    try {
      verifyWebhook(h, b, s, now);
      return true;
    } on WebhookException {
      return false;
    }
  }

  void fails(String name, WebhookErrorKind kind, String h, String b, String s, int now, String prefix) =>
      c.throws<WebhookException>(name, () => verifyWebhook(h, b, s, now), (e) => e.kind == kind && e.message.startsWith(prefix));

  c.check('webhook verifies at t', verifies(header, body, secret, t));
  c.check('webhook verifies at t+300', verifies(header, body, secret, t + 300));
  c.check('webhook verifies at t-300', verifies(header, body, secret, t - 300));
  fails('webhook expired t+301', WebhookErrorKind.expired, header, body, secret, t + 301, 'expired');
  fails('webhook expired t-301', WebhookErrorKind.expired, header, body, secret, t - 301, 'expired');
  fails('webhook body byte changed', WebhookErrorKind.badSignature, header, body.replaceFirst('1999', '1998'), secret, t, 'bad signature');
  fails('webhook other secret', WebhookErrorKind.badSignature, header, body, '${secret}x', t, 'bad signature');
  fails('webhook hex digit changed', WebhookErrorKind.badSignature, '${header.substring(0, header.length - 1)}7', body, secret, t, 'bad signature');
  final sig = header.substring(16);
  c.check('webhook extra zero v1 first', verifies('t=1790000000, v1=${'0' * 64} , v1=$sig', body, secret, t));
  c.check('webhook ignores v0', verifies('$header,v0=abc', body, secret, t));
  fails('webhook missing t', WebhookErrorKind.malformed, header.substring(13), body, secret, t, 'malformed');
  fails('webhook two t', WebhookErrorKind.malformed, 't=1790000000,$header', body, secret, t, 'malformed');
  fails('webhook non-hex v1', WebhookErrorKind.malformed, 't=1790000000,v1=${'g' * 64}', body, secret, t, 'malformed');
  fails('webhook uppercase v1', WebhookErrorKind.malformed, 't=1790000000,v1=${sig.toUpperCase()}', body, secret, t, 'malformed');
  fails('webhook missing v1', WebhookErrorKind.malformed, 't=1790000000', body, secret, t, 'malformed');
  c.throws<ArgumentError>('webhook empty secret sign', () => signWebhook('', t, body));
  c.throws<ArgumentError>('webhook empty secret verify', () => verifyWebhook(header, body, '', t));
}

void main() {
  final c = Checks('wave4');
  runIdsTests(c);
  runRetryBackoffTests(c);
  runTokenBucketTests(c);
  runSemverTests(c);
  runCronNextTests(c);
  runWcagContrastTests(c);
  runGeoTests(c);
  runWebhookSignatureTests(c);
  c.finish();
}
