// SPDX-License-Identifier: Apache-2.0
/// GitHub-flavoured Markdown table rendering. Cells escape `\` and `|` and turn CRLF/CR/LF into `<br>`; each column is
/// as wide as its longest escaped cell in code points (at least 3); alignment is 'left', 'right', 'center' or null
/// (also accepted as 'none') for no colon. Lines are `| a | b |`, joined by `\n` with no trailing newline. Bad input
/// throws [MarkdownTableException].
library;

/// Empty headers, a row of the wrong width or an unknown alignment.
class MarkdownTableException implements Exception {
  final String message;
  const MarkdownTableException(this.message);
  @override
  String toString() => 'MarkdownTableException: $message';
}

String _esc(String c) =>
    c.replaceAll(r'\', r'\\').replaceAll('|', r'\|').replaceAll('\r\n', '<br>').replaceAll('\r', '<br>').replaceAll('\n', '<br>');

int _len(String s) => s.runes.length;

/// Renders [headers] and [rows] as a Markdown table with optional per-column [align].
String markdownTable(List<String> headers, List<List<String>> rows, [List<String?>? align]) {
  if (headers.isEmpty) throw const MarkdownTableException('headers');
  final n = headers.length;
  final a = [for (final x in align ?? List<String?>.filled(n, null)) x == 'none' ? null : x];
  if (a.length != n || a.any((x) => x != null && x != 'left' && x != 'right' && x != 'center')) {
    throw const MarkdownTableException('align');
  }
  if (rows.any((r) => r.length != n)) throw const MarkdownTableException('row width');
  final cells = [
    [for (final c in headers) _esc(c)],
    for (final r in rows) [for (final c in r) _esc(c)],
  ];
  final widths = [
    for (var i = 0; i < n; i++) cells.fold(3, (int w, r) => _len(r[i]) > w ? _len(r[i]) : w),
  ];
  String pad(String s, int w, String? al) {
    final gap = w - _len(s);
    if (al == 'right') return ' ' * gap + s;
    if (al == 'center') return ' ' * (gap ~/ 2) + s + ' ' * (gap - gap ~/ 2);
    return s + ' ' * gap;
  }

  String sep(int w, String? al) {
    final d = List.filled(w, '-');
    if (al == 'left' || al == 'center') d[0] = ':';
    if (al == 'right' || al == 'center') d[w - 1] = ':';
    return d.join();
  }

  String line(List<String> cs) => '| ${cs.join(' | ')} |';
  String row(List<String> r) => line([for (var i = 0; i < n; i++) pad(r[i], widths[i], a[i])]);
  return [row(cells[0]), line([for (var i = 0; i < n; i++) sep(widths[i], a[i])]), for (final r in cells.skip(1)) row(r)].join('\n');
}
