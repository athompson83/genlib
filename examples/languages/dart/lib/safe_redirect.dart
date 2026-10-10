// SPDX-License-Identifier: Apache-2.0
/// Open-redirect guard: allow same-site paths and absolute http(s) URLs on allow-listed origins only.
library;

final _absolute = RegExp(r'^([hH][tT][tT][pP][sS]?)://([A-Za-z0-9.-]+)(?::([0-9]{1,5}))?(/[^?#]*)?(\?[^#]*)?(#.*)?$');

/// Returns [target] when it is a safe redirect, otherwise [fallback].
///
/// Safe targets are paths starting with a single `/`, or absolute `http`/`https` URLs whose origin
/// (lowercase scheme and host, default port dropped) equals an origin in [allowedOrigins]. Control
/// characters, spaces, backslashes, userinfo, protocol-relative `//host` and other schemes are unsafe.
/// Invalid entries in [allowedOrigins] never match.
String safeRedirect(String target, Iterable<String> allowedOrigins, {String fallback = '/'}) {
  if (target.isEmpty || target.runes.length > 2048) return fallback;
  for (final c in target.codeUnits) {
    if (c <= 0x20 || c == 0x7f || c == 0x5c) return fallback;
  }
  if (target.startsWith('/')) return target.startsWith('//') ? fallback : target;
  final origin = _origin(target);
  if (origin == null) return fallback;
  for (final allowed in allowedOrigins) {
    if (_origin(allowed) == origin) return target;
  }
  return fallback;
}

String? _origin(String url) {
  final m = _absolute.firstMatch(url);
  if (m == null) return null;
  final scheme = m.group(1)!.toLowerCase(), host = m.group(2)!.toLowerCase(), port = m.group(3);
  if (host.startsWith('.') || host.endsWith('.') || host.contains('..')) return null;
  var suffix = '';
  if (port != null) {
    final p = int.parse(port);
    if (p < 1 || p > 65535) return null;
    if (!((scheme == 'https' && p == 443) || (scheme == 'http' && p == 80))) suffix = ':$p';
  }
  return '$scheme://$host$suffix';
}
