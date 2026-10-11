// SPDX-License-Identifier: Apache-2.0
/// Base58 (Bitcoin alphabet) and Base58Check (payload + first 4 bytes of SHA-256(SHA-256(payload))). The big-number
/// conversion works on byte/digit arrays, so no big-integer type is needed. Leading zero bytes map to leading '1's.
/// Failures throw [Base58Exception]. SHA-256 comes from the package's existing `crypto` dependency.
library;

import 'package:crypto/crypto.dart';

/// An invalid Base58 character, a too-short Base58Check string or a checksum mismatch.
class Base58Exception implements Exception {
  final String message;
  const Base58Exception(this.message);
  @override
  String toString() => 'Base58Exception: $message';
}

const _alphabet = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

/// Encodes bytes as Base58 text.
String base58Encode(List<int> bytes) {
  var zeros = 0;
  while (zeros < bytes.length && bytes[zeros] == 0) {
    zeros++;
  }
  final digits = <int>[]; // base 58, little endian
  for (var i = zeros; i < bytes.length; i++) {
    var carry = bytes[i] & 0xFF;
    for (var j = 0; j < digits.length; j++) {
      carry += digits[j] << 8;
      digits[j] = carry % 58;
      carry ~/= 58;
    }
    while (carry > 0) {
      digits.add(carry % 58);
      carry ~/= 58;
    }
  }
  final sb = StringBuffer('1' * zeros);
  for (var i = digits.length - 1; i >= 0; i--) {
    sb.write(_alphabet[digits[i]]);
  }
  return sb.toString();
}

/// Decodes Base58 text to bytes; throws [Base58Exception] on a character outside the alphabet.
List<int> base58Decode(String text) {
  final cps = text.runes.toList();
  var ones = 0;
  while (ones < cps.length && cps[ones] == 0x31) {
    ones++;
  }
  final bytes = <int>[]; // base 256, little endian
  for (final c in cps) {
    final v = c < 128 ? _alphabet.indexOf(String.fromCharCode(c)) : -1;
    if (v < 0) throw const Base58Exception('invalid base58 character');
    var carry = v;
    for (var j = 0; j < bytes.length; j++) {
      carry += bytes[j] * 58;
      bytes[j] = carry & 0xFF;
      carry >>= 8;
    }
    while (carry > 0) {
      bytes.add(carry & 0xFF);
      carry >>= 8;
    }
  }
  return [...List.filled(ones, 0), ...bytes.reversed];
}

List<int> _checksum(List<int> payload) => sha256.convert(sha256.convert(payload).bytes).bytes.sublist(0, 4);

/// Encodes a payload as Base58Check (payload followed by a 4-byte double SHA-256 checksum).
String base58CheckEncode(List<int> payload) => base58Encode([...payload, ..._checksum(payload)]);

/// Decodes Base58Check text and returns the payload; throws when too short or the checksum does not match.
List<int> base58CheckDecode(String text) {
  final b = base58Decode(text);
  if (b.length < 4) throw const Base58Exception('too short for a checksum');
  final p = b.sublist(0, b.length - 4);
  final c = _checksum(p);
  for (var i = 0; i < 4; i++) {
    if (c[i] != b[b.length - 4 + i]) throw const Base58Exception('checksum mismatch');
  }
  return p;
}
