// SPDX-License-Identifier: Apache-2.0
/// INI files (the common subset of git config, PHP and configparser defaults). [parseIni] returns an insertion-ordered
/// map of sections to insertion-ordered key/value maps; keys before any section go in section '' (always present and
/// first). Lines are trimmed; blank lines and lines starting with ';' or '#' are skipped; `[name]` starts or continues a
/// section; `key = value` or `key: value` splits at the first '=' or ':'; a bare `key` has value ''; a value wrapped in
/// double quotes is unquoted with escapes \\ \" \n \t, otherwise an inline comment starts at whitespace + ';' or '#'.
/// Duplicate keys: the last value wins in the first position. Errors throw [FormatException] starting "line N:".
library;

// Python str.strip() whitespace.
bool _isSpace(int c) =>
    (c >= 9 && c <= 13) ||
    (c >= 0x1C && c <= 0x20) ||
    c == 0x85 ||
    c == 0xA0 ||
    c == 0x1680 ||
    (c >= 0x2000 && c <= 0x200A) ||
    c == 0x2028 ||
    c == 0x2029 ||
    c == 0x202F ||
    c == 0x205F ||
    c == 0x3000;

String _strip(String s) {
  final cps = s.runes.toList();
  var a = 0, b = cps.length;
  while (a < b && _isSpace(cps[a])) {
    a++;
  }
  while (b > a && _isSpace(cps[b - 1])) {
    b--;
  }
  return String.fromCharCodes(cps.sublist(a, b));
}

/// Parses INI [text] into ordered sections (section '' first) of ordered key/value pairs.
Map<String, Map<String, String>> parseIni(String text) {
  final out = <String, Map<String, String>>{'': <String, String>{}};
  var cur = out['']!;
  final lines = text.replaceAll('\r\n', '\n').split('\n');
  for (var i = 0; i < lines.length; i++) {
    final no = i + 1;
    final s = _strip(lines[i]);
    if (s.isEmpty || s[0] == ';' || s[0] == '#') continue;
    if (s[0] == '[') {
      if (!s.endsWith(']')) throw FormatException('line $no: unterminated section header');
      final name = s.length >= 2 ? _strip(s.substring(1, s.length - 1)) : '';
      if (name.isEmpty || name.contains(']')) throw FormatException('line $no: bad section name');
      cur = out.putIfAbsent(name, () => <String, String>{});
      continue;
    }
    final idx = [s.indexOf('='), s.indexOf(':')].where((x) => x >= 0).toList();
    String key, val;
    if (idx.isNotEmpty) {
      final k = idx.reduce((a, b) => a < b ? a : b);
      key = _strip(s.substring(0, k));
      val = _strip(s.substring(k + 1));
    } else {
      key = s;
      val = '';
    }
    if (key.isEmpty) throw FormatException('line $no: empty key');
    if (val.startsWith('"')) {
      final buf = StringBuffer();
      var j = 1;
      var closed = false;
      while (j < val.length) {
        final c = val[j];
        if (c == r'\' && j + 1 < val.length) {
          final e = val[j + 1];
          buf.write(e == 'n' ? '\n' : (e == 't' ? '\t' : e));
          j += 2;
          continue;
        }
        if (c == '"') {
          closed = true;
          break;
        }
        buf.write(c);
        j++;
      }
      if (!closed) throw FormatException('line $no: unterminated quote');
      val = buf.toString();
    } else {
      final cut = [val.indexOf(' ;'), val.indexOf(' #'), val.indexOf('\t;'), val.indexOf('\t#')].where((x) => x >= 0);
      if (cut.isNotEmpty) val = _rstrip(val.substring(0, cut.reduce((a, b) => a < b ? a : b)));
    }
    cur[key] = val;
  }
  return out;
}

String _rstrip(String s) {
  final cps = s.runes.toList();
  var b = cps.length;
  while (b > 0 && _isSpace(cps[b - 1])) {
    b--;
  }
  return String.fromCharCodes(cps.sublist(0, b));
}

String _quote(String v) {
  if (v.isEmpty || v != _strip(v) || v.contains(RegExp('[;#"\\\\\n\t]'))) {
    return '"${v.replaceAll('\\', '\\\\').replaceAll('"', '\\"').replaceAll('\n', '\\n').replaceAll('\t', '\\t')}"';
  }
  return v;
}

/// Writes sections as INI text: section '' first without a header, then `[name]` blocks separated by a blank line.
String stringifyIni(Map<String, Map<String, String>> data) {
  final blocks = <String>[];
  final top = data[''] ?? const <String, String>{};
  if (top.isNotEmpty) blocks.add(top.entries.map((e) => '${e.key} = ${_quote(e.value)}').join('\n'));
  for (final s in data.entries) {
    if (s.key.isEmpty) continue;
    blocks.add(['[${s.key}]', ...s.value.entries.map((e) => '${e.key} = ${_quote(e.value)}')].join('\n'));
  }
  return blocks.join('\n\n') + (blocks.isEmpty ? '' : '\n');
}
