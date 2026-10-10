// SPDX-License-Identifier: Apache-2.0
/// Thin wrapper around `package:jose` for verifying OIDC ID tokens / JWT access tokens.
///
/// jose verifies the JWS signature with a key from the key store, enforces the alg
/// allow-list and checks exp (with tolerance), iss and aud. It does NOT check `nbf`,
/// does not require `exp`, and its JWKS URL loader caches without refetching on an
/// unknown `kid`; this wrapper adds those, plus the nonce comparison.
library;

import 'dart:convert';

import 'package:http/http.dart' as http;
import 'package:jose/jose.dart';

class TokenInvalid implements Exception {
  final String message;
  TokenInvalid(this.message);
  @override
  String toString() => 'TokenInvalid: $message';
}

class OidcVerifier {
  final Uri issuer;
  final String audience;
  final Uri jwksUri; // from discovery; https in production
  final List<String> algorithms;
  final Duration leeway;
  final Duration cacheTtl;
  final Duration refetchCooldown;
  final http.Client _http;

  JsonWebKeyStore? _store;
  Set<String> _kids = {};
  DateTime? _fetchedAt;

  OidcVerifier({
    required this.issuer,
    required this.audience,
    required this.jwksUri,
    this.algorithms = const ['RS256', 'ES256'],
    this.leeway = const Duration(seconds: 60),
    this.cacheTtl = const Duration(minutes: 10),
    this.refetchCooldown = const Duration(seconds: 30),
    http.Client? httpClient,
  }) : _http = httpClient ?? http.Client() {
    if (algorithms.any((a) => a == 'none' || a.startsWith('HS'))) {
      throw ArgumentError('symmetric or "none" algorithms are not allowed with a public JWKS');
    }
  }

  Future<JsonWebKeyStore> _keysFor(String? kid) async {
    final now = DateTime.now();
    final fetched = _fetchedAt;
    final stale = fetched == null || now.difference(fetched) > cacheTtl;
    final canRefetch = fetched == null || now.difference(fetched) >= refetchCooldown;
    if (stale || (kid != null && !_kids.contains(kid) && canRefetch)) {
      final r = await _http.get(jwksUri).timeout(const Duration(seconds: 5));
      if (r.statusCode != 200) throw TokenInvalid('JWKS fetch failed: ${r.statusCode}');
      final set = JsonWebKeySet.fromJson(jsonDecode(r.body) as Map<String, dynamic>);
      _kids = set.keys.map((k) => k.keyId).whereType<String>().toSet();
      _store = JsonWebKeyStore()..addKeySet(set);
      _fetchedAt = now;
    }
    return _store!;
  }

  /// Verifies [token]; pass the nonce stored with the authorization request, if any.
  Future<JsonWebTokenClaims> verify(String token, {String? nonce}) async {
    final JsonWebToken jwt;
    try {
      final kid = _headerKid(token);
      jwt = await JsonWebToken.decodeAndVerify(token, await _keysFor(kid), allowedArguments: algorithms);
    } on TokenInvalid {
      rethrow;
    } catch (e) {
      throw TokenInvalid('signature/format: $e');
    }
    final c = jwt.claims;
    if (c.expiry == null || c.issuedAt == null || c.subject == null) {
      throw TokenInvalid('missing exp/iat/sub');
    }
    final errors = c.validate(expiryTolerance: leeway, issuer: issuer, clientId: audience).toList();
    if (errors.isNotEmpty) throw TokenInvalid(errors.first.toString());
    final nbf = c.notBefore;
    if (nbf != null && nbf.isAfter(DateTime.now().add(leeway))) throw TokenInvalid('token not yet valid (nbf)');
    // nonce binds an ID token to the authorization request (OIDC Core 3.1.3.7)
    if (nonce != null && c['nonce'] != nonce) throw TokenInvalid('nonce mismatch');
    return c;
  }

  static String? _headerKid(String token) {
    final header = jsonDecode(utf8.decode(base64Url.decode(base64Url.normalize(token.split('.').first))));
    return header is Map ? header['kid'] as String? : null;
  }
}
