// SPDX-License-Identifier: Apache-2.0
/// Integer half-open intervals [start, end) as `(int, int)` records (start < end, else [IntervalException]). Every
/// list result is sorted, non-overlapping and has adjacent intervals merged. Touching intervals do not overlap.
library;

/// An interval whose start is not before its end, or bad [gaps] bounds.
class IntervalException implements Exception {
  final String message;
  const IntervalException(this.message);
  @override
  String toString() => 'IntervalException: $message';
}

/// A half-open interval (start, end).
typedef Interval = (int, int);

void _validate(List<Interval> xs) {
  for (final (s, e) in xs) {
    if (s >= e) throw IntervalException('bad interval ($s, $e)');
  }
}

/// Sorts [xs] and merges overlapping or adjacent intervals.
List<Interval> merge(List<Interval> xs) {
  _validate(xs);
  final sorted = [...xs]..sort((a, b) => a.$1 != b.$1 ? a.$1.compareTo(b.$1) : a.$2.compareTo(b.$2));
  final out = <Interval>[];
  for (final (s, e) in sorted) {
    if (out.isNotEmpty && s <= out.last.$2) {
      final last = out.removeLast();
      out.add((last.$1, e > last.$2 ? e : last.$2));
    } else {
      out.add((s, e));
    }
  }
  return out;
}

/// The parts covered by both [a] and [b].
List<Interval> intersect(List<Interval> a, List<Interval> b) {
  final x = merge(a), y = merge(b);
  final out = <Interval>[];
  var i = 0, j = 0;
  while (i < x.length && j < y.length) {
    final s = x[i].$1 > y[j].$1 ? x[i].$1 : y[j].$1;
    final e = x[i].$2 < y[j].$2 ? x[i].$2 : y[j].$2;
    if (s < e) out.add((s, e));
    if (x[i].$2 < y[j].$2) {
      i++;
    } else {
      j++;
    }
  }
  return out.isEmpty ? out : merge(out);
}

/// The parts of [a] not covered by [b].
List<Interval> subtract(List<Interval> a, List<Interval> b) {
  final x = merge(a), y = merge(b);
  final out = <Interval>[];
  for (final (s, e) in x) {
    var cur = s;
    for (final (bs, be) in y) {
      if (be <= cur || bs >= e) continue;
      if (bs > cur) out.add((cur, bs));
      if (be > cur) cur = be;
      if (cur >= e) break;
    }
    if (cur < e) out.add((cur, e));
  }
  return out;
}

/// The parts of [lo, hi) not covered by [xs]; requires lo < hi.
List<Interval> gaps(List<Interval> xs, int lo, int hi) {
  if (lo >= hi) throw const IntervalException('bad bounds');
  return subtract([(lo, hi)], xs);
}

/// The covered length of [xs] after merging.
int total(List<Interval> xs) => merge(xs).fold(0, (sum, x) => sum + x.$2 - x.$1);

/// True when [x] and [y] share at least one point (touching is not overlapping).
bool overlaps(Interval x, Interval y) {
  _validate([x, y]);
  return x.$1 < y.$2 && y.$1 < x.$2;
}

/// True when some interval of [xs] contains [p].
bool contains(List<Interval> xs, int p) => merge(xs).any((x) => x.$1 <= p && p < x.$2);
