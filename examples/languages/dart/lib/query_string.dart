// SPDX-License-Identifier: Apache-2.0
/// application/x-www-form-urlencoded per the WHATWG URL standard: ordered (name, value) pairs, '+' as space, byte-wise
/// percent-decoding (invalid '%' stays literal) with U+FFFD for invalid UTF-8; stringify keeps A-Z a-z 0-9 * - . _ only.
library;

import 'dart:convert';

bool _hex(int b) => (b >= 0x30 && b <= 0x39) || (b >= 0x41 && b <= 0x46) || (b >= 0x61 && b <= 0x66);
int _hexVal(int b) => b <= 0x39 ? b - 0x30 : (b | 0x20) - 0x61 + 10;

String _decode(String s) {
  final b = utf8.encode(s.replaceAll('+', ' '));
  final out = <int>[];
  var i = 0;
  while (i < b.length) {
    if (b[i] == 0x25 && i + 2 < b.length && _hex(b[i + 1]) && _hex(b[i + 2])) {
      out.add(_hexVal(b[i + 1]) * 16 + _hexVal(b[i + 2]));
      i += 3;
    } else {
      out.add(b[i]);
      i++;
    }
  }
  return utf8.decode(out, allowMalformed: true);
}

/// Parses a query string (one leading '?' optional) into ordered (name, value) pairs; empty pieces are skipped.
List<(String, String)> parseQuery(String s) {
  if (s.startsWith('?')) s = s.substring(1);
  final pairs = <(String, String)>[];
  for (final piece in s.split('&')) {
    if (piece.isEmpty) continue;
    final eq = piece.indexOf('=');
    pairs.add(eq < 0 ? (_decode(piece), '') : (_decode(piece.substring(0, eq)), _decode(piece.substring(eq + 1))));
  }
  return pairs;
}

bool _safe(int b) =>
    (b >= 0x41 && b <= 0x5A) ||
    (b >= 0x61 && b <= 0x7A) ||
    (b >= 0x30 && b <= 0x39) ||
    b == 0x2A ||
    b == 0x2D ||
    b == 0x2E ||
    b == 0x5F;

String _encode(String s) {
  final sb = StringBuffer();
  for (final b in utf8.encode(s)) {
    if (_safe(b)) {
      sb.writeCharCode(b);
    } else if (b == 0x20) {
      sb.write('+');
    } else {
      sb.write('%${b.toRadixString(16).toUpperCase().padLeft(2, '0')}');
    }
  }
  return sb.toString();
}

/// Serializes pairs as `name=value` joined with '&' (space as '+', other bytes %XX uppercase).
String stringifyQuery(Iterable<(String, String)> pairs) =>
    pairs.map((p) => '${_encode(p.$1)}=${_encode(p.$2)}').join('&');

/// Every value for [name], in order.
List<String> getAll(Iterable<(String, String)> pairs, String name) => [
      for (final p in pairs)
        if (p.$1 == name) p.$2
    ];
