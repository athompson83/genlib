// SPDX-License-Identifier: Apache-2.0
/// English number words, US style without "and": cardinals for |n| < 10^15 ("forty-two", "one hundred five",
/// "one million one", "negative seven"), ordinal words ("twenty-first", "hundredth", "zeroth"), numeric ordinal
/// suffixes ("11th", "-22nd") and amounts of money from minor units ("one dollar and one cent"). Out-of-range input
/// throws [NumberWordsException].
library;

/// A number outside the supported range or invalid money arguments.
class NumberWordsException implements Exception {
  final String message;
  const NumberWordsException(this.message);
  @override
  String toString() => 'NumberWordsException: $message';
}

const _ones = [
  'zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', //
  'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen',
];
const _tens = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
const _scales = ['', 'thousand', 'million', 'billion', 'trillion'];
const _irregular = {
  'one': 'first', 'two': 'second', 'three': 'third', 'five': 'fifth', //
  'eight': 'eighth', 'nine': 'ninth', 'twelve': 'twelfth',
};
const _limit = 1000000000000000;

String _under1000(int n) {
  final parts = <String>[];
  if (n >= 100) {
    parts.add('${_ones[n ~/ 100]} hundred');
    n %= 100;
  }
  if (n >= 20) {
    parts.add(_tens[n ~/ 10] + (n % 10 != 0 ? '-${_ones[n % 10]}' : ''));
  } else if (n > 0) {
    parts.add(_ones[n]);
  }
  return parts.join(' ');
}

/// Cardinal words for [n] (|n| < 10^15).
String numberToWords(int n) {
  if (n >= _limit || n <= -_limit) throw const NumberWordsException('range');
  if (n == 0) return 'zero';
  if (n < 0) return 'negative ${numberToWords(-n)}';
  final groups = <String>[];
  var i = 0;
  while (n > 0) {
    final g = n % 1000;
    if (g != 0) groups.add(_under1000(g) + (_scales[i].isNotEmpty ? ' ${_scales[i]}' : ''));
    n ~/= 1000;
    i++;
  }
  return groups.reversed.join(' ');
}

String _ordinal(String w) {
  final irregular = _irregular[w];
  if (irregular != null) return irregular;
  if (w.endsWith('y')) return '${w.substring(0, w.length - 1)}ieth';
  return '${w}th';
}

/// Ordinal words for [n] >= 0 ("twenty-first").
String ordinalWords(int n) {
  if (n < 0) throw const NumberWordsException('range');
  final words = numberToWords(n).split(' ');
  final last = words.last;
  final dash = last.indexOf('-');
  words[words.length - 1] = dash >= 0 ? '${last.substring(0, dash)}-${_ordinal(last.substring(dash + 1))}' : _ordinal(last);
  return words.join(' ');
}

/// [n] with its English ordinal suffix ("1st", "12th", "-22nd").
String ordinalSuffix(int n) {
  final a = n.abs();
  final String s;
  if (a % 100 >= 11 && a % 100 <= 13) {
    s = 'th';
  } else {
    s = const {1: 'st', 2: 'nd', 3: 'rd'}[a % 10] ?? 'th';
  }
  return '$n$s';
}

/// Money words for [minor] units ("twelve dollars and one cent"); [exponent] is the number of minor digits (0..3).
String moneyWords(int minor, String major, String minorName, [int exponent = 2]) {
  if (minor < 0 || exponent < 0 || exponent > 3) throw const NumberWordsException('bad');
  var unit = 1;
  for (var i = 0; i < exponent; i++) {
    unit *= 10;
  }
  final whole = minor ~/ unit, frac = minor % unit;
  var out = '${numberToWords(whole)} $major${whole == 1 ? '' : 's'}';
  if (exponent != 0 && frac != 0) out += ' and ${numberToWords(frac)} $minorName${frac == 1 ? '' : 's'}';
  return out;
}
