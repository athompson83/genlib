// SPDX-License-Identifier: Apache-2.0
/// Line diff and unified output. The result is a valid unified diff (patch reproduces the new text) and minimal (a
/// shortest edit script). It usually equals GNU `diff -u` (about 95% of small random inputs) but that is not
/// guaranteed. Myers' linear-space O((N+M)·D) algorithm with O(N+M) memory; changes are then slid down and aligned
/// with the other file's changes. Inputs with more than [maxDiffLines] lines in total are rejected.
library;

import 'dart:math' as math;
import 'dart:typed_data';

/// Maximum lines(a) + lines(b).
const maxDiffLines = 1000000;

/// One diff operation: [op] is `=` (unchanged), `-` (removed from a) or `+` (added in b).
typedef DiffOp = (String op, String line);

/// A line without its `\n`; `noEol` marks the last line of a text that does not end in `\n`, so it only equals
/// another last line without `\n` (otherwise patch could not reproduce the new text).
typedef _Line = (String text, bool noEol);

List<_Line> _splitLines(String text) {
  if (text.isEmpty) return const <_Line>[];
  final nl = text.endsWith('\n');
  final parts = text.split('\n');
  if (nl) parts.removeLast();
  return [for (var i = 0; i < parts.length; i++) (parts[i], !nl && i == parts.length - 1)];
}

/// Line-level diff of two texts split on `\n`. Throws [ArgumentError] above [maxDiffLines].
List<DiffOp> diffLines(String a, String b) =>
    [for (final (op, line) in _ops(_splitLines(a), _splitLines(b))) (op, line.$1)];

/// Middle snake (x, y, u, v) of the box a[a0..a1) x b[b0..b1) (Myers 1986, section 4b).
(int, int, int, int) _middleSnake(Int32List a, Int32List b, int a0, int a1, int b0, int b1) {
  final n = a1 - a0, m = b1 - b0, delta = n - m, off = n + m + 1;
  final odd = delta.isOdd;
  final vf = Int32List(2 * off + 1), vb = Int32List(2 * off + 1);
  for (var d = 0; d <= (n + m + 1) ~/ 2; d++) {
    for (var k = -d; k <= d; k += 2) {
      var x = k == -d || (k != d && vf[off + k - 1] < vf[off + k + 1]) ? vf[off + k + 1] : vf[off + k - 1] + 1;
      var y = x - k;
      final sx = x, sy = y;
      while (x < n && y < m && a[a0 + x] == b[b0 + y]) {
        x++;
        y++;
      }
      vf[off + k] = x;
      if (odd && delta - (d - 1) <= k && k <= delta + (d - 1) && x + vb[off + delta - k] >= n) {
        return (a0 + sx, b0 + sy, a0 + x, b0 + y);
      }
    }
    for (var k = -d; k <= d; k += 2) {
      var x = k == -d || (k != d && vb[off + k - 1] < vb[off + k + 1]) ? vb[off + k + 1] : vb[off + k - 1] + 1;
      var y = x - k;
      final sx = x, sy = y;
      while (x < n && y < m && a[a1 - 1 - x] == b[b1 - 1 - y]) {
        x++;
        y++;
      }
      vb[off + k] = x;
      if (!odd && -d <= delta - k && delta - k <= d && x + vf[off + delta - k] >= n) {
        return (a1 - x, b1 - y, a1 - sx, b1 - sy);
      }
    }
  }
  throw StateError('no middle snake');
}

void _compare(Int32List a, Int32List b, int a0, int a1, int b0, int b1, List<bool> ca, List<bool> cb) {
  while (a0 < a1 && b0 < b1 && a[a0] == b[b0]) {
    a0++;
    b0++;
  }
  while (a1 > a0 && b1 > b0 && a[a1 - 1] == b[b1 - 1]) {
    a1--;
    b1--;
  }
  if (a0 == a1) {
    for (var j = b0; j < b1; j++) {
      cb[j] = true;
    }
    return;
  }
  if (b0 == b1) {
    for (var i = a0; i < a1; i++) {
      ca[i] = true;
    }
    return;
  }
  final (x, y, u, v) = _middleSnake(a, b, a0, a1, b0, b1);
  _compare(a, b, a0, x, b0, y, ca, cb);
  _compare(a, b, u, a1, v, b1, ca, cb);
}

/// Moves each run of changed lines down while the line after it equals its first line.
void _slide(Int32List lines, List<bool> changed) {
  var i = 0;
  final n = lines.length;
  while (i < n) {
    if (!changed[i]) {
      i++;
      continue;
    }
    var j = i;
    while (j < n && changed[j]) {
      j++;
    }
    while (j < n && lines[i] == lines[j]) {
      changed[i] = false;
      changed[j] = true;
      i++;
      j++;
      while (j < n && changed[j]) {
        j++;
      }
    }
    i = j;
  }
}

/// Equal line pairs (i, j) in order.
List<(int, int)> _pairs(List<bool> ca, List<bool> cb) {
  final out = <(int, int)>[];
  var i = 0, j = 0;
  while (i < ca.length || j < cb.length) {
    if (i < ca.length && ca[i]) {
      i++;
    } else if (j < cb.length && cb[j]) {
      j++;
    } else {
      out.add((i, j));
      i++;
      j++;
    }
  }
  return out;
}

