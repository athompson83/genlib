// SPDX-License-Identifier: Apache-2.0
import 'package:genlib_validation_example/oidc_pkce.dart';

import 'src/checks.dart';

void runOidcPkceTests(Checks c) {
  const challenge = 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM';
  c.eq('pkce challenge', challenge, codeChallengeS256('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk'));
  String build({String endpoint = 'https://id.example.com/authorize', Object scope = const ['openid', 'email'],
          List<MapEntry<String, String>> extra = const []}) =>
      buildAuthorizationUrl(
          authorizationEndpoint: endpoint, clientId: 'app 1', redirectUri: 'https://app.example.com/cb', scope: scope,
          state: 's1', nonce: 'n1', codeChallenge: challenge, extraParams: extra);
  c.eq('authorization url',
      'https://id.example.com/authorize?response_type=code&client_id=app%201&redirect_uri=https%3A%2F%2Fapp.example.com%2Fcb&scope=openid%20email&state=s1&nonce=n1&code_challenge=E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM&code_challenge_method=S256',
      build());
  c.eq('scope string accepted', build(), build(scope: 'openid email'));
  c.throws<ArgumentError>('http endpoint rejected', () => build(endpoint: 'http://id.example.com/authorize'));
  c.check('localhost endpoint accepted',
      build(endpoint: 'http://localhost:8080/authorize').startsWith('http://localhost:8080/authorize?response_type=code&'));
  c.check('existing query preserved',
      build(endpoint: 'https://id.example.com/authorize?tenant=a').startsWith('https://id.example.com/authorize?tenant=a&response_type=code&'));
  c.check('extra params appended',
      build(extra: [const MapEntry('prompt', 'login')]).endsWith('&code_challenge_method=S256&prompt=login'));
  c.throws<ArgumentError>('scope without openid rejected', () => build(scope: ['email']));
  c.eq('parse callback', 'abc', parseCallback('https://app.example.com/cb?code=abc&state=s1', 's1'));
  c.throws<OidcCallbackException>('state mismatch',
      () => parseCallback('https://app.example.com/cb?code=abc&state=s1', 's2'), (e) => e.error == 'state_mismatch');
  c.throws<OidcCallbackException>(
      'callback error',
      () => parseCallback('https://app.example.com/cb?error=access_denied&error_description=User%20denied&state=s1', 's1'),
      (e) => e.error == 'access_denied' && e.errorDescription == 'User denied');
  c.throws<OidcCallbackException>('missing code', () => parseCallback('https://app.example.com/cb?state=s1', 's1'),
      (e) => e.error == 'missing_code');
  c.eq('token body',
      'grant_type=authorization_code&code=c+d&redirect_uri=https%3A%2F%2Fapp.example.com%2Fcb&client_id=app&code_verifier=v',
      tokenRequestBody(code: 'c d', redirectUri: 'https://app.example.com/cb', clientId: 'app', codeVerifier: 'v'));
  final verifier = generateCodeVerifier();
  c.check('verifier length/chars', verifier.length == 64 && RegExp(r'^[A-Za-z0-9._~-]+$').hasMatch(verifier));
  c.throws<RangeError>('verifier 42 rejected', () => generateCodeVerifier(42));
  c.throws<RangeError>('verifier 129 rejected', () => generateCodeVerifier(129));
  final token = randomToken();
  c.check('random token', token.length == 43 && RegExp(r'^[A-Za-z0-9_-]+$').hasMatch(token));
}

void main() {
  final c = Checks('oidc-pkce');
  runOidcPkceTests(c);
  c.finish();
}
