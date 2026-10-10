// SPDX-License-Identifier: Apache-2.0
/// Check-digit validation: Luhn (payment cards), IBAN (ISO 13616 mod 97), GTIN/EAN/UPC and ISBN-10/13.
library;

final _separators = RegExp(r'[ -]');
final _digits = RegExp(r'^[0-9]+$');
final _iban = RegExp(r'^[A-Z]{2}[0-9]{2}[A-Z0-9]{11,30}$');
final _isbn10 = RegExp(r'^[0-9]{9}[0-9X]$');

String _strip(String s) => s.replaceAll(_separators, '');

/// True when [s] (spaces and hyphens ignored) is at least two ASCII digits with a valid Luhn checksum.
bool luhnValid(String s) {
  final t = _strip(s);
  if (t.length < 2 || !_digits.hasMatch(t)) return false;
  var total = 0;
  for (var i = 0; i < t.length; i++) {
    var d = t.codeUnitAt(t.length - 1 - i) - 0x30;
    if (i.isOdd) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    total += d;
  }
  return total % 10 == 0;
}

/// The digit that makes `payload + digit` Luhn-valid; throws [FormatException] for a non-digit payload.
String luhnCheckDigit(String payload) {
  final t = _strip(payload);
  if (t.isEmpty || !_digits.hasMatch(t)) throw FormatException('Luhn payload must be ASCII digits', payload);
  for (var d = 0; d < 10; d++) {
    if (luhnValid('$t$d')) return '$d';
  }
  throw StateError('unreachable');
}

/// True when [s] (spaces ignored, case-insensitive) has IBAN shape and its mod-97 remainder is 1.
bool ibanValid(String s) {
  final t = s.replaceAll(' ', '').toUpperCase();
  if (!_iban.hasMatch(t)) return false;
  final r = t.substring(4) + t.substring(0, 4);
  var rem = 0;
  for (final c in r.codeUnits) {
    final v = c <= 0x39 ? c - 0x30 : c - 55;
    rem = (rem * (v > 9 ? 100 : 10) + v) % 97;
  }
  return rem == 1;
}

/// A valid IBAN as uppercase groups of four; throws [FormatException] when invalid.
String ibanFormat(String s) {
  final t = s.replaceAll(' ', '').toUpperCase();
  if (!ibanValid(t)) throw FormatException('invalid IBAN', s);
  return [for (var i = 0; i < t.length; i += 4) t.substring(i, i + 4 > t.length ? t.length : i + 4)].join(' ');
}

/// True for a GTIN-8/12/13/14 (EAN/UPC) whose weighted sum (1,3,1,3... from the right) is a multiple of 10.
bool gtinValid(String s) {
  final t = _strip(s);
  if (!_digits.hasMatch(t) || !const {8, 12, 13, 14}.contains(t.length)) return false;
  var total = 0;
  for (var i = 0; i < t.length; i++) {
    total += (t.codeUnitAt(t.length - 1 - i) - 0x30) * (i.isOdd ? 3 : 1);
  }
  return total % 10 == 0;
}

/// True for an ISBN-10 (nine digits then a digit or X, weighted mod 11).
bool isbn10Valid(String s) {
  final t = _strip(s).toUpperCase();
  if (!_isbn10.hasMatch(t)) return false;
  var total = 0;
  for (var i = 0; i < 10; i++) {
    total += (10 - i) * (t[i] == 'X' ? 10 : t.codeUnitAt(i) - 0x30);
  }
  return total % 11 == 0;
}

/// True for a 978/979-prefixed ISBN-13 with a valid GTIN check digit.
bool isbn13Valid(String s) {
  final t = _strip(s);
  return t.length == 13 && (t.startsWith('978') || t.startsWith('979')) && gtinValid(t);
}

/// Converts a valid ISBN-10 to its 978-prefixed ISBN-13; throws [FormatException] when invalid.
String isbn10To13(String s) {
  final t = _strip(s).toUpperCase();
  if (!isbn10Valid(t)) throw FormatException('invalid ISBN-10', s);
  final body = '978${t.substring(0, 9)}';
  for (var d = 0; d < 10; d++) {
    if (gtinValid('$body$d')) return '$body$d';
  }
  throw StateError('unreachable');
}
