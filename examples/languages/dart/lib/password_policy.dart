// SPDX-License-Identifier: Apache-2.0
/// NIST SP 800-63B style password checks with no composition rules. Use a large breached-password list as the
/// blocklist, allow every printable character including spaces and emoji, never truncate, hash with a slow password
/// hash and rate-limit attempts; this check is not a substitute for those.
library;

const _alnum = '0123456789abcdefghijklmnopqrstuvwxyz';

/// Failure codes in reporting order.
const passwordFailureOrder = ['too-short', 'too-long', 'control-characters', 'blocklisted', 'contains-context', 'repetitive'];

/// Check result; [failures] follow [passwordFailureOrder].
class PasswordResult {
  final bool ok;
  final List<String> failures;
  const PasswordResult(this.ok, this.failures);
}

String _asciiLower(String s) => String.fromCharCodes(s.codeUnits.map((c) => c >= 0x41 && c <= 0x5a ? c + 32 : c));

/// Checks [password] (lengths in Unicode code points). [context] holds the user's name, email parts or the site name;
/// entries shorter than 4 code points are ignored. Throws [ArgumentError] when minLength < 1 or maxLength < minLength.
PasswordResult checkPassword(String password,
    {int minLength = 15, int maxLength = 64, List<String> blocklist = const [], List<String> context = const []}) {
  if (minLength < 1 || maxLength < minLength) throw ArgumentError('require 1 <= minLength <= maxLength');
  final cps = password.runes.toList();
  final fails = <String>[];
  if (cps.length < minLength) fails.add('too-short');
  if (cps.length > maxLength) fails.add('too-long');
  if (cps.any((c) => c < 0x20 || (c >= 0x7f && c <= 0x9f))) fails.add('control-characters');
  final low = _asciiLower(password);
  if (blocklist.any((b) => _asciiLower(b) == low)) fails.add('blocklisted');
  if (context.any((c) => c.runes.length >= 4 && low.contains(_asciiLower(c)))) fails.add('contains-context');
  if (_repetitive(cps)) fails.add('repetitive');
  return PasswordResult(fails.isEmpty, fails);
}

bool _repetitive(List<int> cps) {
  outer:
  for (var i = 0; i + 3 < cps.length; i++) {
    if (cps[i] == cps[i + 1] && cps[i] == cps[i + 2] && cps[i] == cps[i + 3]) return true;
    final w = <int>[];
    for (var k = i; k < i + 4; k++) {
      final c = cps[k] >= 0x41 && cps[k] <= 0x5a ? cps[k] + 32 : cps[k];
      if (c > 0x7f || !_alnum.contains(String.fromCharCode(c))) continue outer;
      w.add(c);
    }
    final fwd = String.fromCharCodes(w), rev = String.fromCharCodes(w.reversed);
    if (_alnum.contains(fwd) || _alnum.contains(rev)) return true;
  }
  return false;
}
