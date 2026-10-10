// SPDX-License-Identifier: Apache-2.0
/// Money as integer minor units: exact parsing and formatting, banker's rounding of rates and
/// remainder-safe allocation. Arithmetic uses [BigInt] and results are checked against the signed 64-bit range.
library;

final _decimal = RegExp(r'^(-?)([0-9]+)(?:\.([0-9]+))?$');
final _minInt64 = BigInt.parse('-9223372036854775808');
final _maxInt64 = BigInt.parse('9223372036854775807');

const Map<String, int> currencyExponents = {
  'USD': 2, 'EUR': 2, 'GBP': 2, 'CAD': 2, 'AUD': 2, 'CHF': 2, 'CNY': 2, 'INR': 2, 'MXN': 2, 'BRL': 2, 'SEK': 2, //
  'NOK': 2, 'DKK': 2, 'NZD': 2, 'SGD': 2, 'HKD': 2, 'ZAR': 2, //
  'JPY': 0, 'KRW': 0, 'VND': 0, 'CLP': 0, 'ISK': 0, //
  'BHD': 3, 'KWD': 3, 'JOD': 3, 'OMR': 3, 'TND': 3,
};

/// The ISO 4217 minor-unit exponent of a supported (uppercase) currency code.
int currencyExponent(String currency) =>
    currencyExponents[currency] ?? (throw ArgumentError.value(currency, 'currency', 'unsupported currency'));

/// Parses `-?DIGITS(.DIGITS)?` into minor units; more fraction digits than the currency allows is an error.
int toMinor(String amount, String currency) {
  final exp = currencyExponent(currency);
  final m = _parse(amount, 'amount');
  final frac = m.group(3) ?? '';
  if (frac.length > exp) throw ArgumentError.value(amount, 'amount', 'more than $exp fraction digits for $currency');
  final value = BigInt.parse(m.group(2)! + frac.padRight(exp, '0'));
  return _toInt64(m.group(1) == '-' ? -value : value, 'amount');
}

/// Formats minor units as a plain decimal with exactly the currency's fraction digits (no symbol or grouping).
String formatMinor(int minor, String currency) {
  final exp = currencyExponent(currency);
  final digits = BigInt.from(minor).abs().toString().padLeft(exp + 1, '0');
  final sign = minor < 0 ? '-' : '';
  if (exp == 0) return '$sign$digits';
  return '$sign${digits.substring(0, digits.length - exp)}.${digits.substring(digits.length - exp)}';
}

/// Multiplies by a decimal [rate] (at most 9 fraction digits) and rounds the exact product half to even.
int applyRate(int minor, String rate) {
  final m = _parse(rate, 'rate');
  final frac = m.group(3) ?? '';
  if (frac.length > 9) throw ArgumentError.value(rate, 'rate', 'more than 9 fraction digits');
  var numerator = BigInt.parse(m.group(2)! + frac);
  if (m.group(1) == '-') numerator = -numerator;
  final product = BigInt.from(minor) * numerator;
  final divisor = BigInt.from(10).pow(frac.length);
  var quotient = product ~/ divisor; // truncates toward zero
  final remainder = product.remainder(divisor);
  final cmp = (remainder.abs() * BigInt.two).compareTo(divisor);
  if (cmp > 0 || (cmp == 0 && quotient.isOdd)) quotient += BigInt.from(product.sign);
  return _toInt64(quotient, 'result');
}

/// Splits [total] by non-negative integer [ratios] with the largest-remainder method: shares are
/// floor(|total| * r / sum) and leftover units go one each to the entries with the largest remainder
/// (|total| * r mod sum), ties to the lower index. Negative totals are allocated by magnitude and negated.
List<int> allocate(int total, List<int> ratios) {
  if (ratios.isEmpty) throw ArgumentError.value(ratios, 'ratios', 'must not be empty');
  if (ratios.any((r) => r < 0)) throw ArgumentError.value(ratios, 'ratios', 'must be non-negative');
  final sum = ratios.fold(BigInt.zero, (s, r) => s + BigInt.from(r));
  if (sum == BigInt.zero) throw ArgumentError.value(ratios, 'ratios', 'must have a positive sum');
  final abs = BigInt.from(total).abs();
  final shares = [for (final r in ratios) abs * BigInt.from(r) ~/ sum];
  final remainders = [for (final r in ratios) abs * BigInt.from(r) % sum];
  final left = (abs - shares.fold(BigInt.zero, (s, v) => s + v)).toInt(); // left < ratios.length
  // List.sort is not guaranteed stable, so compare indices explicitly on ties.
  final order = List<int>.generate(ratios.length, (i) => i)
    ..sort((a, b) {
      final c = remainders[b].compareTo(remainders[a]);
      return c != 0 ? c : a.compareTo(b);
    });
  for (final i in order.take(left)) {
    shares[i] += BigInt.one;
  }
  return [for (final s in shares) _toInt64(total < 0 ? -s : s, 'share')];
}

RegExpMatch _parse(String text, String name) =>
    _decimal.firstMatch(text) ?? (throw ArgumentError.value(text, name, 'not a plain decimal (-?DIGITS(.DIGITS)?)'));

int _toInt64(BigInt value, String what) {
  if (value < _minInt64 || value > _maxInt64) throw RangeError('$what does not fit in a 64-bit integer');
  return value.toInt();
}
