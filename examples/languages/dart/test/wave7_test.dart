// SPDX-License-Identifier: Apache-2.0
// Wave 7 capability checks; every vector comes from the shared wave 7 reference vectors (caps7 ref.py, vectors.json).
// Vectors are copied verbatim from vectors.json; keep them identical across languages.
import 'dart:convert';

import 'package:genlib_validation_example/base_encodings.dart';
import 'package:genlib_validation_example/feature_flags.dart';
import 'package:genlib_validation_example/hashing.dart';
import 'package:genlib_validation_example/human_units.dart';
import 'package:genlib_validation_example/password_policy.dart';
import 'package:genlib_validation_example/text_sanitize.dart';
import 'package:genlib_validation_example/vcard.dart';

import 'src/checks.dart';

String _hex(List<int> bytes) => bytes.map((b) => b.toRadixString(16).padLeft(2, '0')).join();
List<int> _bytes(String hex) => [for (var i = 0; i < hex.length; i += 2) int.parse(hex.substring(i, i + 2), radix: 16)];
String _show(String s) => s.replaceAll('\n', r'\n').replaceAll('\r', r'\r');

void runBaseEncodingsTests(Checks c) {
  const base32 = [
    ('', '', '', ''),
    ('66', 'MY======', 'CO======', 'MY'),
    ('666f', 'MZXQ====', 'CPNG====', 'MZXQ'),
    ('666f6f', 'MZXW6===', 'CPNMU===', 'MZXW6'),
    ('666f6f62', 'MZXW6YQ=', 'CPNMUOG=', 'MZXW6YQ'),
    ('666f6f6261', 'MZXW6YTB', 'CPNMUOJ1', 'MZXW6YTB'),
    ('666f6f626172', 'MZXW6YTBOI======', 'CPNMUOJ1E8======', 'MZXW6YTBOI'),
  ];
  for (final (hex, rfc, hexAlpha, unpadded) in base32) {
    final data = _bytes(hex);
    c.eq('base32 encode $hex', rfc, base32Encode(data));
    c.eq('base32hex encode $hex', hexAlpha, base32Encode(data, alphabet: 'hex'));
    c.eq('base32 unpadded encode $hex', unpadded, base32Encode(data, padding: false));
    c.eq('base32 decode $rfc', hex, _hex(base32Decode(rfc)));
    c.eq('base32hex decode $hexAlpha', hex, _hex(base32Decode(hexAlpha, alphabet: 'hex')));
    c.eq('base32 unpadded decode $unpadded', hex, _hex(base32Decode(unpadded, padding: false)));
  }
  c.eq('base32 decode case-insensitive', '666f6f626172', _hex(base32Decode('mzxw6ytboi======')));
  const base32Invalid = [('MZXW6YT', true), ('MZXW6YR=', true), ('MZ======', true), ('MZXW6YTB1=======', true), ('MZXR====', true), ('MZXW6===', false)];
  for (final (text, padding) in base32Invalid) {
    c.throws<FormatException>('base32 invalid \'$text\' padding=$padding', () => base32Decode(text, padding: padding));
  }
  const base58 = [('', ''), ('48656c6c6f20576f726c6421', '2NEpo7TZRRrLZSi2U'), ('0000287fb4cd', '11233QC4'), ('00', '1'), ('0000', '11'), ('ff', '5Q'), ('00eb15231dfceb60925886b67d065299925915aeb172c06647', '1NS17iag9jJgTHD1VXjvLCEnZuQ3rJDE9L')];
  for (final (hex, text) in base58) {
    c.eq('base58 encode $hex', text, base58Encode(_bytes(hex)));
    c.eq('base58 decode $text', hex, _hex(base58Decode(text)));
  }
  for (final bad in const ['0OIl', 'abc0', 'I']) {
    c.throws<FormatException>('base58 invalid \'$bad\'', () => base58Decode(bad));
  }
  const base64url = [('', ''), ('66', 'Zg'), ('666f', 'Zm8'), ('666f6f', 'Zm9v'), ('666f6f62', 'Zm9vYg'), ('666f6f6261', 'Zm9vYmE'), ('666f6f626172', 'Zm9vYmFy'), ('fbff', '-_8'), ('000102030405', 'AAECAwQF')];
  for (final (hex, text) in base64url) {
    c.eq('base64url encode $hex', text, base64UrlEncode(_bytes(hex)));
    c.eq('base64url decode $text', hex, _hex(base64UrlDecode(text)));
  }
  for (final bad in const ['Zg==', 'Zh', 'a', '+/', 'Zm9v!']) {
    c.throws<FormatException>('base64url invalid \'$bad\'', () => base64UrlDecode(bad));
  }
}

