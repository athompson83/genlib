// SPDX-License-Identifier: Apache-2.0
/// Argon2id password hashing with package:cryptography (pure Dart).
/// package:cryptography supplies the KDF only, so this file adds the PHC
/// string format used by other languages: $argon2id$v=19$m=..,t=..,p=..$salt$hash.
/// Parameters: OWASP Password Storage Cheat Sheet minimum m=19456 KiB, t=2, p=1.
///
/// The pure-Dart KDF is much slower than native libargon2; on a server prefer
/// verifying on a backend in another language or benchmark before adopting.
library;

import 'dart:convert';
import 'dart:math';

import 'package:bcrypt/bcrypt.dart';
import 'package:cryptography/cryptography.dart';

const int memoryKiB = 19456;
const int iterations = 2;
const int parallelism = 1;
const int _saltLength = 16;
const int _hashLength = 32;

String _b64(List<int> bytes) => base64.encode(bytes).replaceAll('=', '');
List<int> _unb64(String s) => base64.decode(s.padRight((s.length + 3) ~/ 4 * 4, '='));

Future<List<int>> _derive(String password, List<int> salt, int m, int t, int p, int len) async {
  final kdf = Argon2id(memory: m, iterations: t, parallelism: p, hashLength: len);
  final key = await kdf.deriveKey(secretKey: SecretKey(utf8.encode(password)), nonce: salt);
  return key.extractBytes();
}

Future<String> hashPassword(String password,
    {int m = memoryKiB, int t = iterations, int p = parallelism}) async {
  final rnd = Random.secure();
  final salt = List<int>.generate(_saltLength, (_) => rnd.nextInt(256));
  final hash = await _derive(password, salt, m, t, p, _hashLength);
  return '\$argon2id\$v=19\$m=$m,t=$t,p=$p\$${_b64(salt)}\$${_b64(hash)}';
}

/// Result of a check; persist [rehash] when it is not null.
class Verified {
  final bool ok;
  final String? rehash;
  const Verified(this.ok, [this.rehash]);
}

bool _constantTimeEquals(List<int> a, List<int> b) {
  if (a.length != b.length) return false;
  var diff = 0;
  for (var i = 0; i < a.length; i++) {
    diff |= a[i] ^ b[i];
  }
  return diff == 0;
}

Future<Verified> verifyPassword(String stored, String password) async {
  if (stored.startsWith(r'$2a$') || stored.startsWith(r'$2b$') || stored.startsWith(r'$2y$')) {
    bool ok;
    try {
      ok = BCrypt.checkpw(password, stored);
    } catch (_) {
      return const Verified(false);
    }
    return ok ? Verified(true, await hashPassword(password)) : const Verified(false);
  }
  final parts = stored.split(r'$');
  if (parts.length != 6 || parts[1] != 'argon2id' || parts[2] != 'v=19') return const Verified(false);
  final params = <String, int>{};
  for (final kv in parts[3].split(',')) {
    final pair = kv.split('=');
    final value = pair.length == 2 ? int.tryParse(pair[1]) : null;
    if (value == null || !const {'m', 't', 'p'}.contains(pair[0])) return const Verified(false);
    params[pair[0]] = value;
  }
  final m = params['m'], t = params['t'], p = params['p'];
  if (params.length != 3 || m == null || t == null || p == null ||
      t < 1 || p < 1 || p > 255 || m < 8 * p || m > 4 * 1024 * 1024) {
    return const Verified(false);
  }
  List<int> salt, expected;
  try {
    salt = _unb64(parts[4]);
    expected = _unb64(parts[5]);
  } on FormatException {
    return const Verified(false);
  }
  if (salt.length < 8 || expected.length < 16) return const Verified(false);
  final actual = await _derive(password, salt, m, t, p, expected.length);
  if (!_constantTimeEquals(actual, expected)) return const Verified(false);
  final outdated = m < memoryKiB || t < iterations || expected.length < _hashLength;
  return Verified(true, outdated ? await hashPassword(password) : null);
}

/// Fallback reader/writer for bcrypt (72-byte limit; OWASP cost >= 10).
String bcryptHash(String password, {int cost = 12}) {
  if (utf8.encode(password).length > 72) {
    throw ArgumentError('bcrypt truncates input over 72 bytes');
  }
  return BCrypt.hashpw(password, BCrypt.gensalt(logRounds: cost));
}
