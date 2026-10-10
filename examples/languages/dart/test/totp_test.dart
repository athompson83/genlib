// SPDX-License-Identifier: Apache-2.0
import 'dart:convert';

import 'package:genlib_validation_example/totp.dart';

import 'src/checks.dart';

void runTotpTests(Checks c) {
  final hotpSecret = ascii.encode('12345678901234567890');
  const hotpExpected = ['755224', '287082', '359152', '969429', '338314', '254676', '287922', '162583', '399871', '520489'];
  for (var i = 0; i < hotpExpected.length; i++) {
    c.eq('hotp counter $i', hotpExpected[i], hotp(hotpSecret, i));
  }
  final secrets = {
    'SHA1': ascii.encode('12345678901234567890'),
    'SHA256': ascii.encode('12345678901234567890123456789012'),
    'SHA512': ascii.encode('1234567890123456789012345678901234567890123456789012345678901234'),
  };
  const vectors = [
    (59, '94287082', '46119246', '90693936'),
    (1111111109, '07081804', '68084774', '25091201'),
    (1111111111, '14050471', '67062674', '99943326'),
    (1234567890, '89005924', '91819424', '93441116'),
    (2000000000, '69279037', '90698825', '38618901'),
    (20000000000, '65353130', '77737706', '47863826'),
  ];
  for (final (t, s1, s256, s512) in vectors) {
    c.eq('totp SHA1 t=$t', s1, totp(secrets['SHA1']!, t, digits: 8, algorithm: 'SHA1'));
    c.eq('totp SHA256 t=$t', s256, totp(secrets['SHA256']!, t, digits: 8, algorithm: 'SHA256'));
    c.eq('totp SHA512 t=$t', s512, totp(secrets['SHA512']!, t, digits: 8, algorithm: 'SHA512'));
  }
  c.eq('base32 encode', 'MZXW6YTBOI', base32Encode(ascii.encode('foobar')));
  c.eq('base32 decode', 'foobar', ascii.decode(base32Decode('mzxw 6ytb-oi==')));
  c.throws<FormatException>('base32 invalid', () => base32Decode('MZ1'));
  final code59 = totp(secrets['SHA1']!, 59, digits: 8);
  c.check('verify t=59', verifyTotp(code59, secrets['SHA1']!, 59, digits: 8));
  c.check('verify t=89', verifyTotp(code59, secrets['SHA1']!, 89, digits: 8));
  c.check('verify t=150 rejected', !verifyTotp(code59, secrets['SHA1']!, 150, digits: 8));
  c.check('verify non-digit rejected', !verifyTotp('abc', secrets['SHA1']!, 59, digits: 8));
  c.check('verify wrong length rejected', !verifyTotp('1234567', secrets['SHA1']!, 59, digits: 8));
  c.eq('otpauth uri',
      'otpauth://totp/Acme%20Co:alice%40example.com?secret=JBSWY3DPEHPK3PXP&issuer=Acme%20Co&algorithm=SHA1&digits=6&period=30',
      otpauthUri('Acme Co', 'alice@example.com', 'JBSWY3DPEHPK3PXP'));
  final a = generateSecret(), b = generateSecret();
  c.check('generateSecret length/distinct', a.length == 20 && base32Encode(a) != base32Encode(b));
}

void main() {
  final c = Checks('totp');
  runTotpTests(c);
  c.finish();
}
