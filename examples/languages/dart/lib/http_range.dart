// SPDX-License-Identifier: Apache-2.0
/// RFC 9110 byte Range requests and Content-Range values with 64-bit sizes.
library;

const _maxSpecs = 100;
final _unit = RegExp(r'^[A-Za-z]+$');
final _digits = RegExp(r'^[0-9]+$');
const _maxInt = 0x7fffffffffffffff;

/// How to answer a request carrying a Range header.
enum RangeKind {
  /// No or unusable Range header: respond 200 with the full body.
  none,

  /// No satisfiable range: respond 416 with [RangeResult.contentRange].
  unsatisfiable,

  /// Respond 206 with the listed inclusive byte ranges.
  ranges,
}

/// Result of [parseRange]; [ranges] are inclusive `(start, end)` pairs in header order and not merged.
class RangeResult {
  final RangeKind kind;
  final List<(int, int)> ranges;
  final String? contentRange;
  const RangeResult(this.kind, [this.ranges = const [], this.contentRange]);

  @override
  String toString() => switch (kind) {
    RangeKind.none => 'none',
    RangeKind.unsatisfiable => 'unsatisfiable $contentRange',
    RangeKind.ranges => 'ranges ${ranges.map((r) => '${r.$1}-${r.$2}').join(' ')}',
  };
}

/// Interprets a Range [header] for a representation of [size] bytes. A missing, malformed or non-bytes header (or more
/// than 100 specs) yields [RangeKind.none]; specs starting at or beyond the end are dropped, ends are clamped to size-1,
/// and when every spec is dropped the result is [RangeKind.unsatisfiable] with `bytes */size`.
RangeResult parseRange(String? header, int size) {
  if (size < 0) throw RangeError.range(size, 0, null, 'size');
  const none = RangeResult(RangeKind.none);
  if (header == null) return none;
  var i = 0;
  while (i < header.length && (header[i] == ' ' || header[i] == '\t')) {
    i++;
  }
  final eq = header.indexOf('=', i);
  if (eq <= i) return none;
  final unit = header.substring(i, eq), rest = header.substring(eq + 1);
  if (!_unit.hasMatch(unit) || unit.toLowerCase() != 'bytes' || rest.contains('\n')) return none;
  final specs = rest.split(',').map(_trim).toList();
  if (specs.length > _maxSpecs || specs.any((p) => p.isEmpty)) return none;
  final ranges = <(int, int)>[];
  for (final spec in specs) {
    if (spec.startsWith('-')) {
      final n = spec.substring(1);
      if (!_digits.hasMatch(n)) return none;
      final suffix = _saturating(n);
      if (suffix == 0 || size == 0) continue;
      ranges.add((size - suffix < 0 ? 0 : size - suffix, size - 1));
      continue;
    }
    final dash = spec.indexOf('-');
    if (dash <= 0) return none;
    final a = spec.substring(0, dash), b = spec.substring(dash + 1);
    if (!_digits.hasMatch(a) || (b.isNotEmpty && !_digits.hasMatch(b))) return none;
    if (b.isNotEmpty && _compareDigits(b, a) < 0) return none;
    final start = _saturating(a);
    if (start >= size) continue;
    final end = b.isEmpty ? size - 1 : _saturating(b);
    ranges.add((start, end < size - 1 ? end : size - 1));
  }
  return ranges.isNotEmpty ? RangeResult(RangeKind.ranges, ranges) : RangeResult(RangeKind.unsatisfiable, const [], 'bytes */$size');
}

/// The Content-Range value `bytes start-end/size` for a 206 part.
String contentRange(int start, int end, int size) {
  if (start < 0 || end < start || end >= size) throw ArgumentError('need 0 <= start <= end < size');
  return 'bytes $start-$end/$size';
}

String _trim(String s) {
  var a = 0, b = s.length;
  while (a < b && (s[a] == ' ' || s[a] == '\t')) {
    a++;
  }
  while (b > a && (s[b - 1] == ' ' || s[b - 1] == '\t')) {
    b--;
  }
  return s.substring(a, b);
}

int _saturating(String digits) {
  var v = 0;
  for (final c in digits.codeUnits) {
    final d = c - 0x30;
    if (v > (_maxInt - d) ~/ 10) return _maxInt;
    v = v * 10 + d;
  }
  return v;
}

int _compareDigits(String x, String y) {
  x = x.replaceFirst(RegExp('^0+'), '');
  y = y.replaceFirst(RegExp('^0+'), '');
  return x.length != y.length ? x.length.compareTo(y.length) : x.compareTo(y);
}
