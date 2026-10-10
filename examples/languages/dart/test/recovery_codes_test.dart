// SPDX-License-Identifier: Apache-2.0
import 'dart:convert';

import 'package:genlib_validation_example/recovery_codes.dart';

import 'src/checks.dart';

void runRecoveryCodesTests(Checks c) {
  c.eq('normalize spaces/case', '7K3QX9MNP2', normalizeRecoveryCode(' 7k3qx-9mnp2 '));
  c.eq('normalize O/I', 'ABCDEFGH10', normalizeRecoveryCode('ABCDE-FGHIO'));
  c.throws<FormatException>('normalize U rejected', () => normalizeRecoveryCode('ABCDE-FGHIU'));
  c.throws<FormatException>('normalize length rejected', () => normalizeRecoveryCode('ABC'));
  final pepper = ascii.encode('pepper');
  c.eq('hash vector', 'b6a0f9ca8ffdc4e8e3268b490bb8beeda45f367550751b8cb151636dad869138',
      hashRecoveryCode('7K3QX-9MNP2', pepper));
  final codes = generateRecoveryCodes();
  c.check('generate count/unique', codes.length == 10 && codes.toSet().length == 10);
  final format = RegExp(r'^[0-9A-HJKMNP-TV-Z]{5}-[0-9A-HJKMNP-TV-Z]{5}$');
  c.check('generate format', codes.every(format.hasMatch));
  final stored = codes.take(3).map((code) => hashRecoveryCode(code, pepper)).toList();
  c.eq('find index 2', 2, findRecoveryCode(codes[2].toLowerCase(), stored, pepper));
  c.eq('find unknown', -1, findRecoveryCode(codes[5], stored, pepper));
  c.eq('find invalid input', -1, findRecoveryCode('bad', stored, pepper));
}

void main() {
  final c = Checks('recovery-codes');
  runRecoveryCodesTests(c);
  c.finish();
}
