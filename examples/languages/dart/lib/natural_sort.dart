// SPDX-License-Identifier: Apache-2.0
/// Natural sort ("file2" < "file10"): runs of ASCII digits compare by numeric value (any length), other runs by ASCII
/// case-folded code points, with deterministic tie-breaks so the order is total. Strings compare by code point, not UTF-16
/// unit.
library;

bool _isDigit(int c) => c >= 0x30 && c <= 0x39;

List<(bool, List<int>)> _runs(String s) {
  final cp = s.runes.toList();
  final out = <(bool, List<int>)>[];
  var i = 0;
  while (i < cp.length) {
    var j = i;
    final digit = _isDigit(cp[i]);
    while (j < cp.length && _isDigit(cp[j]) == digit) {
      j++;
    }
    out.add((digit, cp.sublist(i, j)));
    i = j;
  }
  return out;
}

List<int> _fold(List<int> s) => [for (final c in s) c >= 0x41 && c <= 0x5A ? c + 32 : c];

int _sign(int v) => v < 0 ? -1 : (v > 0 ? 1 : 0);

int _compareCodes(List<int> a, List<int> b) {
  final n = a.length < b.length ? a.length : b.length;
  for (var i = 0; i < n; i++) {
    if (a[i] != b[i]) return a[i] < b[i] ? -1 : 1;
  }
  return _sign(a.length - b.length);
}

List<int> _stripZeros(List<int> d) {
  var i = 0;
  while (i < d.length && d[i] == 0x30) {
    i++;
  }
  return i == d.length ? const [0x30] : d.sublist(i);
}

/// -1, 0 or 1. Run by run: digit runs by value, a digit run before a text run, text by ASCII case-folded code points. Ties:
/// fewer runs first, then fewer leading zeros per digit run, then plain code point order of the whole strings.
int naturalCompare(String a, String b) {
  final ra = _runs(a), rb = _runs(b);
  final n = ra.length < rb.length ? ra.length : rb.length;
  for (var i = 0; i < n; i++) {
    final (da, xa) = ra[i];
    final (db, xb) = rb[i];
    int c;
    if (da && db) {
      final na = _stripZeros(xa), nb = _stripZeros(xb);
      c = na.length != nb.length ? _sign(na.length - nb.length) : _compareCodes(na, nb);
    } else if (da != db) {
      c = da ? -1 : 1;
    } else {
      c = _compareCodes(_fold(xa), _fold(xb));
    }
    if (c != 0) return c;
  }
  if (ra.length != rb.length) return ra.length < rb.length ? -1 : 1;
  for (var i = 0; i < n; i++) {
    if (ra[i].$1 && rb[i].$1 && ra[i].$2.length != rb[i].$2.length) return ra[i].$2.length < rb[i].$2.length ? -1 : 1;
  }
  return _compareCodes(a.runes.toList(), b.runes.toList());
}

/// A new list sorted in natural order.
List<String> naturalSort(Iterable<String> items) => items.toList()..sort(naturalCompare);
