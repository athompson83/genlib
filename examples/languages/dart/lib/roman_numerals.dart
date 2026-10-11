// SPDX-License-Identifier: Apache-2.0
/// Roman numerals 1..3999 in the standard subtractive form. [fromRoman] is case-insensitive and accepts only the
/// canonical form (so 'IIII', 'IC', 'VX' and '' are rejected). Failures throw [RomanNumeralException].
library;

/// A number outside 1..3999 or text that is not a canonical Roman numeral.
class RomanNumeralException implements Exception {
  final String message;
  const RomanNumeralException(this.message);
  @override
  String toString() => 'RomanNumeralException: $message';
}

const _pairs = [
  (1000, 'M'), (900, 'CM'), (500, 'D'), (400, 'CD'), (100, 'C'), (90, 'XC'), (50, 'L'), //
  (40, 'XL'), (10, 'X'), (9, 'IX'), (5, 'V'), (4, 'IV'), (1, 'I'),
];
const _values = {'I': 1, 'V': 5, 'X': 10, 'L': 50, 'C': 100, 'D': 500, 'M': 1000};

/// Formats 1..3999 as an uppercase Roman numeral.
String toRoman(int n) {
  if (n < 1 || n > 3999) throw const RomanNumeralException('out of range');
  final sb = StringBuffer();
  for (final (v, s) in _pairs) {
    while (n >= v) {
      sb.write(s);
      n -= v;
    }
  }
  return sb.toString();
}

/// Parses a canonical Roman numeral (any case) to its value.
int fromRoman(String text) {
  final u = text.toUpperCase();
  final chars = u.split('');
  if (chars.isEmpty || chars.any((c) => !_values.containsKey(c))) {
    throw const RomanNumeralException('not a roman numeral');
  }
  var total = 0;
  for (var i = 0; i < chars.length; i++) {
    final v = _values[chars[i]]!;
    total += i + 1 < chars.length && _values[chars[i + 1]]! > v ? -v : v;
  }
  if (total < 1 || total > 3999 || toRoman(total) != u)
    throw const RomanNumeralException('not a canonical roman numeral');
  return total;
}
