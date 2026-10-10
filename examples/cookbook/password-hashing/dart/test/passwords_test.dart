// SPDX-License-Identifier: Apache-2.0
import 'package:cookbook_password_hashing/passwords.dart';
import 'package:test/test.dart';

void main() {
  test('hash and verify', () async {
    final h = await hashPassword('correct horse battery staple');
    expect(h, startsWith(r'$argon2id$v=19$m=19456,t=2,p=1$'));
    final ok = await verifyPassword(h, 'correct horse battery staple');
    expect(ok.ok, isTrue);
    expect(ok.rehash, isNull);
    expect((await verifyPassword(h, 'wrong')).ok, isFalse);
    expect(h, isNot(await hashPassword('correct horse battery staple')));
  });

  test('cross-library hashes verify', () async {
    // argon2-cffi 25.1.0 (reference libargon2) and node-argon2 0.45.1 (m,p,t order) for "pw".
    const cffi = r'$argon2id$v=19$m=19456,t=2,p=1$ecqUURt5rXczDOhwQxrhZw$w2dzt0CPmUdvSjkaj1rGvX6AKzIZ19bg8BnDrVw4KQc';
    const node = r'$argon2id$v=19$m=19456,p=1,t=2$yicTHnSW1i8qRUmdNAbUyA$3x14rcRfaMq+Akio0EutaRBea5WF4RsLUtcQfs23CaA';
    expect((await verifyPassword(cffi, 'pw')).ok, isTrue);
    expect((await verifyPassword(node, 'pw')).ok, isTrue);
    expect((await verifyPassword(cffi, 'nope')).ok, isFalse);
  });

  test('weaker parameters trigger rehash', () async {
    final weak = await hashPassword('pw', m: 8192, t: 1);
    final v = await verifyPassword(weak, 'pw');
    expect(v.ok, isTrue);
    expect(v.rehash, startsWith(r'$argon2id$v=19$m=19456,t=2,p=1$'));
  });

  test('bcrypt legacy upgrade', () async {
    final legacy = bcryptHash('pw', cost: 10);
    final v = await verifyPassword(legacy, 'pw');
    expect(v.ok, isTrue);
    expect(v.rehash, startsWith(r'$argon2id$'));
    expect((await verifyPassword(legacy, 'nope')).ok, isFalse);
    expect(() => bcryptHash('x' * 73), throwsArgumentError);
  });

  test('malformed hashes', () async {
    for (final h in ['', 'not-a-hash', r'$argon2id$v=19$m=1,t=1,p=1$AAAA$AAAA', r'$argon2i$v=19$m=19456,t=2,p=1$c2FsdHNhbHQ$aGFzaGhhc2hoYXNoaGFzaA']) {
      expect((await verifyPassword(h, 'pw')).ok, isFalse, reason: h);
    }
  });
}
