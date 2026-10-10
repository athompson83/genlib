// SPDX-License-Identifier: Apache-2.0
/// Scope: builds and checks the browser leg of OAuth 2.0 authorization code + PKCE (OIDC) only.
/// ID token and access token VERIFICATION must use a vetted library (see the Tier B cookbook).
/// Never decode a token to make an auth decision here.
library;

import 'dart:convert';
import 'dart:math';

import 'package:crypto/crypto.dart';

import 'src/encoding.dart';

const _unreserved = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';

/// Error returned by the authorization server or detected while checking the callback.
class OidcCallbackException implements Exception {
  final String error;
  final String? errorDescription;
  const OidcCallbackException(this.error, [this.errorDescription]);
  @override
  String toString() => errorDescription == null ? 'OidcCallbackException: $error' : 'OidcCallbackException: $error: $errorDescription';
}

/// Creates an RFC 7636 code verifier of 43-128 unreserved characters (unbiased selection).
String generateCodeVerifier([int length = 64]) {
  if (length < 43 || length > 128) throw RangeError.range(length, 43, 128, 'length');
  final random = Random.secure();
  final out = StringBuffer();
  for (var i = 0; i < length; i++) {
    out.write(_unreserved[random.nextInt(_unreserved.length)]);
  }
  return out.toString();
}

/// base64url(SHA-256(ASCII verifier)) without padding.
String codeChallengeS256(String verifier) {
  if (verifier.length < 43 || verifier.length > 128 || verifier.split('').any((c) => !_unreserved.contains(c))) {
    throw ArgumentError.value(verifier, 'verifier', 'must be 43-128 unreserved characters');
  }
  return _base64Url(sha256.convert(ascii.encode(verifier)).bytes);
}

/// Random base64url token without padding, for state and nonce (16-256 bytes).
String randomToken([int bytes = 32]) {
  if (bytes < 16 || bytes > 256) throw RangeError.range(bytes, 16, 256, 'bytes');
  final random = Random.secure();
  return _base64Url(List<int>.generate(bytes, (_) => random.nextInt(256)));
}

/// Builds the authorization request URL. [scope] is a `List<String>` or a space-separated `String`.
String buildAuthorizationUrl({
  required String authorizationEndpoint,
  required String clientId,
  required String redirectUri,
  required Object scope,
  required String state,
  required String nonce,
  required String codeChallenge,
  List<MapEntry<String, String>> extraParams = const [],
}) {
  final uri = Uri.tryParse(authorizationEndpoint);
  if (uri == null || !uri.isAbsolute || uri.host.isEmpty || authorizationEndpoint.contains('#')) {
    throw ArgumentError.value(authorizationEndpoint, 'authorizationEndpoint', 'must be an absolute URL without fragment');
  }
  final loopback = uri.scheme == 'http' && (uri.host == 'localhost' || uri.host == '127.0.0.1');
  if (uri.scheme != 'https' && !loopback) {
    throw ArgumentError.value(authorizationEndpoint, 'authorizationEndpoint', 'must use https (http only for localhost/127.0.0.1)');
  }
  final scopes = switch (scope) {
    String s => s.split(' ').where((e) => e.isNotEmpty).toList(),
    List<String> l => l.expand((s) => s.split(' ')).where((e) => e.isNotEmpty).toList(),
    _ => throw ArgumentError.value(scope, 'scope', 'must be a String or List<String>'),
  };
  if (!scopes.contains('openid')) throw ArgumentError.value(scope, 'scope', 'must contain openid');
  for (final entry in {'clientId': clientId, 'redirectUri': redirectUri, 'state': state, 'nonce': nonce, 'codeChallenge': codeChallenge}.entries) {
    if (entry.value.isEmpty) throw ArgumentError.value(entry.value, entry.key, 'is required');
  }
  final params = <MapEntry<String, String>>[
    const MapEntry('response_type', 'code'),
    MapEntry('client_id', clientId),
    MapEntry('redirect_uri', redirectUri),
    MapEntry('scope', scopes.join(' ')),
    MapEntry('state', state),
    MapEntry('nonce', nonce),
    MapEntry('code_challenge', codeChallenge),
    const MapEntry('code_challenge_method', 'S256'),
  ];
  for (final extra in extraParams) {
    if (extra.key.isEmpty) throw ArgumentError('extra parameter name is required');
    if (params.any((p) => p.key == extra.key)) {
      throw ArgumentError.value(extra.key, 'extraParams', 'would override a protocol parameter');
    }
    params.add(extra);
  }
  final query = params.map((p) => '${percentEncode(p.key)}=${percentEncode(p.value)}').join('&');
  final separator = !authorizationEndpoint.contains('?')
      ? '?'
      : (authorizationEndpoint.endsWith('?') || authorizationEndpoint.endsWith('&'))
          ? ''
          : '&';
  return '$authorizationEndpoint$separator$query';
}

/// Returns the authorization code after checking error, code presence and state (constant time).
String parseCallback(String callbackUrl, String expectedState) {
  if (expectedState.isEmpty) throw ArgumentError.value(expectedState, 'expectedState', 'is required');
  var rest = callbackUrl;
  final hash = rest.indexOf('#');
  if (hash >= 0) rest = rest.substring(0, hash);
  final q = rest.indexOf('?');
  final query = q >= 0 ? rest.substring(q + 1) : '';
  final values = <String, String>{};
  for (final pair in query.split('&').where((p) => p.isNotEmpty)) {
    final eq = pair.indexOf('=');
    final key = _formDecode(eq >= 0 ? pair.substring(0, eq) : pair);
    final value = _formDecode(eq >= 0 ? pair.substring(eq + 1) : '');
    if (values.containsKey(key)) throw OidcCallbackException('invalid_callback', "duplicate parameter '$key'");
    values[key] = value;
  }
  final error = values['error'];
  if (error != null) throw OidcCallbackException(error, values['error_description']);
  final code = values['code'];
  if (code == null || code.isEmpty) throw const OidcCallbackException('missing_code');
  if (!constantTimeEquals(utf8.encode(values['state'] ?? ''), utf8.encode(expectedState))) {
    throw const OidcCallbackException('state_mismatch');
  }
  return code;
}

/// application/x-www-form-urlencoded body for the token request.
String tokenRequestBody({
  required String code,
  required String redirectUri,
  required String clientId,
  required String codeVerifier,
}) {
  for (final entry in {'code': code, 'redirectUri': redirectUri, 'clientId': clientId, 'codeVerifier': codeVerifier}.entries) {
    if (entry.value.isEmpty) throw ArgumentError.value(entry.value, entry.key, 'is required');
  }
  String f(String v) => percentEncode(v, spaceAsPlus: true);
  return 'grant_type=authorization_code&code=${f(code)}&redirect_uri=${f(redirectUri)}'
      '&client_id=${f(clientId)}&code_verifier=${f(codeVerifier)}';
}

String _base64Url(List<int> bytes) => base64Url.encode(bytes).replaceAll('=', '');

String _formDecode(String value) {
  try {
    return Uri.decodeQueryComponent(value);
  } on ArgumentError {
    throw const OidcCallbackException('invalid_callback', 'malformed percent-encoding');
  } on FormatException {
    throw const OidcCallbackException('invalid_callback', 'malformed percent-encoding');
  }
}
