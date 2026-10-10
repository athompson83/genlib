// SPDX-License-Identifier: Apache-2.0
/// Edit distances and similarity scores over Unicode code points (not UTF-16 units or bytes).
library;

import 'dart:math' as math;

/// Levenshtein distance (insert, delete, substitute each cost 1).
int levenshtein(String a, String b) {
  final x = a.runes.toList(), y = b.runes.toList();
  var prev = List<int>.generate(y.length + 1, (j) => j);
  var cur = List<int>.filled(y.length + 1, 0);
  for (var i = 1; i <= x.length; i++) {
    cur[0] = i;
    for (var j = 1; j <= y.length; j++) {
      cur[j] = math.min(math.min(prev[j] + 1, cur[j - 1] + 1), prev[j - 1] + (x[i - 1] == y[j - 1] ? 0 : 1));
    }
    final t = prev;
    prev = cur;
    cur = t;
  }
  return prev[y.length];
}

/// Optimal string alignment distance: Levenshtein plus adjacent transposition at cost 1.
int damerauOsa(String a, String b) {
  final x = a.runes.toList(), y = b.runes.toList();
  final n = x.length, m = y.length;
  final d = List.generate(n + 1, (i) => List<int>.generate(m + 1, (j) => i == 0 ? j : (j == 0 ? i : 0)));
  for (var i = 1; i <= n; i++) {
    for (var j = 1; j <= m; j++) {
      final cost = x[i - 1] == y[j - 1] ? 0 : 1;
      d[i][j] = math.min(math.min(d[i - 1][j] + 1, d[i][j - 1] + 1), d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && x[i - 1] == y[j - 2] && x[i - 2] == y[j - 1]) d[i][j] = math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  }
  return d[n][m];
}

/// Jaro similarity in [0, 1]; two empty strings score 1 and one empty string scores 0.
double jaro(String a, String b) => _jaro(a.runes.toList(), b.runes.toList());

/// Jaro-Winkler similarity with prefix scale 0.1 and a common prefix of at most 4 code points.
double jaroWinkler(String a, String b) {
  final x = a.runes.toList(), y = b.runes.toList();
  final j = _jaro(x, y);
  var l = 0;
  while (l < 4 && l < x.length && l < y.length && x[l] == y[l]) {
    l++;
  }
  return j + l * 0.1 * (1 - j);
}

/// `1 - levenshtein / max(length)`; 1 for two empty strings.
double similarityRatio(String a, String b) {
  final n = math.max(a.runes.length, b.runes.length);
  return n == 0 ? 1.0 : 1 - levenshtein(a, b) / n;
}

double _jaro(List<int> a, List<int> b) {
  if (a.isEmpty && b.isEmpty) return 1.0;
  if (a.isEmpty || b.isEmpty) return 0.0;
  final w = math.max(math.max(a.length, b.length) ~/ 2 - 1, 0);
  final ma = List<bool>.filled(a.length, false), mb = List<bool>.filled(b.length, false);
  var matches = 0;
  for (var i = 0; i < a.length; i++) {
    for (var j = math.max(0, i - w); j < math.min(b.length, i + w + 1); j++) {
      if (!mb[j] && b[j] == a[i]) {
        ma[i] = mb[j] = true;
        matches++;
        break;
      }
    }
  }
  if (matches == 0) return 0.0;
  var t = 0, k = 0;
  for (var i = 0; i < a.length; i++) {
    if (!ma[i]) continue;
    while (!mb[k]) {
      k++;
    }
    if (a[i] != b[k]) t++;
    k++;
  }
  final m = matches.toDouble();
  return (m / a.length + m / b.length + (m - t / 2) / m) / 3;
}
