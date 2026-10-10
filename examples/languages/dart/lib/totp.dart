// SPDX-License-Identifier: Apache-2.0
/// HOTP (RFC 4226) and TOTP (RFC 6238) one-time passwords with RFC 4648 base32 helpers.
library;

import 'dart:convert';
import 'dart:math';
import 'dart:typed_data';

import 'package:crypto/crypto.dart';

import 'src/encoding.dart';

const _base32Alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

/// Computes an HOTP code with dynamic truncation, zero-padded to [digits].
String hotp(List<int> secret, int counter, {int digits = 6, String algorithm = 'SHA1'}) {
  if (secret.isEmpty) throw ArgumentError.value(secret, 'secret', 'must not be empty');
  if (digits < 6 || digits > 10) throw RangeError.range(digits, 6, 10, 'digits');
  if (counter < 0) throw RangeError.value(counter, 'counter', 'must be non-negative');
  final message = Uint8List(8);
  ByteData.sublistView(message).setUint64(0, counter);
  final mac = Hmac(_hash(algorithm), secret).convert(message).bytes;
  final offset = mac.last & 0x0f;
  final binary = ((mac[offset] & 0x7f) << 24) |
      (mac[offset + 1] << 16) |
      (mac[offset + 2] << 8) |
      mac[offset + 3];
  return (binary % pow(10, digits).toInt()).toString().padLeft(digits, '0');
}

/// Computes a TOTP code for [unixSeconds].
String totp(List<int> secret, int unixSeconds,
        {int step = 30, int digits = 6, String algorithm = 'SHA1', int t0 = 0}) =>
    hotp(secret, _counter(unixSeconds, step, t0), digits: digits, algorithm: algorithm);

/// Verifies [code] within ±[window] steps using a constant-time comparison.
bool verifyTotp(String? code, List<int> secret, int unixSeconds,
    {int window = 1, int step = 30, int digits = 6, String algorithm = 'SHA1', int t0 = 0}) {
  if (window < 0 || window > 10) throw RangeError.range(window, 0, 10, 'window');
  if (code == null || code.length != digits) return false;
  for (final c in code.codeUnits) {
    if (c < 0x30 || c > 0x39) return false;
  }
  final current = _counter(unixSeconds, step, t0);
  final supplied = ascii.encode(code);
  var matched = false;
  for (var delta = -window; delta <= window; delta++) {
    final counter = current + delta;
    if (counter < 0) continue;
    final expected = ascii.encode(hotp(secret, counter, digits: digits, algorithm: algorithm));
    matched = constantTimeEquals(expected, supplied) | matched;
  }
  return matched;
}

/// Encodes bytes as RFC 4648 base32 without padding.
String base32Encode(List<int> data) {
  final out = StringBuffer();
  var buffer = 0, bits = 0;
  for (final b in data) {
    buffer = ((buffer << 8) | (b & 0xff)) & 0xffff;
    bits += 8;
    while (bits >= 5) {
      out.write(_base32Alphabet[(buffer >> (bits - 5)) & 31]);
      bits -= 5;
    }
  }
  if (bits > 0) out.write(_base32Alphabet[(buffer << (5 - bits)) & 31]);
  return out.toString();
}

/// Decodes base32 case-insensitively, ignoring spaces, hyphens and trailing '='.
Uint8List base32Decode(String text) {
  final cleaned = text.replaceAll(' ', '').replaceAll('-', '').replaceFirst(RegExp(r'=+$'), '');
  final out = BytesBuilder(copy: false);
  var buffer = 0, bits = 0;
  for (final raw in cleaned.split('')) {
    final value = _base32Alphabet.indexOf(raw.toUpperCase());
    if (value < 0 || raw.codeUnitAt(0) > 0x7f) throw FormatException('invalid base32 character', raw);
    buffer = ((buffer << 5) | value) & 0xfff;
    bits += 5;
    if (bits >= 8) {
      out.addByte((buffer >> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return out.takeBytes();
}

/// Builds an otpauth:// provisioning URI for authenticator apps.
String otpauthUri(String issuer, String account, String secretBase32,
    {int digits = 6, int period = 30, String algorithm = 'SHA1'}) {
  if (issuer.isEmpty) throw ArgumentError.value(issuer, 'issuer', 'is required');
  if (account.isEmpty) throw ArgumentError.value(account, 'account', 'is required');
  if (base32Decode(secretBase32).isEmpty) throw ArgumentError.value(secretBase32, 'secretBase32', 'is required');
  if (digits < 6 || digits > 10) throw RangeError.range(digits, 6, 10, 'digits');
  if (period < 1) throw RangeError.value(period, 'period', 'must be positive');
  final alg = _normalizeAlgorithm(algorithm);
  final i = percentEncode(issuer);
  return 'otpauth://totp/$i:${percentEncode(account)}?secret=$secretBase32&issuer=$i'
      '&algorithm=$alg&digits=$digits&period=$period';
}

/// Returns [bytes] random bytes from `Random.secure()` (16-128).
Uint8List generateSecret([int bytes = 20]) {
  if (bytes < 16 || bytes > 128) throw RangeError.range(bytes, 16, 128, 'bytes');
  final random = Random.secure();
  return Uint8List.fromList(List<int>.generate(bytes, (_) => random.nextInt(256)));
}

int _counter(int unixSeconds, int step, int t0) {
  if (step < 1) throw RangeError.value(step, 'step', 'must be positive');
  if (unixSeconds < t0) throw RangeError.value(unixSeconds, 'unixSeconds', 'precedes t0');
  return (unixSeconds - t0) ~/ step;
}

String _normalizeAlgorithm(String algorithm) => switch (algorithm.toUpperCase()) {
      'SHA1' || 'SHA-1' => 'SHA1',
      'SHA256' || 'SHA-256' => 'SHA256',
      'SHA512' || 'SHA-512' => 'SHA512',
      _ => throw ArgumentError.value(algorithm, 'algorithm', 'unsupported'),
    };

Hash _hash(String algorithm) => switch (_normalizeAlgorithm(algorithm)) {
      'SHA1' => sha1,
      'SHA256' => sha256,
      _ => sha512,
    };
