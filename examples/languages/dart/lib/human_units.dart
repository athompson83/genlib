// SPDX-License-Identifier: Apache-2.0
/// Human-readable byte sizes, durations and relative times with exact integer rounding (half up).
library;

const _siUnits = ['B', 'kB', 'MB', 'GB', 'TB', 'PB', 'EB'];
const _iecUnits = ['B', 'KiB', 'MiB', 'GiB', 'TiB', 'PiB', 'EiB'];
final _bytesPattern = RegExp(r'^\s*([0-9]+)(?:\.([0-9]+))?\s*([A-Za-z]*)\s*$');
final _maxInt64 = (BigInt.one << 63) - BigInt.one;
final _byteUnits = <String, BigInt>{
  '': BigInt.one,
  'b': BigInt.one,
  for (var i = 1; i <= 6; i++) ...{
    ['kb', 'mb', 'gb', 'tb', 'pb', 'eb'][i - 1]: BigInt.from(1000).pow(i),
    ['kib', 'mib', 'gib', 'tib', 'pib', 'eib'][i - 1]: BigInt.from(1024).pow(i),
  },
};

BigInt _roundDiv(BigInt n, BigInt d) => (BigInt.two * n + d) ~/ (BigInt.two * d);
int _roundDivInt(int n, int d) => (2 * n + d) ~/ (2 * d);

/// Formats a byte count with SI (`si`: kB, MB...) or IEC (`iec`: KiB, MiB...) units and 0..3 [decimals], trailing
/// zeros removed: 1536 iec -> `1.5 KiB`, 999950 si -> `1 MB`. [n] may be as large as 2^63-1.
String formatBytes(int n, {String base = 'si', int decimals = 1}) {
  if (n < 0) throw RangeError.value(n, 'n', 'must not be negative');
  if (decimals < 0 || decimals > 3) throw RangeError.range(decimals, 0, 3, 'decimals');
  final units = switch (base) {
    'si' => _siUnits,
    'iec' => _iecUnits,
    _ => throw ArgumentError.value(base, 'base', 'must be si or iec'),
  };
  final step = BigInt.from(base == 'si' ? 1000 : 1024);
  final big = BigInt.from(n);
  if (big < step) return '$n B';
  var i = 1;
  while (i < 6 && big >= step.pow(i + 1)) {
    i++;
  }
  final scale = BigInt.from(10).pow(decimals);
  var v = _roundDiv(big * scale, step.pow(i));
  if (v >= step * scale && i < 6) {
    i++;
    v = _roundDiv(big * scale, step.pow(i));
  }
  var s = (v ~/ scale).toString();
  if (decimals > 0) {
    var frac = (v % scale).toString().padLeft(decimals, '0');
    while (frac.endsWith('0')) {
      frac = frac.substring(0, frac.length - 1);
    }
    if (frac.isNotEmpty) s += '.$frac';
  }
  return '$s ${units[i]}';
}

/// Parses `1.5 GiB`, `2.25MB`, ` 10 b ` or `512` to bytes (kb..eb = powers of 1000, kib..eib = powers of 1024,
/// case-insensitive), rounding half up. Throws [FormatException] for signs, exponents, unknown units or values above
/// 2^63-1.
int parseBytes(String text) {
  final m = _bytesPattern.firstMatch(text);
  if (m == null) throw FormatException('invalid byte size', text);
  final mult = _byteUnits[m.group(3)!.toLowerCase()];
  if (mult == null) throw FormatException('unknown byte unit', text);
  final frac = m.group(2) ?? '';
  final r = _roundDiv(BigInt.parse(m.group(1)! + frac) * mult, BigInt.from(10).pow(frac.length));
  if (r > _maxInt64) throw FormatException('byte size exceeds 2^63-1', text);
  return r.toInt();
}

/// Below one second `850ms`; otherwise the two largest non-zero units of d, h, m, s (`1h 2m`, `1d 1h`, `45s`).
String formatDuration(int ms) {
  if (ms < 0) throw RangeError.value(ms, 'ms', 'must not be negative');
  if (ms < 1000) return '${ms}ms';
  var s = ms ~/ 1000;
  final parts = <String>[];
  for (final (name, size) in const [('d', 86400), ('h', 3600), ('m', 60), ('s', 1)]) {
    final q = s ~/ size;
    s %= size;
    if (q > 0) parts.add('$q$name');
  }
  return parts.take(2).join(' ');
}

/// Relative phrase for a delta in seconds (positive = future): `just now`, `in 3 minutes`, `2 months ago`.
String relativeTime(int deltaSeconds) {
  final a = deltaSeconds.abs();
  final String? p;
  if (a < 45) {
    p = null;
  } else if (a < 90) {
    p = 'a minute';
  } else if (a < 45 * 60) {
    p = '${_roundDivInt(a, 60)} minutes';
  } else if (a < 90 * 60) {
    p = 'an hour';
  } else if (a < 22 * 3600) {
    p = '${_roundDivInt(a, 3600)} hours';
  } else if (a < 36 * 3600) {
    p = 'a day';
  } else if (a < 26 * 86400) {
    p = '${_roundDivInt(a, 86400)} days';
  } else if (a < 46 * 86400) {
    p = 'a month';
  } else if (a < 320 * 86400) {
    p = '${_roundDivInt(a, 2629746)} months'; // average Gregorian month
  } else if (a < 548 * 86400) {
    p = 'a year';
  } else {
    p = '${_roundDivInt(a, 31556952)} years'; // average Gregorian year
  }
  if (p == null) return 'just now';
  return deltaSeconds > 0 ? 'in $p' : '$p ago';
}
