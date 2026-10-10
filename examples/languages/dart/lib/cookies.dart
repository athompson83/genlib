// SPDX-License-Identifier: Apache-2.0
/// RFC 6265 Set-Cookie serialization with current browser prefix and SameSite rules, and Cookie header parsing.
library;

import 'http_conditional.dart' show formatHttpDate;

final _token = RegExp(r"^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$");
final _octets = RegExp(r'^[\x21\x23-\x2b\x2d-\x3a\x3c-\x5b\x5d-\x7e]*$');
final _domain = RegExp(r'^\.?[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)*$');
final _pathBad = RegExp(r'[\x00-\x1f\x7f;]');

/// Builds a Set-Cookie value: `name=value; Max-Age; Expires; Domain; Path; Secure; HttpOnly; SameSite; Partitioned`.
/// [expires] is unix seconds (written as an IMF-fixdate) and [sameSite] is `Strict`, `Lax` or `None` (exact case).
/// Throws [ArgumentError] for a non-token name, a value outside cookie-octet (encode it first), an invalid domain or
/// path, SameSite=None or Partitioned without Secure, a negative Max-Age and `__Secure-`/`__Host-` prefix violations.
String serializeCookie(
  String name,
  String value, {
  int? maxAge,
  int? expires,
  String? domain,
  String? path,
  bool secure = false,
  bool httpOnly = false,
  String? sameSite,
  bool partitioned = false,
}) {
  if (!_token.hasMatch(name)) throw ArgumentError.value(name, 'name', 'must be an RFC 7230 token');
  if (!_octets.hasMatch(value)) throw ArgumentError.value(value, 'value', 'has characters outside cookie-octet; encode it first');
  if (domain != null && !_domain.hasMatch(domain)) throw ArgumentError.value(domain, 'domain', 'invalid cookie domain');
  if (path != null && (!path.startsWith('/') || _pathBad.hasMatch(path))) {
    throw ArgumentError.value(path, 'path', 'must start with / and contain no controls or ;');
  }
  if (sameSite != null && !const ['Strict', 'Lax', 'None'].contains(sameSite)) {
    throw ArgumentError.value(sameSite, 'sameSite', 'must be Strict, Lax or None');
  }
  if (sameSite == 'None' && !secure) throw ArgumentError('SameSite=None requires Secure');
  if (partitioned && !secure) throw ArgumentError('Partitioned requires Secure');
  if (name.startsWith('__Secure-') && !secure) throw ArgumentError('__Secure- requires Secure');
  if (name.startsWith('__Host-') && (!secure || domain != null || path != '/')) {
    throw ArgumentError('__Host- requires Secure, Path=/ and no Domain');
  }
  if (maxAge != null && maxAge < 0) throw ArgumentError.value(maxAge, 'maxAge', 'must be non-negative');
  return [
    '$name=$value',
    if (maxAge != null) 'Max-Age=$maxAge',
    if (expires != null) 'Expires=${formatHttpDate(expires)}',
    if (domain != null) 'Domain=${domain.toLowerCase()}',
    if (path != null) 'Path=$path',
    if (secure) 'Secure',
    if (httpOnly) 'HttpOnly',
    if (sameSite != null) 'SameSite=$sameSite',
    if (partitioned) 'Partitioned',
  ].join('; ');
}

/// Parses a Cookie request header into ordered `(name, value)` pairs, keeping duplicates. Pieces without `=` or with an
/// empty name are skipped; one pair of surrounding double quotes is removed from the value.
List<(String, String)> parseCookieHeader(String header) {
  final pairs = <(String, String)>[];
  for (final piece in header.split(';')) {
    final eq = piece.indexOf('=');
    if (eq < 0) continue;
    final n = _trimSpTab(piece.substring(0, eq));
    var v = _trimSpTab(piece.substring(eq + 1));
    if (n.isEmpty) continue;
    if (v.length >= 2 && v.startsWith('"') && v.endsWith('"')) v = v.substring(1, v.length - 1);
    pairs.add((n, v));
  }
  return pairs;
}

String _trimSpTab(String s) => s.replaceFirst(RegExp(r'^[ \t]+'), '').replaceFirst(RegExp(r'[ \t]+$'), '');