void runVCardTests(Checks c) {
  const cases = [
    (VCardContact('Ada Lovelace', n: VCardName(family: 'Lovelace', given: 'Ada', prefix: 'Countess'), org: 'Analytical Engines, Ltd.', title: 'Programmer', note: 'First line\nSecond; with, punctuation \\ backslash', uid: 'urn:uuid:01a0c450-6c7b-7102-8304-05060708090a', emails: [VCardTypedValue('ada@example.com', type: 'work')], phones: [VCardTypedValue('+44 20 7946 0000', type: 'cell')], address: VCardAddress(type: 'home', street: '12 St. James\'s Sq', locality: 'London', postalCode: 'SW1Y 4LB', country: 'United Kingdom'), urls: const ['https://example.com/ada']),
        'BEGIN:VCARD\r\nVERSION:4.0\r\nFN:Ada Lovelace\r\nN:Lovelace;Ada;;Countess;\r\nORG:Analytical Engines\\, Ltd.\r\nTITLE:Programmer\r\nEMAIL;TYPE=work:ada@example.com\r\nTEL;TYPE=cell:+44 20 7946 0000\r\nADR;TYPE=home:;;12 St. James\'s Sq;London;;SW1Y 4LB;United Kingdom\r\nURL:https://example.com/ada\r\nNOTE:First line\\nSecond\\; with\\, punctuation \\\\ backslash\r\nUID:urn:uuid:01a0c450-6c7b-7102-8304-05060708090a\r\nEND:VCARD\r\n'),
    (VCardContact('Zo\u{EB} \u{C5}ngstr\u{F6}m'),
        'BEGIN:VCARD\r\nVERSION:4.0\r\nFN:Zo\u{EB} \u{C5}ngstr\u{F6}m\r\nEND:VCARD\r\n'),
    (VCardContact('Long Note', note: '\u{E9}\u{E9}\u{E9}\u{E9}\u{E9}\u{E9}\u{E9}\u{E9}\u{E9}\u{E9}\u{E9}\u{E9}\u{E9}\u{E9}\u{E9}\u{E9}\u{E9}\u{E9}\u{E9}\u{E9}\u{E9}\u{E9}\u{E9}\u{E9}\u{E9}\u{E9}\u{E9}\u{E9}\u{E9}\u{E9}\u{E9}\u{E9}\u{E9}\u{E9}\u{E9}\u{E9}\u{E9}\u{E9}\u{E9}\u{E9}\u{E9}\u{E9}\u{E9}\u{E9}\u{E9}\u{E9}\u{E9}\u{E9}\u{E9}\u{E9}\u{E9}\u{E9}\u{E9}\u{E9}\u{E9}\u{E9}\u{E9}\u{E9}\u{E9}\u{E9}'),
        'BEGIN:VCARD\r\nVERSION:4.0\r\nFN:Long Note\r\nNOTE:\u{E9}\u{E9}\u{E9}\u{E9}\u{E9}\u{E9}\u{E9}\u{E9}\u{E9}\u{E9}\u{E9}\u{E9}\u{E9}\u{E9}\u{E9}\u{E9}\u{E9}\u{E9}\u{E9}\u{E9}\u{E9}\u{E9}\u{E9}\u{E9}\u{E9}\u{E9}\u{E9}\u{E9}\u{E9}\u{E9}\u{E9}\u{E9}\u{E9}\u{E9}\u{E9}\r\n \u{E9}\u{E9}\u{E9}\u{E9}\u{E9}\u{E9}\u{E9}\u{E9}\u{E9}\u{E9}\u{E9}\u{E9}\u{E9}\u{E9}\u{E9}\u{E9}\u{E9}\u{E9}\u{E9}\u{E9}\u{E9}\u{E9}\u{E9}\u{E9}\u{E9}\r\nEND:VCARD\r\n'),
  ];
  for (final (contact, expected) in cases) {
    c.eq('vcard ${contact.fn}', expected, buildVcard(contact));
  }
  const invalid = [
    VCardContact(''),
    VCardContact('   '),
    VCardContact('A', emails: [VCardTypedValue('not an email')]),
    VCardContact('A', phones: [VCardTypedValue('call me')]),
    VCardContact('A', urls: const ['javascript:alert(1)']),
    VCardContact('A', emails: [VCardTypedValue('a@b.c', type: 'Work')]),
    VCardContact('Tab\there'),
  ];
  for (var i = 0; i < invalid.length; i++) {
    c.throws<ArgumentError>('vcard invalid $i', () => buildVcard(invalid[i]));
  }
}

