// SPDX-License-Identifier: Apache-2.0
/// Strict RFC 4648 base32 (standard and extended-hex alphabets), Bitcoin base58 and unpadded base64url codecs.
/// Decoders throw [FormatException] for unknown characters, bad padding or length and non-canonical trailing bits.
library;

import 'dart:typed_data';

const _base32Rfc = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const _base32Hex = '0123456789ABCDEFGHIJKLMNOPQRSTUV';
const _base58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
const _base64Url = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

String _base32Alphabet(String alphabet) => switch (alphabet) {
      'rfc4648' => _base32Rfc,
      'hex' => _base32Hex,
      _ => throw ArgumentError.value(alphabet, 'alphabet', 'must be rfc4648 or hex'),
    };

/// Base32 encodes with uppercase output; [alphabet] is `rfc4648` (section 6) or `hex` (section 7).
String base32Encode(List<int> bytes, {String alphabet = 'rfc4648', bool padding = true}) {
  final a = _base32Alphabet(alphabet);
  final out = StringBuffer();
  var bits = 0, n = 0;
  for (final b in bytes) {
    bits = ((bits << 8) | (b & 255)) & 0xffff;
    n += 8;
    while (n >= 5) {
      n -= 5;
      out.write(a[(bits >> n) & 31]);
    }
  }
  if (n > 0) out.write(a[(bits << (5 - n)) & 31]);
  if (padding) {
    while (out.length % 8 != 0) {
      out.write('=');
    }
  }
  return out.toString();
}

/// Case-insensitive base32 decode. With [padding] the length must be a multiple of 8 with 0, 1, 3, 4 or 6 `=`;
/// without it no `=` is allowed. Unpadded lengths of 1, 3 or 6 mod 8 are rejected.
Uint8List base32Decode(String text, {String alphabet = 'rfc4648', bool padding = true}) {
  final a = _base32Alphabet(alphabet);
  var t = text.toUpperCase();
  if (padding) {
    if (t.length % 8 != 0) throw FormatException('base32 length must be a multiple of 8', text);
    var end = t.length;
    while (end > 0 && t[end - 1] == '=') {
      end--;
    }
    if (!const [0, 1, 3, 4, 6].contains(t.length - end)) throw FormatException('invalid base32 padding', text);
    t = t.substring(0, end);
  } else if (t.contains('=')) {
    throw FormatException('unexpected base32 padding', text);
  }
  if (const [1, 3, 6].contains(t.length % 8)) throw FormatException('invalid base32 length', text);
  final out = BytesBuilder(copy: false);
  var bits = 0, n = 0;
  for (var k = 0; k < t.length; k++) {
    final i = a.indexOf(t[k]);
    if (i < 0) throw FormatException('invalid base32 character', text, k);
    bits = ((bits << 5) | i) & 0xffff;
    n += 5;
    if (n >= 8) {
      n -= 8;
      out.addByte((bits >> n) & 255);
    }
  }
  if (bits & ((1 << n) - 1) != 0) throw FormatException('non-canonical base32 trailing bits', text);
  return out.takeBytes();
}

/// Base58 (Bitcoin alphabet); each leading zero byte becomes one leading `1`.
String base58Encode(List<int> bytes) {
  var zeros = 0;
  while (zeros < bytes.length && bytes[zeros] == 0) {
    zeros++;
  }
  final digits = <int>[]; // little-endian base-58 digits
  for (var k = zeros; k < bytes.length; k++) {
    var carry = bytes[k] & 255;
    for (var d = 0; d < digits.length; d++) {
      carry += digits[d] << 8;
      digits[d] = carry % 58;
      carry ~/= 58;
    }
    while (carry > 0) {
      digits.add(carry % 58);
      carry ~/= 58;
    }
  }
  final out = StringBuffer('1' * zeros);
  for (var d = digits.length - 1; d >= 0; d--) {
    out.write(_base58[digits[d]]);
  }
  return out.toString();
}

/// Decodes base58; each leading `1` becomes one zero byte. Throws [FormatException] for other characters.
Uint8List base58Decode(String text) {
  var zeros = 0;
  while (zeros < text.length && text[zeros] == '1') {
    zeros++;
  }
  final bytes = <int>[]; // little-endian base-256 digits
  for (var k = 0; k < text.length; k++) {
    var carry = _base58.indexOf(text[k]);
    if (carry < 0) throw FormatException('invalid base58 character', text, k);
    for (var d = 0; d < bytes.length; d++) {
      carry += bytes[d] * 58;
      bytes[d] = carry & 255;
      carry >>= 8;
    }
    while (carry > 0) {
      bytes.add(carry & 255);
      carry >>= 8;
    }
  }
  final result = Uint8List(zeros + bytes.length);
  for (var d = 0; d < bytes.length; d++) {
    result[result.length - 1 - d] = bytes[d];
  }
  return result;
}

/// RFC 4648 section 5 base64url without padding.
String base64UrlEncode(List<int> bytes) {
  final out = StringBuffer();
  var bits = 0, n = 0;
  for (final b in bytes) {
    bits = ((bits << 8) | (b & 255)) & 0xffff;
    n += 8;
    while (n >= 6) {
      n -= 6;
      out.write(_base64Url[(bits >> n) & 63]);
    }
  }
  if (n > 0) out.write(_base64Url[(bits << (6 - n)) & 63]);
  return out.toString();
}

/// Decodes unpadded base64url; rejects `=`, `+`, `/`, other characters, length 1 mod 4 and non-canonical trailing bits.
Uint8List base64UrlDecode(String text) {
  if (text.length % 4 == 1) throw FormatException('invalid base64url length', text);
  final out = BytesBuilder(copy: false);
  var bits = 0, n = 0;
  for (var k = 0; k < text.length; k++) {
    final i = _base64Url.indexOf(text[k]);
    if (i < 0) throw FormatException('invalid base64url character', text, k);
    bits = ((bits << 6) | i) & 0xffff;
    n += 6;
    if (n >= 8) {
      n -= 8;
      out.addByte((bits >> n) & 255);
    }
  }
  if (bits & ((1 << n) - 1) != 0) throw FormatException('non-canonical base64url trailing bits', text);
  return out.takeBytes();
}
