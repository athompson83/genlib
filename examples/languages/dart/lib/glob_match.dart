// SPDX-License-Identifier: Apache-2.0
/// Glob matching for '/'-separated paths: `*`, `?` and `[...]` never cross '/', a whole-segment `**` matches zero or
/// more segments, `{a,b}` alternatives (no nesting), backslash escapes. Segments starting with '.' match only a pattern
/// segment starting with a literal '.' unless [dot]. Case-sensitive; `?` is one code point. Throws [FormatException].
library;

const _bs = 0x5C, _star = 0x2A, _q = 0x3F, _lb = 0x5B, _rb = 0x5D, _dotc = 0x2E, _slash = 0x2F;

List<List<int>> _expand(List<int> p) {
  var i = -1, k = 0;
  while (k < p.length) {
    if (p[k] == _bs) {
      k += 2;
      continue;
    }
    if (p[k] == 0x7B) {
      i = k;
      break;
    }
    if (p[k] == 0x7D) throw const FormatException('unmatched }');
    k++;
  }
  if (i < 0) return [p];
  var j = i + 1;
  final parts = <List<int>>[];
  var cur = <int>[];
  var closed = false;
  while (j < p.length) {
    final c = p[j];
    if (c == _bs) {
      cur.addAll(p.sublist(j, j + 2 > p.length ? p.length : j + 2));
      j += 2;
      continue;
    }
    if (c == 0x7B) throw const FormatException('nested braces are not supported');
    if (c == 0x2C) {
      parts.add(cur);
      cur = <int>[];
      j++;
      continue;
    }
    if (c == 0x7D) {
      parts.add(cur);
      closed = true;
      break;
    }
    cur.add(c);
    j++;
  }
  if (!closed) throw const FormatException('unterminated {');
  return [
    for (final alt in parts) ..._expand([...p.sublist(0, i), ...alt, ...p.sublist(j + 1)]),
  ];
}

bool _segMatch(List<int> pat, List<int> s, bool dot) {
  if (!dot && s.isNotEmpty && s[0] == _dotc) {
    final literalDot = pat.isNotEmpty && pat[0] == _dotc || pat.length > 1 && pat[0] == _bs && pat[1] == _dotc;
    if (!literalDot) return false;
  }
  final memo = <int, bool>{};
  bool m(int pi, int si) {
    final key = pi * (s.length + 1) + si;
    final hit = memo[key];
    if (hit != null) return hit;
    final r = _segStep(pat, s, pi, si, m);
    memo[key] = r;
    return r;
  }

  return m(0, 0);
}

bool _segStep(List<int> pat, List<int> s, int pi, int si, bool Function(int, int) m) {
  while (pi < pat.length) {
    var c = pat[pi];
    if (c == _star) {
      while (pi < pat.length && pat[pi] == _star) {
        pi++;
      }
      if (pi == pat.length) return true;
      for (var k = si; k <= s.length; k++) {
        if (m(pi, k)) return true;
      }
      return false;
    }
    if (si >= s.length) return false;
    if (c == _q) {
      pi++;
      si++;
      continue;
    }
    if (c == _lb) {
      var j = pi + 1;
      var neg = false;
      if (j < pat.length && (pat[j] == 0x21 || pat[j] == 0x5E)) {
        neg = true;
        j++;
      }
      final items = <(int, int)>[];
      var first = true;
      while (true) {
        if (j >= pat.length) throw const FormatException('unterminated [');
        if (pat[j] == _rb && !first) break;
        first = false;
        var a = pat[j];
        if (a == _bs && j + 1 < pat.length) {
          j++;
          a = pat[j];
        }
        if (j + 2 < pat.length && pat[j + 1] == 0x2D && pat[j + 2] != _rb) {
          var b = pat[j + 2];
          if (b == _bs && j + 3 < pat.length) {
            j++;
            b = pat[j + 2];
          }
          items.add((a, b));
          j += 3;
        } else {
          items.add((a, a));
          j++;
        }
      }
      final ch = s[si];
      final inClass = items.any((r) => r.$1 <= ch && ch <= r.$2);
      if (inClass == neg) return false;
      pi = j + 1;
      si++;
      continue;
    }
    if (c == _bs) {
      if (pi + 1 >= pat.length) throw const FormatException('trailing backslash');
      c = pat[pi + 1];
      pi++;
    }
    if (s[si] != c) return false;
    pi++;
    si++;
  }
  return si == s.length;
}

List<List<int>> _splitSegments(List<int> p) {
  final segs = <List<int>>[];
  var cur = <int>[];
  var k = 0;
  while (k < p.length) {
    if (p[k] == _bs && k + 1 < p.length) {
      cur.addAll([p[k], p[k + 1]]);
      k += 2;
      continue;
    }
    if (p[k] == _slash) {
      segs.add(cur);
      cur = <int>[];
      k++;
      continue;
    }
    cur.add(p[k]);
    k++;
  }
  segs.add(cur);
  return segs;
}

bool _isGlobstar(List<int> seg) => seg.length == 2 && seg[0] == _star && seg[1] == _star;

bool _matchOne(List<int> pattern, String path, bool dot) {
  final ps = _splitSegments(pattern);
  final ss = [for (final x in path.split('/')) x.runes.toList()];
  final memo = <int, bool>{};
  bool m(int i, int j) {
    if (i == ps.length) return j == ss.length;
    final key = i * (ss.length + 1) + j;
    final hit = memo[key];
    if (hit != null) return hit;
    bool r;
    if (_isGlobstar(ps[i])) {
      r = false;
      for (var k = j; k <= ss.length; k++) {
        if (k > j && !dot && ss[k - 1].isNotEmpty && ss[k - 1][0] == _dotc) break;
        if (m(i + 1, k)) {
          r = true;
          break;
        }
      }
    } else {
      r = j < ss.length && _segMatch(ps[i], ss[j], dot) && m(i + 1, j + 1);
    }
    memo[key] = r;
    return r;
  }

  return m(0, 0);
}

void _validate(List<int> p) {
  if (p.isEmpty) throw const FormatException('empty pattern');
  var trailing = 0;
  for (var i = p.length - 1; i >= 0 && p[i] == _bs; i--) {
    trailing++;
  }
  if (trailing.isOdd) throw const FormatException('trailing backslash');
  var k = 0;
  while (k < p.length) {
    if (p[k] == _bs) {
      k += 2;
      continue;
    }
    if (p[k] == _lb) {
      var j = k + 1;
      if (j < p.length && (p[j] == 0x21 || p[j] == 0x5E)) j++;
      if (j < p.length && p[j] == _rb) j++;
      while (j < p.length && p[j] != _rb) {
        j += p[j] == _bs ? 2 : 1;
      }
      if (j >= p.length) throw const FormatException('unterminated [');
      k = j;
    }
    k++;
  }
}

/// True when [path] matches the glob [pattern]; hidden segments need [dot]. Throws [FormatException] on a bad pattern.
bool globMatch(String pattern, String path, {bool dot = false}) {
  final p = pattern.runes.toList();
  _validate(p);
  return _expand(p).any((alt) => _matchOne(alt, path, dot));
}

/// The [paths] that match [pattern], in input order.
List<String> globFilter(String pattern, Iterable<String> paths, {bool dot = false}) => [
      for (final p in paths)
        if (globMatch(pattern, p, dot: dot)) p
    ];
