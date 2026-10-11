// SPDX-License-Identifier: Apache-2.0
/// Password and passphrase generation with an injected byte source ([nextByte] returns 0..255) so results are
/// reproducible in tests; omit it to use the platform CSPRNG (`Random.secure()`). Indexes use unbiased rejection
/// sampling; passwords take one character from each class in class order, fill the rest from the union of the classes,
/// then Fisher-Yates shuffle. Failures throw [ArgumentError].
library;

import 'dart:math';

const _classes = {
  'lower': 'abcdefghijklmnopqrstuvwxyz',
  'upper': 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
  'digits': '0123456789',
  'symbols': r'!#$%&*+-=?@^_~',
};
const _ambiguous = 'Il1O0o';
final Random _secure = Random.secure();

int _secureByte() => _secure.nextInt(256);

/// Unbiased index in [0, n) by rejection sampling over the fewest big-endian bytes covering n (n up to 2^56).
int randomIndex(int n, [int Function()? nextByte]) {
  final next = nextByte ?? _secureByte;
  if (n < 1) throw ArgumentError.value(n, 'n', 'must be positive');
  if (n > 1 << 56) throw ArgumentError.value(n, 'n', 'must be at most 2^56');
  if (n == 1) return 0;
  var k = 1;
  while (pow(256, k) < n) {
    k++;
  }
  final range = 1 << (8 * k);
  final limit = (range ~/ n) * n;
  while (true) {
    var x = 0;
    for (var i = 0; i < k; i++) {
      x = x * 256 + next();
    }
    if (x < limit) return x % n;
  }
}

/// Generates a password of [length] (classes.length..1024) from the given classes (lower, upper, digits, symbols).
String generatePassword({
  int length = 16,
  List<String> classes = const ['lower', 'upper', 'digits', 'symbols'],
  int Function()? nextByte,
  bool excludeAmbiguous = false,
}) {
  final next = nextByte ?? _secureByte;
  if (classes.isEmpty || classes.toSet().length != classes.length || classes.any((c) => !_classes.containsKey(c))) {
    throw ArgumentError.value(classes, 'classes', 'bad classes');
  }
  if (length < classes.length || length > 1024) throw ArgumentError.value(length, 'length', 'bad length');
  final alphabets = [
    for (final c in classes)
      _classes[c]!.split('').where((ch) => !(excludeAmbiguous && _ambiguous.contains(ch))).join(),
  ];
  final out = [for (final a in alphabets) a[randomIndex(a.length, next)]];
  final union = alphabets.join();
  for (var i = classes.length; i < length; i++) {
    out.add(union[randomIndex(union.length, next)]);
  }
  for (var i = out.length - 1; i > 0; i--) {
    final j = randomIndex(i + 1, next);
    final t = out[i];
    out[i] = out[j];
    out[j] = t;
  }
  return out.join();
}

/// Joins [count] (1..64) words chosen from [words] (at least 2 distinct, non-empty) with [separator].
String generatePassphrase(List<String> words, {int count = 5, String separator = '-', int Function()? nextByte}) {
  final next = nextByte ?? _secureByte;
  if (count < 1 || count > 64 || words.toSet().length < 2 || words.any((w) => w.isEmpty)) {
    throw ArgumentError('bad arguments');
  }
  return [for (var i = 0; i < count; i++) words[randomIndex(words.length, next)]].join(separator);
}

/// length * log2(alphabetSize) rounded to 2 decimals (for strength meters).
double entropyBits(int alphabetSize, int length) {
  if (alphabetSize < 1 || length < 0) throw ArgumentError('bad arguments');
  return (length * log(alphabetSize) / ln2 * 100).round() / 100;
}
