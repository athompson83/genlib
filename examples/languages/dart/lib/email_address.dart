// SPDX-License-Identifier: Apache-2.0
/// WHATWG HTML "valid e-mail address" syntax checks. This is syntax only: proving that someone owns an
/// address still needs a confirmation email. Per WHATWG, `user.@example.com` and `a@b` are valid.
library;

final _email = RegExp(r"^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?"
    r'(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$');

/// True when [s] is an ASCII WHATWG email of at most 254 characters with a local part of at most 64.
bool emailValid(String s) => s.length <= 254 && _email.hasMatch(s) && s.indexOf('@') <= 64;

/// Trims ASCII whitespace, validates and lowercases the domain (the local part keeps its case).
/// Throws [FormatException] when the address is invalid.
String emailNormalize(String s) {
  var start = 0, end = s.length;
  bool space(int c) => c == 0x20 || c == 0x09 || c == 0x0a || c == 0x0c || c == 0x0d;
  while (start < end && space(s.codeUnitAt(start))) {
    start++;
  }
  while (end > start && space(s.codeUnitAt(end - 1))) {
    end--;
  }
  final t = s.substring(start, end);
  if (!emailValid(t)) throw FormatException('invalid email address', s);
  final at = t.indexOf('@');
  return t.substring(0, at + 1) + t.substring(at + 1).toLowerCase();
}
