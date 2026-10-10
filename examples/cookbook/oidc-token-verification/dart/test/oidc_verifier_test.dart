// SPDX-License-Identifier: Apache-2.0
// Local-only test: RSA keys generated here; JWKS served by dart:io HttpServer on 127.0.0.1.
import 'dart:convert';
import 'dart:io';

import 'package:jose/jose.dart';
import 'package:oidc_token_verification/oidc_verifier.dart';
import 'package:test/test.dart';

const iss = 'https://idp.example.test';
const aud = 'client-123';

JsonWebKey newKey(String kid) => JsonWebKey.fromJson({...JsonWebKey.generate('RS256', keyBitLength: 2048).toJson(), 'kid': kid, 'alg': 'RS256', 'use': 'sig'});

Map<String, dynamic> publicJwk(JsonWebKey k) =>
    Map.of(k.toJson())..removeWhere((key, _) => const {'d', 'p', 'q', 'dp', 'dq', 'qi'}.contains(key));

int nowS() => DateTime.now().millisecondsSinceEpoch ~/ 1000;

String sign(JsonWebKey k, [Map<String, dynamic> over = const {}, String alg = 'RS256']) {
  final claims = {'iss': iss, 'aud': aud, 'sub': 'user-1', 'iat': nowS(), 'nbf': nowS(), 'exp': nowS() + 300, 'nonce': 'n-1', ...over};
  final b = JsonWebSignatureBuilder()
    ..jsonContent = claims
    ..setProtectedHeader('kid', k.keyId)
    ..setProtectedHeader('typ', 'JWT')
    ..addRecipient(k, algorithm: alg);
  return b.build().toCompactSerialization();
}

void main() {
  late HttpServer server;
  final keys = <JsonWebKey>[];
  var fetches = 0;

  setUpAll(() async {
    keys.add(newKey('k1'));
    server = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);
    server.listen((req) {
      fetches++;
      req.response
        ..headers.contentType = ContentType.json
        ..write(jsonEncode({'keys': keys.map(publicJwk).toList()}))
        ..close();
    });
  });
  tearDownAll(() => server.close(force: true));

  test('verifies valid tokens and rejects bad ones; refetches on kid rotation', () async {
    final v = OidcVerifier(
        issuer: Uri.parse(iss), audience: aud, jwksUri: Uri.parse('http://127.0.0.1:${server.port}/jwks'),
        leeway: const Duration(seconds: 5), refetchCooldown: Duration.zero);
    final k1 = keys.first;
    expect((await v.verify(sign(k1), nonce: 'n-1')).subject, 'user-1');

    final now = nowS();
    final good = sign(k1);
    final hs = JsonWebKey.fromJson({'kty': 'oct', 'k': base64Url.encode(List.filled(32, 120)).replaceAll('=', ''), 'kid': 'k1'});
    final bad = {
      'aud': sign(k1, {'aud': 'other'}),
      'iss': sign(k1, {'iss': 'https://evil.test'}),
      'expired': sign(k1, {'exp': now - 30, 'nbf': now - 60}),
      'nbf': sign(k1, {'nbf': now + 120}),
      'tampered': good.substring(0, good.length - 4) + (good.endsWith('AAAA') ? 'BBBB' : 'AAAA'),
      'hs256': sign(hs, {}, 'HS256'),
    };
    for (final e in bad.entries) {
      await expectLater(v.verify(e.value), throwsA(isA<TokenInvalid>()), reason: e.key);
    }
    await v.verify(sign(k1, {'exp': now - 2, 'nbf': now - 60})); // within leeway
    await expectLater(v.verify(sign(k1), nonce: 'other'), throwsA(isA<TokenInvalid>()));

    final before = fetches;
    final k2 = newKey('k2');
    keys.add(k2);
    expect((await v.verify(sign(k2))).subject, 'user-1');
    expect(fetches, greaterThan(before));
    await expectLater(v.verify(sign(newKey('nope'))), throwsA(isA<TokenInvalid>()));
    expect(() => OidcVerifier(issuer: Uri.parse(iss), audience: aud, jwksUri: Uri.parse('https://x'), algorithms: ['HS256']),
        throwsArgumentError);
  });
}