void runHashingTests(Checks c) {
  const strings = [
    ('', 0, 2166136261, 'cbf29ce484222325', 0, 142593372),
    ('a', 3904355907, 3826002220, 'af63dc4c8601ec8c', 1009084850, 3001393763),
    ('foobar', 2666930069, 3214735720, '85944171f73967e8', 2764362941, 1018276128),
    ('123456789', 3421780262, 3146166556, '06d5573923c6cdfc', 3036607362, 3059026825),
    ('hello', 907060870, 1335831723, 'a430d84680aabd0b', 613153351, 3806057185),
    ('The quick brown fox jumps over the lazy dog', 1095738169, 76545936, 'f3f9b7f5e7e47110', 776992547, 880582914),
    ('h\u{E9}llo w\u{F6}rld', 354246585, 3558752674, '11824ab841812022', 2549609076, 857211688),
  ];
  for (final (text, crc, fnv32, fnv64, m0, m42) in strings) {
    final data = utf8.encode(text);
    c.eq('crc32 \'$text\'', crc, crc32(data));
    c.eq('fnv1a32 \'$text\'', fnv32, fnv1a32(data));
    c.eq('fnv1a64 \'$text\'', fnv64, fnv1a64(data).toRadixString(16).padLeft(16, '0'));
    c.eq('murmur3 seed 0 \'$text\'', m0, murmur3_32(data));
    c.eq('murmur3 seed 42 \'$text\'', m42, murmur3_32(data, 42));
  }
  const jump = [('0', 1, 0), ('1', 10, 6), ('256', 1024, 520), ('3735928559', 100, 87), ('18446744073709551615', 1000, 313), ('12345678901234567', 7, 5), ('42', 2147483647, 1603940301)];
  for (final (key, buckets, bucket) in jump) {
    c.eq('jump hash $key $buckets', bucket, jumpHash(BigInt.parse(key), buckets));
  }
  c.throws<RangeError>('jump hash 0 buckets', () => jumpHash(BigInt.one, 0));
}

