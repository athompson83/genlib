// SPDX-License-Identifier: Apache-2.0
/// Deterministic LCS line diff and unified output: a valid unified diff (patch reproduces the new text); same format
/// as GNU `diff -u`, which may pick a different alignment of equal size.
library;

import 'dart:math' as math;
import 'dart:typed_data';

/// Maximum lines(a) * lines(b) the LCS table may hold.
const maxDiffCells = 4000000;

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

/// Line-level diff of two texts split on `\n`. Throws [ArgumentError] above [maxDiffCells].
List<DiffOp> diffLines(String a, String b) => [for (final (op, line) in _ops(_splitLines(a), _splitLines(b))) (op, line.$1)];

List<(String, _Line)> _ops(List<_Line> a, List<_Line> b) {
  final n = a.length, m = b.length;
  if (n * m > maxDiffCells) throw ArgumentError('inputs too large to diff');
  final l = List.generate(n + 1, (_) => Int32List(m + 1));
  for (var i = n - 1; i >= 0; i--) {
    for (var j = m - 1; j >= 0; j--) {
      l[i][j] = a[i] == b[j] ? l[i + 1][j + 1] + 1 : math.max(l[i + 1][j], l[i][j + 1]);
    }
  }
  final ops = <(String, _Line)>[];
  var i = 0, j = 0;
  while (i < n || j < m) {
    if (i < n && j < m && a[i] == b[j]) {
      ops.add(('=', a[i++]));
      j++;
    } else if (j >= m || (i < n && l[i + 1][j] >= l[i][j + 1])) {
      ops.add(('-', a[i++]));
    } else {
      ops.add(('+', b[j++]));
    }
  }
  return ops;
}

typedef _Row = (String op, _Line line, int a, int b);

/// Unified diff with [context] lines around each change, `''` when the texts are equal. Hunks whose changes are
/// separated by at most 2*context unchanged lines merge; a missing final newline is marked
/// `\ No newline at end of file`.
String unifiedDiff(String a, String b, {String fromName = 'a', String toName = 'b', int context = 3}) {
  if (context < 0) throw RangeError.value(context, 'context', 'must not be negative');
  final rows = <_Row>[];
  var ai = 0, bi = 0;
  for (final (op, line) in _ops(_splitLines(a), _splitLines(b))) {
    if (op == '=') {
      rows.add((op, line, ai++, bi++));
    } else if (op == '-') {
      rows.add((op, line, ai++, -1));
    } else {
      rows.add((op, line, -1, bi++));
    }
  }
  final changes = [for (var k = 0; k < rows.length; k++) if (rows[k].$1 != '=') k];
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
  for (final (hs, he) in hunks) {
    final s = math.max(0, hs - context), e = math.min(rows.length - 1, he + context);
    final seg = rows.sublist(s, e + 1);
    final before = rows.sublist(0, s);
    final aRows = seg.where((r) => r.$1 != '+').toList(), bRows = seg.where((r) => r.$1 != '-').toList();
    final aRange = _range(aRows.length, aRows.isEmpty ? 0 : aRows.first.$3, before.where((r) => r.$1 != '+').length);
    final bRange = _range(bRows.length, bRows.isEmpty ? 0 : bRows.first.$4, before.where((r) => r.$1 != '-').length);
    out.write('@@ -$aRange +$bRange @@\n');
    for (final (op, (text, noEol), _, _) in seg) {
      out.write('${op == '=' ? ' ' : op}$text\n');
      if (noEol) out.write('\\ No newline at end of file\n');
    }
  }
  return out.toString();
}

String _range(int count, int firstIndex, int before) =>
    count == 0 ? '$before,0' : (count == 1 ? '${firstIndex + 1}' : '${firstIndex + 1},$count');
