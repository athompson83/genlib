// SPDX-License-Identifier: Apache-2.0
/// RFC 3492 Punycode (base 36, tmin 1, tmax 26, skew 38, damp 700, initial bias 72, initial n 128, delimiter '-') with
/// 31-bit overflow checks, plus simplified IDNA-style domain conversion. Strings are processed by code point. The
/// domain helpers lowercase ASCII letters only and apply NO Unicode normalization and NO IDNA (UTS #46) mapping:
/// normalize (NFC, case-fold) first when you need that. Failures throw [PunycodeException].
library;

/// A malformed Punycode string, an overflow or an invalid domain name.
class PunycodeException implements Exception {
  final String message;
  const PunycodeException(this.message);
  @override
  String toString() => 'PunycodeException: $message';
}

const _base = 36, _tmin = 1, _tmax = 26, _skew = 38, _damp = 700, _initialBias = 72, _initialN = 128;
const _maxInt = 0x7FFFFFFF;

int _adapt(int delta, int numPoints, bool first) {
  delta = first ? delta ~/ _damp : delta ~/ 2;
  delta += delta ~/ numPoints;
  var k = 0;
  while (delta > ((_base - _tmin) * _tmax) ~/ 2) {
    delta ~/= _base - _tmin;
    k += _base;
  }
  return k + (_base - _tmin + 1) * delta ~/ (delta + _skew);
}

int _digit(int d) => d + 22 + (d < 26 ? 75 : 0);

int _threshold(int k, int bias) => k <= bias ? _tmin : (k >= bias + _tmax ? _tmax : k - bias);

/// Encodes a Unicode string to Punycode (no 'xn--' prefix).
String punycodeEncode(String input) {
  final cps = input.runes.toList();
  final out = <int>[
    for (final c in cps)
      if (c < 0x80) c
  ];
  final b = out.length;
  var h = b;
  if (b > 0) out.add(0x2D);
  var n = _initialN, delta = 0, bias = _initialBias;
  while (h < cps.length) {
    var m = -1;
    for (final c in cps) {
      if (c >= n && (m < 0 || c < m)) m = c;
    }
    if ((m - n) * (h + 1) > _maxInt - delta) throw const PunycodeException('overflow');
    delta += (m - n) * (h + 1);
    n = m;
    for (final c in cps) {
      if (c < n) {
        delta++;
        if (delta > _maxInt) throw const PunycodeException('overflow');
      }
      if (c == n) {
        var q = delta;
        for (var k = _base;; k += _base) {
          final t = _threshold(k, bias);
          if (q < t) break;
          out.add(_digit(t + (q - t) % (_base - t)));
          q = (q - t) ~/ (_base - t);
        }
        out.add(_digit(q));
        bias = _adapt(delta, h + 1, h == b);
        delta = 0;
        h++;
      }
    }
    delta++;
    n++;
  }
  return String.fromCharCodes(out);
}

int _value(int c) {
  if (c >= 48 && c <= 57) return c - 22;
  if (c >= 65 && c <= 90) return c - 65;
  if (c >= 97 && c <= 122) return c - 97;
  throw const PunycodeException('invalid digit');
}

/// Decodes a Punycode string (either digit case) to Unicode; throws on invalid digits, overflow or truncation.
String punycodeDecode(String input) {
  final s = input.runes.toList();
  final i = s.lastIndexOf(0x2D);
  final out = <int>[];
  if (i > 0) {
    for (final c in s.sublist(0, i)) {
      if (c >= 0x80) throw const PunycodeException('non-basic code point');
      out.add(c);
    }
  }
  var pos = i >= 0 ? i + 1 : 0;
  var n = _initialN, idx = 0, bias = _initialBias;
  while (pos < s.length) {
    final old = idx;
    var w = 1;
    for (var k = _base;; k += _base) {
      if (pos >= s.length) throw const PunycodeException('truncated input');
      final d = _value(s[pos++]);
      if (d > (_maxInt - idx) ~/ w) throw const PunycodeException('overflow');
      idx += d * w;
      final t = _threshold(k, bias);
      if (d < t) break;
      if (w > _maxInt ~/ (_base - t)) throw const PunycodeException('overflow');
      w *= _base - t;
    }
    final len = out.length + 1;
    bias = _adapt(idx - old, len, old == 0);
    if (idx ~/ len > _maxInt - n) throw const PunycodeException('overflow');
    n += idx ~/ len;
    idx %= len;
    if (n > 0x10FFFF || (n >= 0xD800 && n <= 0xDFFF)) throw const PunycodeException('invalid code point');
    out.insert(idx, n);
    idx++;
  }
  return String.fromCharCodes(out);
}

/// Converts a domain to ASCII ('xn--' labels); lowercases ASCII only, no normalization or IDNA mapping.
String domainToAscii(String domain) {
  final trailing = domain.endsWith('.') && domain.length > 1;
  final labels = (trailing ? domain.substring(0, domain.length - 1) : domain).split('.');
  final res = <String>[];
  for (final l in labels) {
    if (l.isEmpty) throw const PunycodeException('empty label');
    var a = String.fromCharCodes(l.runes.map((c) => c >= 0x41 && c <= 0x5A ? c + 32 : c));
    if (a.runes.any((c) => c >= 0x80)) a = 'xn--${punycodeEncode(a)}';
    if (a.runes.length > 63) throw const PunycodeException('label too long');
    res.add(a);
  }
  final out = res.join('.');
  if (out.runes.length > 253) throw const PunycodeException('name too long');
  return trailing ? '$out.' : out;
}

/// Decodes each 'xn--' label (case-insensitive prefix) of a domain; no normalization or IDNA mapping.
String domainToUnicode(String domain) => domain
    .split('.')
    .map((l) => l.length >= 4 && l.substring(0, 4).toLowerCase() == 'xn--' ? punycodeDecode(l.substring(4)) : l)
    .join('.');