void runFeatureFlagsTests(Checks c) {
  const cases = [
    (FeatureFlag('new-checkout', rolloutPercent: 25), 'user-1', FlagResult(true, 'rollout', 849, null)),
    (FeatureFlag('new-checkout', rolloutPercent: 25), 'user-2', FlagResult(false, 'excluded', 5308, null)),
    (FeatureFlag('new-checkout', rolloutPercent: 25), 'user-3', FlagResult(false, 'excluded', 5247, null)),
    (FeatureFlag('new-checkout', rolloutPercent: 25), 'user-42', FlagResult(false, 'excluded', 9209, null)),
    (FeatureFlag('new-checkout', rolloutPercent: 25), 'alice@example.com', FlagResult(false, 'excluded', 9060, null)),
    (FeatureFlag('new-checkout', allow: const ['user-2'], deny: const ['user-1'], rolloutPercent: 25), 'user-1', FlagResult(false, 'deny', 849, null)),
    (FeatureFlag('new-checkout', allow: const ['user-2'], deny: const ['user-1'], rolloutPercent: 25), 'user-2', FlagResult(true, 'allow', 5308, null)),
    (FeatureFlag('beta', enabled: false, allow: const ['vip']), 'vip', FlagResult(false, 'disabled', 8844, null)),
    (FeatureFlag('banner', rolloutPercent: 0), 'user-1', FlagResult(false, 'excluded', 6875, null)),
    (FeatureFlag('banner', rolloutPercent: 100), 'user-1', FlagResult(true, 'rollout', 6875, null)),
    (FeatureFlag('banner', rolloutPercent: 12.34), 'user-9', FlagResult(false, 'excluded', 8197, null)),
    (FeatureFlag('pricing-test', variants: [FlagVariant('control', 50), FlagVariant('annual-first', 30), FlagVariant('monthly-first', 20)]), 'u1', FlagResult(true, 'rollout', 6435, 'control')),
    (FeatureFlag('pricing-test', variants: [FlagVariant('control', 50), FlagVariant('annual-first', 30), FlagVariant('monthly-first', 20)]), 'u2', FlagResult(true, 'rollout', 401, 'annual-first')),
    (FeatureFlag('pricing-test', variants: [FlagVariant('control', 50), FlagVariant('annual-first', 30), FlagVariant('monthly-first', 20)]), 'u3', FlagResult(true, 'rollout', 9955, 'monthly-first')),
    (FeatureFlag('pricing-test', variants: [FlagVariant('control', 50), FlagVariant('annual-first', 30), FlagVariant('monthly-first', 20)]), 'u4', FlagResult(true, 'rollout', 8249, 'annual-first')),
    (FeatureFlag('pricing-test', variants: [FlagVariant('control', 50), FlagVariant('annual-first', 30), FlagVariant('monthly-first', 20)]), 'u5', FlagResult(true, 'rollout', 6254, 'control')),
    (FeatureFlag('pricing-test', variants: [FlagVariant('control', 50), FlagVariant('annual-first', 30), FlagVariant('monthly-first', 20)]), '\u{FC}n\u{EF}code', FlagResult(true, 'rollout', 7068, 'control')),
  ];
  for (final (flag, user, expected) in cases) {
    c.eq('flag ${flag.key} $user', expected, evaluateFlag(flag, user));
  }
  const invalid = [FeatureFlag('bad key'), FeatureFlag('k', rolloutPercent: 101), FeatureFlag('k', rolloutPercent: 12.345), FeatureFlag('k', variants: [FlagVariant('a', 0)]), FeatureFlag('')];
  for (var i = 0; i < invalid.length; i++) {
    c.throws<ArgumentError>('flag invalid $i', () => evaluateFlag(invalid[i], 'u'));
  }
  c.eq('flag same user same answer', evaluateFlag(const FeatureFlag('x', rolloutPercent: 50), 'u7'), evaluateFlag(const FeatureFlag('x', rolloutPercent: 50), 'u7'));
  c.check('flag raising percent only adds users', [for (var i = 0; i < 500; i++) 'user-$i'].every((u) => !evaluateFlag(const FeatureFlag('ramp', rolloutPercent: 10), u).on || evaluateFlag(const FeatureFlag('ramp', rolloutPercent: 30), u).on));
  // Plain FNV-1a's low bit is the parity of the input bytes, so two 50/50 experiments with similar keys put every
  // subject in the same half of both. The fmix32 finalizer must keep them independent (chi-square < 10.83, p > 0.001).
  const ab = [FlagVariant('a', 1), FlagVariant('b', 1)];
  for (final (k1, k2) in [('checkout-a', 'checkout-b'), ('exp1', 'exp2')]) {
    final parity = [[0.0, 0.0], [0.0, 0.0]];
    final arms = [[0.0, 0.0], [0.0, 0.0]];
    for (var i = 0; i < 10000; i++) {
      final u = 'u$i';
      parity[evaluateFlag(FeatureFlag(k1), u).bucket % 2][evaluateFlag(FeatureFlag(k2), u).bucket % 2]++;
      arms[evaluateFlag(FeatureFlag(k1, variants: ab), u).variant == 'b' ? 1 : 0][evaluateFlag(FeatureFlag(k2, variants: ab), u).variant == 'b' ? 1 : 0]++;
    }
    final cp = _flagChiSquare2x2(parity), ca = _flagChiSquare2x2(arms);
    c.check('flag bucket parity $k1/$k2 independent (chi-square ${cp.toStringAsFixed(2)})', cp < 10.83);
    c.check('flag 50/50 variants $k1/$k2 independent (chi-square ${ca.toStringAsFixed(2)})', ca < 10.83);
  }
  final counts = List<int>.filled(100, 0);
  for (var i = 0; i < 10000; i++) {
    counts[evaluateFlag(const FeatureFlag('checkout-a'), 'u$i').bucket % 100]++;
  }
  c.check('flag 100 buckets each get 100 +/- 40 of 10000 subjects', counts.every((n) => (n - 100).abs() <= 40));
}

