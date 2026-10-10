// SPDX-License-Identifier: Apache-2.0
/// RFC 3986 section 6 normalization for http/https URLs (hand-parsed; no platform URL parser).
library;

import 'ip_cidr.dart' show canonicalIp;

final _url = RegExp(r'^([A-Za-z][A-Za-z0-9+.-]*)://([^/?#]*)([^?#]*)(\?[^#]*)?(#.*)?$', dotAll: true);
final _authority = RegExp(r'^(\[[0-9A-Fa-f:.]+\]|[A-Za-z0-9.-]+)(?::([0-9]*))?$');
final _hex = RegExp(r'^[0-9A-Fa-f]{2}$');
final _unreserved = RegExp(r'^[A-Za-z0-9\-._~]$');

/// The remove_dot_segments algorithm of RFC 3986 section 5.2.4.
String removeDotSegments(String path) {
  var input = path;
  final out = StringBuffer();
  void pop() {
    final s = out.toString();
    final i = s.lastIndexOf('/');
    out
      ..clear()
      ..write(i < 0 ? '' : s.substring(0, i));
  }

  while (input.isNotEmpty) {
    if (input.startsWith('../')) {
      input = input.substring(3);
    } else if (input.startsWith('./')) {
      input = input.substring(2);
    } else if (input.startsWith('/./')) {
      input = '/${input.substring(3)}';
    } else if (input == '/.') {
      input = '/';
    } else if (input.startsWith('/../')) {
      input = '/${input.substring(4)}';
      pop();
    } else if (input == '/..') {
      input = '/';
      pop();
    } else if (input == '.' || input == '..') {
      input = '';
    } else {
      final i = input.indexOf('/', input.startsWith('/') ? 1 : 0);
      if (i < 0) {
        out.write(input);
        input = '';
      } else {
        out.write(input.substring(0, i));
        input = input.substring(i);
      }
    }
  }
  return out.toString();
}

/// Normalizes an http(s) URL: lowercase scheme and host, canonical bracketed IPv6, default or empty port removed,
/// uppercase percent-encodings with unreserved characters decoded, dot segments removed, empty path as `/`, bare `?` and
/// fragment dropped. Throws [FormatException] for controls/spaces, other schemes, userinfo, bad hosts, ports or escapes.
String normalizeUrl(String text) {
  if (text.codeUnits.any((c) => c <= 0x20 || c == 0x7f)) throw FormatException('URL contains spaces or control characters', text);
  final m = _url.firstMatch(text);
  if (m == null) throw FormatException('URL must be scheme://authority[path][?query][#fragment]', text);
  final scheme = m.group(1)!.toLowerCase(), auth = m.group(2)!;
  if (scheme != 'http' && scheme != 'https') throw FormatException('URL scheme must be http or https', text);
  if (auth.contains('@')) throw FormatException('URL userinfo is not allowed', text);
  final hm = _authority.firstMatch(auth);
  if (hm == null) throw FormatException('invalid URL host or port', text);
  var host = hm.group(1)!.toLowerCase();
  if (host.startsWith('[')) host = '[${canonicalIp(host.substring(1, host.length - 1))}]';
  var port = '';
  final rawPort = hm.group(2);
  if (rawPort != null && rawPort.isNotEmpty) {
    final digits = rawPort.replaceFirst(RegExp('^0+'), '');
    final p = digits.isEmpty ? 0 : (digits.length > 5 ? 99999 : int.parse(digits));
    if (p > 65535) throw FormatException('URL port out of range', text);
    if (!((scheme == 'http' && p == 80) || (scheme == 'https' && p == 443))) port = ':$p';
  }
  var path = removeDotSegments(_normalizePercent(m.group(3)!));
  if (path.isEmpty) path = '/';
  var query = m.group(4) == null ? '' : _normalizePercent(m.group(4)!);
  if (query == '?') query = '';
  return '$scheme://$host$port$path$query';
}

String _normalizePercent(String s) {
  final sb = StringBuffer();
  for (var i = 0; i < s.length; i++) {
    if (s[i] != '%') {
      sb.write(s[i]);
      continue;
    }
    if (i + 3 > s.length || !_hex.hasMatch(s.substring(i + 1, i + 3))) {
      throw FormatException("'%' must be followed by two hex digits", s, i);
    }
    final c = String.fromCharCode(int.parse(s.substring(i + 1, i + 3), radix: 16));
    sb.write(_unreserved.hasMatch(c) ? c : '%${s.substring(i + 1, i + 3).toUpperCase()}');
    i += 2;
  }
  return sb.toString();
}
