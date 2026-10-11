// SPDX-License-Identifier: Apache-2.0
/// `.env` parsing: comments, `export `, keys `[A-Za-z_][A-Za-z0-9_.]*`, unquoted values trimmed (` #` starts a comment),
/// literal single quotes, multi-line double quotes with escapes \n \r \t \" \\ \$. Later keys override but keep the first
/// position. Optional `${NAME}` / `${NAME:-default}` expansion from earlier keys, then [vars]. Throws [FormatException]
/// whose message starts with "line N:" (1-based).
library;

final _key = RegExp(r'^[A-Za-z_][A-Za-z0-9_.]*$');
final _inlineComment = RegExp(r'\s#');
final _ref = RegExp(r'(?<!\x00)\$\{([A-Za-z_][A-Za-z0-9_.]*)(:-([^}]*))?\}');
const _escapes = {'n': '\n', 'r': '\r', 't': '\t', '"': '"', '\\': '\\', r'$': '\x00\$'};

/// Parses .env [text] into an insertion-ordered map; with [expand], substitutes `${NAME}` references.
Map<String, String> parseDotenv(String text, {bool expand = false, Map<String, String> vars = const {}}) {
  final lines = text.replaceAll('\r\n', '\n').split('\n');
  final out = <String, String>{};
  final kinds = <String, String>{};
  var i = 0;
  while (i < lines.length) {
    final no = i + 1;
    var s = lines[i].trim();
    i++;
    if (s.isEmpty || s.startsWith('#')) continue;
    if (s.startsWith('export ')) s = s.substring(7).trimLeft();
    final eq = s.indexOf('=');
    if (eq < 0) throw FormatException('line $no: expected KEY=VALUE');
    final key = s.substring(0, eq).trim();
    var rest = s.substring(eq + 1).trimLeft();
    if (!_key.hasMatch(key)) throw FormatException("line $no: invalid key '$key'");
    String val, tail, kind;
    if (rest.startsWith("'")) {
      final end = rest.indexOf("'", 1);
      if (end < 0) throw FormatException('line $no: unterminated single quote');
      val = rest.substring(1, end);
      tail = rest.substring(end + 1);
      kind = 'single';
    } else if (rest.startsWith('"')) {
      var buf = rest.substring(1);
      final sb = StringBuffer();
      var j = 0;
      while (true) {
        var closed = false;
        while (j < buf.length) {
          final c = buf[j];
          if (c == '\\' && j + 1 < buf.length) {
            final n = buf[j + 1];
            sb.write(_escapes[n] ?? '\\$n');
            j += 2;
            continue;
          }
          if (c == '"') {
            closed = true;
            break;
          }
          sb.write(c);
          j++;
        }
        if (closed) {
          tail = buf.substring(j + 1);
          break;
        }
        if (i >= lines.length) throw FormatException('line $no: unterminated double quote');
        sb.write('\n');
        buf = lines[i];
        i++;
        j = 0;
      }
      val = sb.toString();
      kind = 'double';
    } else {
      final m = _inlineComment.firstMatch(rest);
      val = (m != null ? rest.substring(0, m.start) : rest).trim();
      tail = '';
      kind = 'plain';
    }
    final t = tail.trim();
    if (t.isNotEmpty && !t.startsWith('#')) throw FormatException('line $no: unexpected text after closing quote');
    out[key] = val;
    kinds[key] = kind;
  }
  var result = out;
  if (expand) {
    final done = <String, String>{};
    out.forEach((k, v) {
      if (kinds[k] != 'single') {
        v = v.replaceAllMapped(_ref, (m) {
          final name = m.group(1)!;
          final got = done.containsKey(name) ? done[name] : vars[name];
          if (got != null && got.isNotEmpty) return got;
          return m.group(3) ?? '';
        });
      }
      done[k] = v;
    });
    result = done;
  }
  return {for (final e in result.entries) e.key: e.value.replaceAll('\x00\$', r'$')};
}