/// Chi-square statistic of the 2x2 contingency table of two 0/1 assignments.
double _flagChiSquare2x2(List<List<double>> t) {
  final n = t[0][0] + t[0][1] + t[1][0] + t[1][1];
  var chi = 0.0;
  for (var i = 0; i < 2; i++) {
    for (var j = 0; j < 2; j++) {
      final e = (t[i][0] + t[i][1]) * (t[0][j] + t[1][j]) / n;
      chi += (t[i][j] - e) * (t[i][j] - e) / e;
    }
  }
  return chi;
}

void runHumanUnitsTests(Checks c) {
  const formatBytesCases = [
    (0, 'si', 1, '0 B'),
    (999, 'si', 1, '999 B'),
    (1000, 'si', 1, '1 kB'),
    (1536, 'iec', 1, '1.5 KiB'),
    (1536, 'si', 1, '1.5 kB'),
    (999950, 'si', 1, '1 MB'),
    (999949, 'si', 1, '999.9 kB'),
    (1048576, 'iec', 2, '1 MiB'),
    (123456789, 'si', 2, '123.46 MB'),
    (123456789, 'iec', 0, '118 MiB'),
    (9223372036854775807, 'iec', 3, '8 EiB'),
    (1023, 'iec', 1, '1023 B'),
    (1024, 'iec', 1, '1 KiB'),
    (5000000000000, 'si', 1, '5 TB'),
  ];
  for (final (n, base, decimals, expected) in formatBytesCases) {
    c.eq('format bytes $n $base $decimals', expected, formatBytes(n, base: base, decimals: decimals));
  }
  const parseCases = [('0', 0), ('512', 512), ('1kB', 1000), ('1 KiB', 1024), ('1.5 GiB', 1610612736), ('2.25MB', 2250000), (' 10 b ', 10), ('1.0005 kB', 1001), ('1.5', 2), ('0.5 B', 1), ('7 EiB', 8070450532247928832)];
  for (final (text, expected) in parseCases) {
    c.eq('parse bytes \'$text\'', expected, parseBytes(text));
  }
  for (final bad in const ['', 'abc', '1 KB B', '1.5.2 MB', '-1 kB', '1 kbit', '1e3 B', '9 EiB', '.5 kB']) {
    c.throws<FormatException>('parse bytes invalid \'$bad\'', () => parseBytes(bad));
  }
  const durations = [(0, '0ms'), (850, '850ms'), (1000, '1s'), (45000, '45s'), (65000, '1m 5s'), (3600000, '1h'), (3725000, '1h 2m'), (90061000, '1d 1h'), (172800000, '2d'), (59999, '59s')];
  for (final (ms, expected) in durations) {
    c.eq('format duration $ms', expected, formatDuration(ms));
  }
  const relative = [(0, 'just now'), (30, 'just now'), (-44, 'just now'), (45, 'in a minute'), (-89, 'a minute ago'), (90, 'in 2 minutes'), (150, 'in 3 minutes'), (-2670, '45 minutes ago'), (2700, 'in an hour'), (5399, 'in an hour'), (5400, 'in 2 hours'), (-75600, '21 hours ago'), (79200, 'in a day'), (129599, 'in a day'), (129600, 'in 2 days'), (2246400, 'in a month'), (-3974400, '2 months ago'), (15552000, 'in 6 months'), (27648000, 'in a year'), (-47347200, '2 years ago'), (63115200, 'in 2 years'), (315569520, 'in 10 years')];
  for (final (delta, expected) in relative) {
    c.eq('relative time $delta', expected, relativeTime(delta));
  }
  c.throws<RangeError>('format bytes negative', () => formatBytes(-1));
  c.throws<RangeError>('format bytes decimals 4', () => formatBytes(1, decimals: 4));
}

