// SPDX-License-Identifier: Apache-2.0
/// Stripe-style `t=<ts>,v1=<hex HMAC-SHA256(secret, "ts.body")>` webhook signatures.
library;

import 'dart:convert';

import 'package:crypto/crypto.dart';

import 'src/encoding.dart';

/// Why a webhook signature was rejected.
enum WebhookErrorKind { malformed, badSignature, expired }

/// A rejected webhook; [message] starts with `malformed`, `bad signature` or `expired`.
class WebhookException implements Exception {
  final WebhookErrorKind kind;
  final String message;
  const WebhookException(this.kind, this.message);
  @override
  String toString() => 'WebhookException: $message';
}

final _decimal = RegExp(r'^[0-9]{1,18}$');
final _v1 = RegExp(r'^[0-9a-f]{64}$');

/// Signs [body] at [timestampSeconds] and returns the signature header.
String signWebhook(String secret, int timestampSeconds, String body) {
  _checkSecret(secret);
  if (timestampSeconds < 0) throw RangeError.value(timestampSeconds, 'timestampSeconds', 'must be >= 0');
  return 't=$timestampSeconds,v1=${_hex(_mac(secret, '$timestampSeconds', body))}';
}

/// Verifies a signature header; throws [WebhookException] when malformed, when no v1 matches, or when
/// |now - t| exceeds [toleranceSeconds] (checked after the signature, so `expired` implies authentic).
void verifyWebhook(String header, String body, String secret, int nowSeconds, {int toleranceSeconds = 300}) {
  _checkSecret(secret);
  if (toleranceSeconds < 0) throw RangeError.value(toleranceSeconds, 'toleranceSeconds', 'must be >= 0');
  String? ts;
  final signatures = <List<int>>[];
  for (final rawPair in header.split(',')) {
    final eq = rawPair.indexOf('=');
    if (eq < 0) throw const WebhookException(WebhookErrorKind.malformed, 'malformed: expected key=value pairs');
    final key = rawPair.substring(0, eq).trim(), value = rawPair.substring(eq + 1).trim();
    if (key == 't') {
      if (ts != null) throw const WebhookException(WebhookErrorKind.malformed, 'malformed: more than one t');
      if (!_decimal.hasMatch(value)) throw const WebhookException(WebhookErrorKind.malformed, 'malformed: t is not a decimal timestamp');
      ts = value;
    } else if (key == 'v1') {
      if (!_v1.hasMatch(value)) {
        throw const WebhookException(WebhookErrorKind.malformed, 'malformed: v1 must be 64 lowercase hex characters');
      }
      signatures.add([for (var i = 0; i < 64; i += 2) int.parse(value.substring(i, i + 2), radix: 16)]);
    }
  }
  if (ts == null) throw const WebhookException(WebhookErrorKind.malformed, 'malformed: missing t');
  if (signatures.isEmpty) throw const WebhookException(WebhookErrorKind.malformed, 'malformed: missing v1');
  final expected = _mac(secret, ts, body);
  var match = false;
  for (final sig in signatures) {
    if (constantTimeEquals(expected, sig)) match = true;
  }
  if (!match) throw const WebhookException(WebhookErrorKind.badSignature, 'bad signature');
  if ((BigInt.from(nowSeconds) - BigInt.parse(ts)).abs() > BigInt.from(toleranceSeconds)) {
    throw const WebhookException(WebhookErrorKind.expired, 'expired');
  }
}

List<int> _mac(String secret, String ts, String body) => Hmac(sha256, utf8.encode(secret)).convert(utf8.encode('$ts.$body')).bytes;

String _hex(List<int> bytes) => bytes.map((b) => b.toRadixString(16).padLeft(2, '0')).join();

void _checkSecret(String secret) {
  if (secret.isEmpty) throw ArgumentError.value(secret, 'secret', 'must be non-empty');
}
