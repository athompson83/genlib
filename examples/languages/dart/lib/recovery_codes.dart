// SPDX-License-Identifier: Apache-2.0
/// MFA backup codes using Crockford base32 (no I, L, O, U); store only keyed hashes.
library;

import 'dart:convert';
import 'dart:math';

import 'package:crypto/crypto.dart';

import 'src/encoding.dart';

const recoveryAlphabet = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

/// Generates unique codes such as "7K3QX-9MNP2"; each symbol uses 5 unbiased CSPRNG bits.
List<String> generateRecoveryCodes({int count = 10, int groups = 2, int groupLength = 5}) {
  if (count < 1 || count > 1000) throw RangeError.range(count, 1, 1000, 'count');
  _checkShape(groups, groupLength);
  final random = Random.secure();
  final codes = <String>{};
  while (codes.length < count) {
    final out = StringBuffer();
    for (var i = 0; i < groups * groupLength; i++) {
      if (i > 0 && i % groupLength == 0) out.write('-');
      out.write(recoveryAlphabet[random.nextInt(256) & 31]);
    }
    codes.add(out.toString());
  }
  return codes.toList();
}

/// Uppercases, strips spaces/hyphens, maps O→0 and I/L→1, then checks alphabet and length.
String normalizeRecoveryCode(String input, {int groups = 2, int groupLength = 5}) {
  _checkShape(groups, groupLength);
  final out = StringBuffer();
  for (final raw in input.split('')) {
    if (raw == ' ' || raw == '-') continue;
    final upper = raw.codeUnitAt(0) < 0x80 ? raw.toUpperCase() : raw;
    final c = switch (upper) { 'O' => '0', 'I' || 'L' => '1', _ => upper };
    if (!recoveryAlphabet.contains(c)) throw FormatException('invalid recovery code character', raw);
    out.write(c);
  }
  if (out.length != groups * groupLength) {
    throw FormatException('recovery code must have ${groups * groupLength} characters');
  }
  return out.toString();
}

/// Lowercase hex HMAC-SHA256(key, normalized code).
String hashRecoveryCode(String code, List<int> key) {
  if (key.isEmpty) throw ArgumentError.value(key, 'key', 'must not be empty');
  return Hmac(sha256, key).convert(ascii.encode(normalizeRecoveryCode(code))).toString();
}

/// Returns the index of the matching stored hash or -1; compares every hash without early exit.
int findRecoveryCode(String input, List<String> storedHashes, List<int> key) {
  final String candidate;
  try {
    candidate = hashRecoveryCode(input, key);
  } on FormatException {
    return -1;
  }
  final candidateBytes = utf8.encode(candidate);
  var found = -1;
  for (var i = 0; i < storedHashes.length; i++) {
    final equal = constantTimeEquals(candidateBytes, utf8.encode(storedHashes[i]));
    if (equal && found < 0) found = i;
  }
  return found;
}

void _checkShape(int groups, int groupLength) {
  if (groups < 1 || groupLength < 1 || groups * groupLength > 64) {
    throw ArgumentError('invalid code shape: $groups groups of $groupLength');
  }
}
