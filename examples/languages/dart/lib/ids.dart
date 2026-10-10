// SPDX-License-Identifier: Apache-2.0
/// Time-ordered identifiers: UUIDv7 (RFC 9562) and ULID (Crockford base32).
library;

import 'dart:math';

const _crockford = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const _maxTime = 0xFFFFFFFFFFFF; // 2^48 - 1

/// Builds a UUIDv7 from a 48-bit unix millisecond time and exactly 10 random bytes.
String uuidV7(int unixMs, List<int> random10) {
  final b = _layout(unixMs, random10);
  b[6] = 0x70 | (b[6] & 0x0f);
  b[8] = 0x80 | (b[8] & 0x3f);
  final hex = b.map((x) => x.toRadixString(16).padLeft(2, '0')).join();
  return '${hex.substring(0, 8)}-${hex.substring(8, 12)}-${hex.substring(12, 16)}-${hex.substring(16, 20)}-${hex.substring(20)}';
}

/// Builds a 26-character ULID from a 48-bit unix millisecond time and exactly 10 random bytes.
String ulid(int unixMs, List<int> random10) {
  var value = BigInt.zero;
  for (final x in _layout(unixMs, random10)) {
    value = (value << 8) | BigInt.from(x);
  }
  final out = StringBuffer();
  for (var i = 0; i < 26; i++) {
    out.write(_crockford[((value >> (125 - 5 * i)) & BigInt.from(31)).toInt()]);
  }
  return out.toString();
}

/// Returns the unix millisecond time of a UUIDv7; throws [FormatException] for anything else.
int uuidV7Time(String text) {
  if (text.length != 36) throw FormatException('UUID must be 36 characters', text);
  for (var i = 0; i < 36; i++) {
    final dash = i == 8 || i == 13 || i == 18 || i == 23;
    final ok = dash ? text[i] == '-' : _isHex(text.codeUnitAt(i));
    if (!ok) throw FormatException('UUID has an invalid character', text, i);
  }
  if (text[14] != '7') throw FormatException('UUID is not version 7', text, 14);
  if (!'89abAB'.contains(text[19])) throw FormatException('UUID has an invalid variant', text, 19);
  return int.parse(text.substring(0, 8) + text.substring(9, 13), radix: 16);
}

/// Returns the unix millisecond time of a ULID (case-insensitive); throws [FormatException] when invalid.
int ulidTime(String text) {
  if (text.length != 26) throw FormatException('ULID must be 26 characters', text);
  var time = 0;
  for (var i = 0; i < 26; i++) {
    final v = _crockford.indexOf(text[i].toUpperCase());
    if (v < 0) throw FormatException('ULID has an invalid character', text, i);
    if (i == 0 && v > 7) throw FormatException('ULID overflows 128 bits', text, 0);
    // The first 10 characters hold 50 bits: 2 leading zero bits plus the 48-bit time.
    if (i < 10) time = (time << 5) | v;
  }
  return time;
}

final _random = Random.secure();

/// A new UUIDv7 from the system clock and the cryptographic random generator.
String newUuidV7() => uuidV7(DateTime.now().millisecondsSinceEpoch, _randomBytes());

/// A new ULID from the system clock and the cryptographic random generator.
String newUlid() => ulid(DateTime.now().millisecondsSinceEpoch, _randomBytes());

List<int> _randomBytes() => List<int>.generate(10, (_) => _random.nextInt(256));

bool _isHex(int c) => (c >= 0x30 && c <= 0x39) || (c >= 0x41 && c <= 0x46) || (c >= 0x61 && c <= 0x66);

List<int> _layout(int unixMs, List<int> random10) {
  if (unixMs < 0 || unixMs > _maxTime) throw RangeError.range(unixMs, 0, _maxTime, 'unixMs');
  if (random10.length != 10) throw ArgumentError.value(random10.length, 'random10', 'exactly 10 random bytes are required');
  if (random10.any((x) => x < 0 || x > 255)) throw ArgumentError.value(random10, 'random10', 'bytes must be 0-255');
  return [for (var i = 0; i < 6; i++) (unixMs >> (40 - 8 * i)) & 0xff, ...random10];
}
