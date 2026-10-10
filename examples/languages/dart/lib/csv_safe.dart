// SPDX-License-Identifier: Apache-2.0
/// RFC 4180 CSV writing and parsing with OWASP formula-injection neutralization on write.
library;

const _formulaStarts = {'=', '+', '-', '@', '\t', '\r'};

/// Writes [rows] as CSV with CRLF after every record. When [neutralizeFormulas] is set, a field starting with
/// `=`, `+`, `-`, `@`, TAB or CR gets a leading apostrophe. Fields containing `,`, `"`, CR or LF, or starting or
/// ending with a space, are quoted with `"` doubled.
String writeCsv(List<List<String>> rows, {bool neutralizeFormulas = true}) {
  final out = StringBuffer();
  for (final row in rows) {
    var first = true;
    for (var field in row) {
      if (!first) out.write(',');
      first = false;
      if (neutralizeFormulas && field.isNotEmpty && _formulaStarts.contains(field[0])) field = "'$field";
      final quote = field.contains(RegExp('[,"\r\n]')) || field.startsWith(' ') || field.endsWith(' ');
      out.write(quote ? '"${field.replaceAll('"', '""')}"' : field);
    }
    out.write('\r\n');
  }
  return out.toString();
}

/// Parses RFC 4180 CSV (CRLF or LF record ends, one leading BOM stripped). A final record end adds no empty row.
/// Throws [FormatException] for an unterminated quoted field, a quote inside an unquoted field, or text after a
/// closing quote. Never neutralizes or un-neutralizes fields.
List<List<String>> parseCsv(String text) {
  final rows = <List<String>>[];
  var i = text.startsWith('﻿') ? 1 : 0;
  if (i >= text.length) return rows;
  bool recordEnd(int at) => text[at] == '\n' || (text[at] == '\r' && at + 1 < text.length && text[at + 1] == '\n');
  var row = <String>[];
  final field = StringBuffer();
  while (true) {
    if (i < text.length && text[i] == '"') {
      i++;
      while (true) {
        if (i >= text.length) throw const FormatException('unterminated quoted field');
        final c = text[i++];
        if (c != '"') {
          field.write(c);
        } else if (i < text.length && text[i] == '"') {
          field.write('"');
          i++;
        } else {
          break;
        }
      }
      if (i < text.length && text[i] != ',' && !recordEnd(i)) {
        throw FormatException('unexpected character after closing quote', text, i);
      }
    } else {
      while (i < text.length && text[i] != ',' && !recordEnd(i)) {
        if (text[i] == '"') throw FormatException('quote inside unquoted field', text, i);
        field.write(text[i++]);
      }
    }
    row.add(field.toString());
    field.clear();
    if (i >= text.length) {
      rows.add(row);
      return rows;
    }
    if (text[i] == ',') {
      i++;
      continue;
    }
    i += text[i] == '\r' ? 2 : 1;
    rows.add(row);
    row = <String>[];
    if (i >= text.length) return rows;
  }
}
