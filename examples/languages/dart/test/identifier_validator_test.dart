import '../lib/identifier_validator.dart';
void main() {
  if (!isValidIdentifier('user_1', maxLength: 16)) throw StateError('valid rejected');
  for (final bad in ['', '_bad', 'a/b', 'a b', 'é']) {
    if (isValidIdentifier(bad, maxLength: 16)) throw StateError('invalid accepted: $bad');
  }
  if (isValidIdentifier('abcd', maxLength: 3)) throw StateError('limit ignored');
}
