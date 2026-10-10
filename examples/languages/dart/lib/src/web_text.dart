// SPDX-License-Identifier: Apache-2.0
/// Shared URL checks, XML/HTML escaping and query helpers for the marketing capabilities.
library;

import 'dart:convert';

/// True for an absolute http(s) URL with a host and no whitespace or control characters.
bool isAbsoluteHttpUrl(String? value, {bool httpsOnly = false}) {
  if (value == null || value.isEmpty) return false;
  if (value.codeUnits.any((c) => c <= 0x20 || c == 0x7f)) return false;
  final lower = value.toLowerCase();
  String rest;
  if (lower.startsWith('https://')) {
    rest = value.substring(8);
  } else if (!httpsOnly && lower.startsWith('http://')) {
    rest = value.substring(7);
  } else {
    return false;
  }
  return rest.isNotEmpty && !'/?#'.contains(rest[0]);
}

bool hasNewline(String? value) => value != null && (value.contains('\n') || value.contains('\r'));

/// Escapes `& < > " '` for XML text and attribute values.
String xmlEscape(String value) => value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');

/// Escapes `& < > "` for HTML text and double-quoted attribute values.
String htmlEscape(String value) =>
    value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');

/// Decodes `application/x-www-form-urlencoded` text (`+` is a space); throws [FormatException] when malformed.
String formDecode(String value) {
  final bytes = <int>[];
  for (var i = 0; i < value.length; i++) {
    final c = value[i];
    if (c == '+') {
      bytes.add(0x20);
    } else if (c == '%') {
      final hex = i + 2 < value.length ? int.tryParse(value.substring(i + 1, i + 3), radix: 16) : null;
      if (hex == null || value.substring(i + 1, i + 3).contains(RegExp('[^0-9A-Fa-f]'))) {
        throw const FormatException('malformed percent-encoding in query');
      }
      bytes.add(hex);
      i += 2;
    } else {
      bytes.addAll(utf8.encode(c));
    }
  }
  return utf8.decode(bytes); // throws FormatException on invalid UTF-8
}

/// A URL split into the part before `?`, the raw query and the fragment (null when absent).
typedef UrlParts = ({String head, String? query, String? fragment});

UrlParts splitUrl(String url) {
  String? fragment;
  final hash = url.indexOf('#');
  if (hash >= 0) {
    fragment = url.substring(hash + 1);
    url = url.substring(0, hash);
  }
  final q = url.indexOf('?');
  return q < 0 ? (head: url, query: null, fragment: fragment) : (head: url.substring(0, q), query: url.substring(q + 1), fragment: fragment);
}

String paramName(String segment) {
  final eq = segment.indexOf('=');
  return eq < 0 ? segment : segment.substring(0, eq);
}

String joinUrl(String head, List<String> segments, String? fragment) {
  final out = StringBuffer(head);
  if (segments.isNotEmpty) out..write('?')..write(segments.join('&'));
  if (fragment != null) out..write('#')..write(fragment);
  return out.toString();
}
