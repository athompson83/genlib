// SPDX-License-Identifier: Apache-2.0
/// Content-Disposition (RFC 6266 + RFC 8187): build a safe header from any file name, parse one (filename* wins, the
/// returned filename is sanitized) and sanitize names (/ \ " and control characters -> '_', spaces and dots trimmed,
/// empty -> "download"). Throws [FormatException] on malformed input.
library;

import 'src/header_params.dart';

/// A parsed Content-Disposition header.
class ContentDisposition {
  /// Lowercased disposition type ("attachment", "inline", "form-data").
  final String type;

  /// The sanitized file name (filename* preferred), or null.
  final String? filename;

  /// Raw parameters in order (names lowercased, without '*').
  final Map<String, String> params;

  const ContentDisposition(this.type, this.filename, this.params);
}

/// Replaces / \ " and control characters with '_', trims spaces and dots at both ends; empty -> "download".
String sanitizeFilename(String name) {
  final sb = StringBuffer();
  for (final c in name.runes) {
    sb.writeCharCode(c == 0x2F || c == 0x5C || c == 0x22 || c < 0x20 || c == 0x7F ? 0x5F : c);
  }
  final r = sb.toString().runes.toList();
  var a = 0, b = r.length;
  while (a < b && (r[a] == 0x20 || r[a] == 0x2E)) {
    a++;
  }
  while (b > a && (r[b - 1] == 0x20 || r[b - 1] == 0x2E)) {
    b--;
  }
  return a == b ? 'download' : String.fromCharCodes(r.sublist(a, b));
}

/// `attachment; filename="..."` (or inline), adding an ASCII fallback plus filename*=UTF-8''... for non-ASCII names.
String buildContentDisposition(String filename, {bool inline = false}) {
  final name = sanitizeFilename(filename);
  final kind = inline ? 'inline' : 'attachment';
  if (name.runes.every((c) => c >= 0x20 && c < 0x7F)) return '$kind; filename="$name"';
  final fallback = String.fromCharCodes(name.runes.map((c) => c >= 0x20 && c < 0x7F ? c : 0x5F));
  return "$kind; filename=\"$fallback\"; filename*=UTF-8''${encodeAttrChars(name)}";
}

final _type = RegExp(r"\s*([!#$%&'*+\-.^_`|~0-9A-Za-z]+)\s*");
final _unquoted = RegExp(r'[^;\s]*');

/// Parses a Content-Disposition value; throws [FormatException] when malformed.
ContentDisposition parseContentDisposition(String s) {
  final m = _type.matchAsPrefix(s);
  if (m == null) throw const FormatException('missing disposition type');
  final kind = m.group(1)!.toLowerCase();
  var i = m.end;
  final n = s.length;
  final params = <String, String>{};
  void ws() {
    while (i < n && (s[i] == ' ' || s[i] == '\t')) {
      i++;
    }
  }

  while (i < n) {
    if (s[i] != ';') throw const FormatException('expected ;');
    i++;
    ws();
    if (i >= n) break;
    final mm = headerTokenPrefix.matchAsPrefix(s, i);
    if (mm == null) throw const FormatException('expected parameter');
    final name = mm.group(0)!.toLowerCase();
    i = mm.end;
    ws();
    if (i >= n || s[i] != '=') throw const FormatException('expected =');
    i++;
    ws();
    String val;
    if (i < n && s[i] == '"') {
      i++;
      final buf = StringBuffer();
      while (true) {
        if (i >= n) throw const FormatException('unterminated quote');
        final c = s[i];
        if (c == '\\' && i + 1 < n) {
          buf.write(s[i + 1]);
          i += 2;
          continue;
        }
        if (c == '"') {
          i++;
          break;
        }
        buf.write(c);
        i++;
      }
      val = buf.toString();
    } else {
      final u = _unquoted.matchAsPrefix(s, i)!;
      val = u.group(0)!;
      i = u.end;
    }
    ws();
    if (name.endsWith('*')) {
      params[name.substring(0, name.length - 1)] = decodeExtValue(val);
    } else if (!params.containsKey(name)) {
      params[name] = val;
    }
  }
  final fn = params['filename'];
  return ContentDisposition(kind, fn == null ? null : sanitizeFilename(fn), params);
}
