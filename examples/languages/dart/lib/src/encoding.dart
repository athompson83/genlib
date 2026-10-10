// SPDX-License-Identifier: Apache-2.0
/// Shared percent-encoding and constant-time helpers for the capability examples.
library;

import 'dart:convert';

const _hex = '0123456789ABCDEF';

/// RFC 3986 percent-encoding of everything except unreserved characters.
/// Spaces become `%20`, or `+` when [spaceAsPlus] is set (form encoding).
String percentEncode(String value, {bool spaceAsPlus = false}) {
  final out = StringBuffer();
  for (final b in utf8.encode(value)) {
    final unreserved = (b >= 0x41 && b <= 0x5a) ||
        (b >= 0x61 && b <= 0x7a) ||
        (b >= 0x30 && b <= 0x39) ||
        b == 0x2d || b == 0x2e || b == 0x5f || b == 0x7e;
    if (unreserved) {
      out.writeCharCode(b);
    } else if (spaceAsPlus && b == 0x20) {
      out.write('+');
    } else {
      out..write('%')..write(_hex[b >> 4])..write(_hex[b & 15]);
    }
  }
  return out.toString();
}

/// Compares two byte lists without early exit (length mismatch returns false).
bool constantTimeEquals(List<int> a, List<int> b) {
  var diff = a.length ^ b.length;
  final n = a.length < b.length ? a.length : b.length;
  for (var i = 0; i < n; i++) {
    diff |= a[i] ^ b[i];
  }
  return diff == 0;
}