void runPasswordPolicyTests(Checks c) {
  final cases = [
    ('correct horse battery staple', () => checkPassword('correct horse battery staple'), true, ''),
    ('short', () => checkPassword('short'), false, 'too-short'),
    ('Tr0ub4dor&3', () => checkPassword('Tr0ub4dor&3', minLength: 8), true, ''),
    ('password', () => checkPassword('password', minLength: 8, blocklist: const ['Password', '123456']), false, 'blocklisted'),
    ('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', () => checkPassword('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', maxLength: 64), false, 'too-long,repetitive'),
    ('aaaa-unique-phrase-x', () => checkPassword('aaaa-unique-phrase-x'), false, 'repetitive'),
    ('my-1234-long-passphrase', () => checkPassword('my-1234-long-passphrase'), false, 'repetitive'),
    ('zyxw-backwards-phrase!', () => checkPassword('zyxw-backwards-phrase!'), false, 'repetitive'),
    ('alice-secret-passphrase', () => checkPassword('alice-secret-passphrase', context: const ['alice', 'example']), false, 'contains-context'),
    ('tab\tinside-long-enough', () => checkPassword('tab\tinside-long-enough'), false, 'control-characters'),
    ('\u{FC}n\u{EF}c\u{F6}d\u{E9}-p\u{E4}ssw\u{F6}rd-long', () => checkPassword('\u{FC}n\u{EF}c\u{F6}d\u{E9}-p\u{E4}ssw\u{F6}rd-long'), true, ''),
    ('\u{1F600}\u{1F600}\u{1F600}\u{1F600}\u{1F600}\u{1F600}\u{1F600}\u{1F600}\u{1F600}\u{1F600}\u{1F600}\u{1F600}\u{1F600}\u{1F600}\u{1F600}', () => checkPassword('\u{1F600}\u{1F600}\u{1F600}\u{1F600}\u{1F600}\u{1F600}\u{1F600}\u{1F600}\u{1F600}\u{1F600}\u{1F600}\u{1F600}\u{1F600}\u{1F600}\u{1F600}'), false, 'repetitive'),
    ('ABCD-upper-sequence-x', () => checkPassword('ABCD-upper-sequence-x'), false, 'repetitive'),
  ];
  for (final (password, run, ok, failures) in cases) {
    final r = run();
    c.check('password \'$password\'', r.ok == ok && r.failures.join(',') == failures);
  }
  c.throws<ArgumentError>('password minLength 0', () => checkPassword('x', minLength: 0));
  c.throws<ArgumentError>('password maxLength < minLength', () => checkPassword('x', minLength: 10, maxLength: 9));
}

void runTextSanitizeTests(Checks c) {
  const sanitize = [
    ('plain text', true, null, 'plain text'),
    ('line1\r\nline2\rline3', true, null, 'line1\nline2\nline3'),
    ('zero\u{200B}width\u{FEFF}bom', true, null, 'zerowidthbom'),
    ('tab\there\u{0}nul\u{7F}del\u{85}nel', true, null, 'tab\therenuldelnel'),
    ('if (accessLevel != "user\u{202E} \u{2066}// Check if admin\u{2069} \u{2066}") {', true, null, 'if (accessLevel != "user // Check if admin ") {'),
    ('emoji \u{1F44D}\u{1F3FD} and ZWJ \u{1F468}\u{200D}\u{1F469}\u{200D}\u{1F467} family', true, null, 'emoji \u{1F44D}\u{1F3FD} and ZWJ \u{1F468}\u{200D}\u{1F469}\u{200D}\u{1F467} family'),
    ('caf\u{E9} e\u{301}', true, null, 'caf\u{E9} e\u{301}'),
    ('a\nb\r\nc', false, null, 'a b c'),
    ('abcdef', true, 3, 'abc'),
    ('\u{1F600}\u{1F600}\u{1F600}', true, 2, '\u{1F600}\u{1F600}'),
  ];
  for (final (text, allowNewlines, maxLength, expected) in sanitize) {
    c.eq('sanitize ${_show(text)}', expected, sanitizeText(text, allowNewlines: allowNewlines, maxLength: maxLength));
  }
  const bidi = [
    ('plain text', ''),
    ('line1\r\nline2\rline3', ''),
    ('zero\u{200B}width\u{FEFF}bom', ''),
    ('tab\there\u{0}nul\u{7F}del\u{85}nel', ''),
    ('if (accessLevel != "user\u{202E} \u{2066}// Check if admin\u{2069} \u{2066}") {', '24:202E 26:2066 44:2069 46:2066'),
    ('emoji \u{1F44D}\u{1F3FD} and ZWJ \u{1F468}\u{200D}\u{1F469}\u{200D}\u{1F467} family', ''),
    ('caf\u{E9} e\u{301}', ''),
  ];
  for (final (text, expected) in bidi) {
    c.eq('find bidi ${_show(text)}', expected, findBidiControls(text).map((x) => '${x.$1}:${x.$2}').join(' '));
  }
  const whitespace = [('  a   b\t\tc\n\nd  ', 'a b c d'), ('', ''), (' \t\n ', ''), ('one', 'one')];
  for (final (text, expected) in whitespace) {
    c.eq('normalize whitespace ${_show(text)}', expected, normalizeWhitespace(text));
  }
}
