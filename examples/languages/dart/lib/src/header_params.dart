// SPDX-License-Identifier: Apache-2.0
/// Shared HTTP header parameter helpers: RFC 9110 token test and RFC 8187 extended values (charset'lang'pct-encoded).
library;

import 'dart:convert';

/// RFC 9110 token (one or more tchar).
final headerToken = RegExp(r"^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$");

/// Matches a token at a position (use with [RegExp.matchAsPrefix]).
final headerTokenPrefix = RegExp(r"[!#$%&'*+\-.^_`|~0-9A-Za-z]+");

final _ext = RegExp(r"^([A-Za-z0-9!#$&+\-^_`{}~]+)'([A-Za-z0-9-]*)'([^\n]*)$");
final _badPct = RegExp(r'%(?![0-9A-Fa-f]{2})');

bool _isHex(int b) => (b >= 0x30 && b <= 0x39) || (b >= 0x41 && b <= 0x46) || (b >= 0x61 && b <= 0x66);
int _hexVal(int b) => b <= 0x39 ? b - 0x30 : (b | 0x20) - 0x61 + 10;

/// Percent-decodes [s] (UTF-8 encoded first) to bytes; invalid '%' sequences stay literal.
List<int> percentDecodeBytes(String s) {
  final b = utf8.encode(s);
  final out = <int>[];
  var i = 0;
  while (i < b.length) {
    if (b[i] == 0x25 && i + 2 < b.length && _isHex(b[i + 1]) && _isHex(b[i + 2])) {
      out.add(_hexVal(b[i + 1]) * 16 + _hexVal(b[i + 2]));
      i += 3;
    } else {
      out.add(b[i]);
      i++;
    }
  }
  return out;
}

/// Strict UTF-8 decode: null when [bytes] are not valid UTF-8.
String? strictUtf8(List<int> bytes) {
  final s = utf8.decode(bytes, allowMalformed: true);
  final back = utf8.encode(s);
  if (back.length != bytes.length) return null;
  for (var i = 0; i < back.length; i++) {
    if (back[i] != bytes[i]) return null;
  }
  return s;
}

/// Decodes an RFC 8187 value (UTF-8 or ISO-8859-1); throws [FormatException] when malformed.
String decodeExtValue(String v) {
  final m = _ext.firstMatch(v);
  if (m == null) throw const FormatException('bad extended value');
  final cs = m.group(1)!.toLowerCase();
  if (cs != 'utf-8' && cs != 'iso-8859-1') throw const FormatException('unsupported charset');
  final body = m.group(3)!;
  if (_badPct.hasMatch(body)) throw const FormatException('bad percent-encoding');
  final bytes = percentDecodeBytes(body);
  if (cs == 'iso-8859-1') return String.fromCharCodes(bytes);
  return strictUtf8(bytes) ?? (throw const FormatException('invalid UTF-8'));
}

/// Percent-encodes [s] as UTF-8, keeping RFC 8187 attr-char.
String encodeAttrChars(String s) {
  final sb = StringBuffer();
  for (final b in utf8.encode(s)) {
    if (_attr(b)) {
      sb.writeCharCode(b);
    } else {
      sb.write('%${b.toRadixString(16).toUpperCase().padLeft(2, '0')}');
    }
  }
  return sb.toString();
}

bool _attr(int b) =>
    (b >= 0x41 && b <= 0x5A) ||
    (b >= 0x61 && b <= 0x7A) ||
    (b >= 0x30 && b <= 0x39) ||
    '!#\$&+-.^_`|~'.codeUnits.contains(b);

/// Quotes [v] as an HTTP quoted-string (backslash-escaping '\' and '"').
String quoteHeaderValue(String v) => '"${v.replaceAll('\\', '\\\\').replaceAll('"', '\\"')}"';
