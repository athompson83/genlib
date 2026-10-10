// SPDX-License-Identifier: Apache-2.0
/// Expiring signed URLs: `target?...&expires=<unix seconds>&signature=<base64url HMAC-SHA256>`.
library;

import 'dart:convert';

import 'package:crypto/crypto.dart';

import 'src/encoding.dart';

/// Why a signed URL was rejected.
enum SignedUrlErrorKind { malformed, badSignature, expired }

/// A rejected signed URL; [message] starts with `malformed`, `bad signature` or `expired`.
class SignedUrlException implements Exception {
  final SignedUrlErrorKind kind;
  final String message;
  const SignedUrlException(this.kind, this.message);
  @override
  String toString() => 'SignedUrlException: $message';
}

const _marker = '&signature=';
final _signature = RegExp(r'^[A-Za-z0-9_-]{43}$');
final _decimal = RegExp(r'^[0-9]{1,18}$');

/// Signs [target] (a path plus optional query, starting with `/`, without `#`) so it is valid until
/// [expiresUnixSeconds]. Throws [ArgumentError] for an empty secret, a bad target, or a query that
/// already has an `expires` or `signature` parameter.
String signUrl(String target, String secret, int expiresUnixSeconds) {
  if (secret.isEmpty) throw ArgumentError.value(secret, 'secret', 'must be non-empty');
  if (!target.startsWith('/') || target.contains('#')) {
    throw ArgumentError.value(target, 'target', 'must start with "/" and contain no "#"');
  }
  if (expiresUnixSeconds < 0) throw RangeError.value(expiresUnixSeconds, 'expiresUnixSeconds', 'must be >= 0');
  final q = target.indexOf('?');
  if (q >= 0) {
    for (final name in _names(target.substring(q + 1))) {
      if (name == 'expires' || name == 'signature') {
        throw ArgumentError.value(target, 'target', 'query already has an "$name" parameter');
      }
    }
  }
  final message = '$target${q >= 0 ? '&' : '?'}expires=$expiresUnixSeconds';
  return '$message$_marker${_mac(secret, message)}';
}

/// Verifies [signed] at [nowUnixSeconds]; throws [SignedUrlException] when malformed, when the signature
/// does not match, or when `now > expires` (checked after the signature, so `expired` implies authentic).
void verifyUrl(String signed, String secret, int nowUnixSeconds) {
  if (secret.isEmpty) throw ArgumentError.value(secret, 'secret', 'must be non-empty');
  final at = signed.lastIndexOf(_marker);
  if (at < 0) throw const SignedUrlException(SignedUrlErrorKind.malformed, 'malformed: missing signature');
  final message = signed.substring(0, at), signature = signed.substring(at + _marker.length);
  if (!_signature.hasMatch(signature)) {
    throw const SignedUrlException(SignedUrlErrorKind.malformed, 'malformed: signature must be 43 base64url characters');
  }
  final q = message.indexOf('?');
  if (!message.startsWith('/') || q < 0) throw const SignedUrlException(SignedUrlErrorKind.malformed, 'malformed: missing query');
  String? expires;
  var count = 0;
  for (final pair in message.substring(q + 1).split('&')) {
    final eq = pair.indexOf('=');
    if ((eq < 0 ? pair : pair.substring(0, eq)) == 'expires') {
      count++;
      expires = eq < 0 ? '' : pair.substring(eq + 1);
    }
  }
  if (count != 1) throw const SignedUrlException(SignedUrlErrorKind.malformed, 'malformed: expected exactly one expires parameter');
  if (!_decimal.hasMatch(expires!)) throw const SignedUrlException(SignedUrlErrorKind.malformed, 'malformed: expires is not decimal');
  if (!constantTimeEquals(ascii.encode(_mac(secret, message)), ascii.encode(signature))) {
    throw const SignedUrlException(SignedUrlErrorKind.badSignature, 'bad signature');
  }
  if (nowUnixSeconds > int.parse(expires)) throw const SignedUrlException(SignedUrlErrorKind.expired, 'expired');
}

Iterable<String> _names(String query) => query.split('&').where((p) => p.isNotEmpty).map((p) {
      final eq = p.indexOf('=');
      return eq < 0 ? p : p.substring(0, eq);
    });

String _mac(String secret, String message) =>
    base64Url.encode(Hmac(sha256, utf8.encode(secret)).convert(utf8.encode(message)).bytes).replaceAll('=', '');
