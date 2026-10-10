// SPDX-License-Identifier: Apache-2.0
/// HMAC-SHA256 signed, expiring pagination cursors: base64url(body) + "." + base64url(mac), unpadded.
library;

import 'dart:convert';

import 'package:crypto/crypto.dart';

import 'src/encoding.dart';

/// Why a cursor was rejected.
enum CursorErrorKind { malformed, badSignature, expired }

/// A rejected cursor; [message] starts with `malformed`, `bad signature` or `expired`.
class CursorException implements Exception {
  final CursorErrorKind kind;
  final String message;
  const CursorException(this.kind, this.message);
  @override
  String toString() => 'CursorException: $message';
}

/// Encodes 1-16 newline-free [values] with an expiry (unix seconds) under a [secret] of at least 32 bytes.
String encodeCursor(List<String> values, List<int> secret, int expiresAt) {
  _checkSecret(secret);
  if (values.isEmpty || values.length > 16) throw ArgumentError.value(values.length, 'values', 'must contain 1 to 16 entries');
  if (values.any((v) => v.contains('\n'))) throw ArgumentError.value(values, 'values', 'must not contain a newline');
  if (expiresAt <= 0) throw RangeError.value(expiresAt, 'expiresAt', 'must be positive');
  final body = utf8.encode('v1\n$expiresAt\n${values.join('\n')}');
  return '${_encode(body)}.${_encode(Hmac(sha256, secret).convert(body).bytes)}';
}

/// Verifies and decodes a cursor; throws [CursorException] when malformed, badly signed or expired at [now].
List<String> decodeCursor(String token, List<int> secret, int now) {
  _checkSecret(secret);
  final dot = token.lastIndexOf('.');
  if (dot < 0) throw const CursorException(CursorErrorKind.malformed, "malformed: missing '.'");
  final bodyPart = token.substring(0, dot), sigPart = token.substring(dot + 1);
  final body = _decode(bodyPart, strictTrailingBits: true) ??
      (throw const CursorException(CursorErrorKind.malformed, 'malformed: invalid body encoding'));
  if (_decode(sigPart, strictTrailingBits: false) == null) {
    throw const CursorException(CursorErrorKind.malformed, 'malformed: invalid signature encoding');
  }
  // Compare the canonical encoding so every character of the signature part is significant.
  final expected = ascii.encode(_encode(Hmac(sha256, secret).convert(body).bytes));
  if (!constantTimeEquals(expected, sigPart.codeUnits)) {
    throw const CursorException(CursorErrorKind.badSignature, 'bad signature');
  }
  final String text;
  try {
    text = utf8.decode(body);
  } on FormatException {
    throw const CursorException(CursorErrorKind.malformed, 'malformed: body is not UTF-8');
  }
  final parts = text.split('\n');
  if (parts.length < 3 || parts[0] != 'v1') throw const CursorException(CursorErrorKind.malformed, 'malformed: unsupported header');
  final expiresAt = RegExp(r'^[0-9]{1,18}$').hasMatch(parts[1]) ? int.parse(parts[1]) : null;
  if (expiresAt == null) throw const CursorException(CursorErrorKind.malformed, 'malformed: invalid expiry');
  if (now >= expiresAt) throw const CursorException(CursorErrorKind.expired, 'expired');
  return parts.sublist(2);
}

void _checkSecret(List<int> secret) {
  if (secret.length < 32) throw ArgumentError.value(secret.length, 'secret', 'must be at least 32 bytes');
}

String _encode(List<int> bytes) => base64Url.encode(bytes).replaceAll('=', '');

const _alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

List<int>? _decode(String text, {required bool strictTrailingBits}) {
  if (text.isEmpty || text.length % 4 == 1) return null;
  var buffer = 0, bits = 0;
  final out = <int>[];
  for (final unit in text.codeUnits) {
    final v = unit < 128 ? _alphabet.indexOf(String.fromCharCode(unit)) : -1;
    if (v < 0) return null;
    buffer = ((buffer << 6) | v) & 0xffff;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out.add((buffer >> bits) & 0xff);
    }
  }
  if (strictTrailingBits && (buffer & ((1 << bits) - 1)) != 0) return null;
  return out;
}
