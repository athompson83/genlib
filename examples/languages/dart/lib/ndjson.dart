// SPDX-License-Identifier: Apache-2.0
/// Newline-delimited JSON. [parseNdjson] splits on `\n` (dropping a trailing `\r`), skips lines that are empty or only
/// spaces/tabs and decodes each other line with `dart:convert`; a bad line throws [NdjsonException] carrying its
/// 1-based line number. [stringifyNdjson] writes each value compactly with map keys in insertion order, escaping only
/// `"`, `\` and U+0000..U+001F (`\b \f \n \r \t` or lowercase `\u00xx`), keeping other text as raw UTF-8, and ends
/// every value with `\n`.
library;

import 'dart:convert';

/// A line that is not one complete JSON value, or a value that cannot be written as JSON.
class NdjsonException implements Exception {
  final String message;

  /// The 1-based line number for parse errors (0 for stringify errors).
  final int line;
  const NdjsonException(this.message, [this.line = 0]);
  @override
  String toString() => 'NdjsonException: $message';
}

/// Parses NDJSON text into the list of decoded values.
List<Object?> parseNdjson(String text) {
  final out = <Object?>[];
  final lines = text.split('\n');
  for (var i = 0; i < lines.length; i++) {
    var line = lines[i];
    if (line.endsWith('\r')) line = line.substring(0, line.length - 1);
    if (line.replaceAll(RegExp(r'[ \t]'), '').isEmpty) continue;
    try {
      out.add(jsonDecode(line));
    } on FormatException {
      throw NdjsonException('invalid JSON on line ${i + 1}', i + 1);
    }
  }
  return out;
}

const _escapes = {0x22: r'\"', 0x5C: r'\\', 0x08: r'\b', 0x0C: r'\f', 0x0A: r'\n', 0x0D: r'\r', 0x09: r'\t'};

void _write(Object? v, StringBuffer out) {
  if (v == null) {
    out.write('null');
  } else if (v is bool) {
    out.write(v ? 'true' : 'false');
  } else if (v is int) {
    out.write(v);
  } else if (v is double) {
    if (!v.isFinite) throw const NdjsonException('non-finite number');
    out.write(v);
  } else if (v is String) {
    out.write('"');
    for (final c in v.codeUnits) {
      final e = _escapes[c];
      if (e != null) {
        out.write(e);
      } else if (c < 0x20) {
        out.write('\\u${c.toRadixString(16).padLeft(4, '0')}');
      } else {
        out.writeCharCode(c);
      }
    }
    out.write('"');
  } else if (v is List) {
    out.write('[');
    for (var i = 0; i < v.length; i++) {
      if (i > 0) out.write(',');
      _write(v[i], out);
    }
    out.write(']');
  } else if (v is Map) {
    out.write('{');
    var first = true;
    for (final e in v.entries) {
      if (e.key is! String) throw const NdjsonException('object keys must be strings');
      if (!first) out.write(',');
      first = false;
      _write(e.key, out);
      out.write(':');
      _write(e.value, out);
    }
    out.write('}');
  } else {
    throw NdjsonException('unsupported type ${v.runtimeType}');
  }
}

/// Serializes [values] as NDJSON: one compact JSON value per line, each followed by `\n`.
String stringifyNdjson(List<Object?> values) {
  final out = StringBuffer();
  for (final v in values) {
    _write(v, out);
    out.write('\n');
  }
  return out.toString();
}