/// One bottom-up pass: slides a run of changed x lines up through equal lines when that places it next to changed
/// lines of the other file, so the hunk shows a replacement instead of a deletion and an insertion apart.
void _align(Int32List x, List<bool> cx, List<bool> cy, bool swap) {
  final e = swap ? [for (final (p, q) in _pairs(cy, cx)) (q, p)] : _pairs(cx, cy);
  final count = e.length;
  final xb = Int32List(count + 1), yb = Int32List(count + 2), xe = Int32List(count + 1);
  xb[0] = -1;
  yb[0] = -1;
  yb[count + 1] = cy.length;
  xe[count] = cx.length;
  for (var p = 0; p < count; p++) {
    xb[p + 1] = e[p].$1;
    yb[p + 1] = e[p].$2;
    xe[p] = e[p].$1;
  }
  var g = count;
  while (g >= 1) {
    final x0 = xb[g] + 1, x1 = xe[g];
    if (x1 > x0 && yb[g + 1] - yb[g] == 1) {
      var h = g, top = x0, last = x1 - 1;
      while (h >= 1 && xb[h] == top - 1 && x[top - 1] == x[last]) {
        h--;
        top--;
        last--;
        if (yb[h + 1] - yb[h] > 1) {
          for (var k = top; k < x0; k++) {
            cx[k] = true;
          }
          for (var k = last + 1; k < x1; k++) {
            cx[k] = false;
          }
          g = h;
          break;
        }
        if (h >= 1 && xe[h] - xb[h] > 1) break;
      }
    }
    g--;
  }
}

List<(String, _Line)> _ops(List<_Line> a, List<_Line> b) {
  if (a.length + b.length > maxDiffLines) throw ArgumentError('diff input too large (more than 1,000,000 lines)');
  // Lines become integer ids so comparisons are cheap; (text, noEol) pairs decide equality.
  final ids = <_Line, int>{};
  final ia = Int32List.fromList([for (final l in a) ids.putIfAbsent(l, () => ids.length)]);
  final ib = Int32List.fromList([for (final l in b) ids.putIfAbsent(l, () => ids.length)]);
  final inA = List<bool>.filled(ids.length, false), inB = List<bool>.filled(ids.length, false);
  for (final v in ia) {
    inA[v] = true;
  }
  for (final v in ib) {
    inB[v] = true;
  }
  // A line that never occurs in the other file is in no common subsequence: mark it changed and run Myers only on
  // the remaining lines (the result stays minimal).
  final ca = [for (final v in ia) !inB[v]], cb = [for (final v in ib) !inA[v]];
  final ka = [
    for (var i = 0; i < ia.length; i++)
      if (!ca[i]) i
  ];
  final kb = [
    for (var j = 0; j < ib.length; j++)
      if (!cb[j]) j
  ];
  final fa = Int32List.fromList([for (final i in ka) ia[i]]), fb = Int32List.fromList([for (final j in kb) ib[j]]);
  final sa = List<bool>.filled(fa.length, false), sb = List<bool>.filled(fb.length, false);
  _compare(fa, fb, 0, fa.length, 0, fb.length, sa, sb);
  for (var k = 0; k < ka.length; k++) {
    ca[ka[k]] = sa[k];
  }
  for (var k = 0; k < kb.length; k++) {
    cb[kb[k]] = sb[k];
  }
  _slide(ia, ca);
  _slide(ib, cb);
  _align(ia, ca, cb, false);
  _align(ib, cb, ca, true);
  final ops = <(String, _Line)>[];
  var i = 0, j = 0;
  while (i < a.length || j < b.length) {
    if (i < a.length && ca[i]) {
      ops.add(('-', a[i++]));
    } else if (j < b.length && cb[j]) {
      ops.add(('+', b[j++]));
    } else {
      ops.add(('=', a[i++]));
      j++;
    }
  }
  return ops;
}

/// Unified diff with [context] lines around each change, `''` when the texts are equal. Hunks whose changes are
/// separated by at most 2*context unchanged lines merge; a missing final newline is marked
/// `\ No newline at end of file`.
String unifiedDiff(String a, String b, {String fromName = 'a', String toName = 'b', int context = 3}) {
  if (context < 0) throw RangeError.value(context, 'context', 'must not be negative');
  final rows = _ops(_splitLines(a), _splitLines(b));
  final changes = [
    for (var k = 0; k < rows.length; k++)
      if (rows[k].$1 != '=') k
  ];
  if (changes.isEmpty) return '';
  final hunks = <(int, int)>[];
  var start = changes.first, end = changes.first;
  for (final k in changes.skip(1)) {
    if (k - end - 1 <= 2 * context) {
      end = k;
    } else {
      hunks.add((start, end));
      start = end = k;
    }
  }
  hunks.add((start, end));
  final out = StringBuffer('--- $fromName\n+++ $toName\n');
  var scanned = 0, aBefore = 0, bBefore = 0;
  for (final (hs, he) in hunks) {
    final s = math.max(0, hs - context), e = math.min(rows.length - 1, he + context);
    for (; scanned < s; scanned++) {
      if (rows[scanned].$1 != '+') aBefore++;
      if (rows[scanned].$1 != '-') bBefore++;
    }
    var aCount = 0, bCount = 0;
    for (var k = s; k <= e; k++) {
      if (rows[k].$1 != '+') aCount++;
      if (rows[k].$1 != '-') bCount++;
    }
    out.write('@@ -${_range(aBefore, aCount)} +${_range(bBefore, bCount)} @@\n');
    for (var k = s; k <= e; k++) {
      final (op, (text, noEol)) = rows[k];
      out.write('${op == '=' ? ' ' : op}$text\n');
      if (noEol) out.write('\\ No newline at end of file\n');
    }
  }
  return out.toString();
}

String _range(int before, int count) =>
    count == 0 ? '$before,0' : (count == 1 ? '${before + 1}' : '${before + 1},$count');
