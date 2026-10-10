/// Strict ASCII application identifiers. Not authorization or SQL sanitization.
bool isValidIdentifier(String? value, {int maxLength = 64}) {
  if (value == null || value.isEmpty || maxLength < 1 || value.length > maxLength) return false;
  for (var i = 0; i < value.length; i++) {
    final c = value.codeUnitAt(i);
    final alpha = (c >= 65 && c <= 90) || (c >= 97 && c <= 122);
    final digit = c >= 48 && c <= 57;
    if (!(alpha || digit || (i > 0 && (c == 95 || c == 45)))) return false;
  }
  return true;
}
