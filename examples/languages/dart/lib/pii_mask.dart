// SPDX-License-Identifier: Apache-2.0
/// Display masking of personal data for logs and UIs (masking, not anonymization): e-mail addresses, phone numbers,
/// card numbers, generic middle masking and free-text redaction of e-mails and Luhn-valid card numbers. E-mail and
/// middle masking count code points. Failures throw [PiiMaskException].
library;

/// Input that is not an e-mail address, phone number or card number, or bad masking arguments.
class PiiMaskException implements Exception {
  final String message;
  const PiiMaskException(this.message);
  @override
  String toString() => 'PiiMaskException: $message';
}

bool _isDigit(int c) => c >= 0x30 && c <= 0x39;
final _countryCode = RegExp(r'^\+(\p{Nd}{1,3}) ', unicode: true);
final _cardChars = RegExp(r'^[0-9 -]+$');
final _email = RegExp(r'[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}');
final _card = RegExp(r'(?<![0-9])[0-9](?:[ -]?[0-9]){12,18}(?![0-9])');

/// Masks the local part after its first code point ('jane.doe@example.com' -> 'j*******@example.com', at least 3 '*').
String maskEmail(String email) {
  final parts = email.split('@');
  if (parts.length != 2 || parts[0].isEmpty || parts[1].isEmpty) throw const PiiMaskException('not an email address');
  final local = parts[0].runes.toList();
  final stars = local.length - 1 < 3 ? 3 : local.length - 1;
  return '${String.fromCharCode(local[0])}${'*' * stars}@${parts[1]}';
}

/// Masks every ASCII digit except the last 4 and a leading '+CC ' country code; needs at least 7 digits.
String maskPhone(String phone) {
  final total = phone.codeUnits.where(_isDigit).length;
  if (total < 7) throw const PiiMaskException('not a phone number');
  final m = _countryCode.firstMatch(phone);
  final keepFront = m == null ? 0 : m.group(1)!.runes.length;
  var seen = 0;
  final out = StringBuffer();
  for (final c in phone.runes) {
    if (_isDigit(c)) {
      out.write(seen < keepFront || seen >= total - 4 ? String.fromCharCode(c) : '*');
      seen++;
    } else {
      out.writeCharCode(c);
    }
  }
  return out.toString();
}

/// Masks all but the last 4 digits of a 12-19 digit card number, keeping spaces and hyphens.
String maskCard(String card) {
  if (!_cardChars.hasMatch(card)) throw const PiiMaskException('not a card number');
  final total = card.codeUnits.where(_isDigit).length;
  if (total < 12 || total > 19) throw const PiiMaskException('not a card number');
  var seen = 0;
  final out = StringBuffer();
  for (final c in card.codeUnits) {
    if (_isDigit(c)) {
      out.write(seen >= total - 4 ? String.fromCharCode(c) : '*');
      seen++;
    } else {
      out.writeCharCode(c);
    }
  }
  return out.toString();
}

/// Keeps [keepStart] and [keepEnd] code points and masks the rest (everything when the string is that short).
String maskMiddle(String s, {int keepStart = 1, int keepEnd = 1, String mask = '*'}) {
  if (keepStart < 0 || keepEnd < 0 || mask.runes.length != 1) throw const PiiMaskException('bad arguments');
  final cps = s.runes.toList();
  if (cps.length <= keepStart + keepEnd) return mask * cps.length;
  return String.fromCharCodes(cps.sublist(0, keepStart)) +
      mask * (cps.length - keepStart - keepEnd) +
      String.fromCharCodes(cps.sublist(cps.length - keepEnd));
}

bool _luhn(String digits) {
  var sum = 0;
  for (var i = 0; i < digits.length; i++) {
    var n = digits.codeUnitAt(digits.length - 1 - i) - 0x30;
    if (i.isOdd) n = n * 2 > 9 ? n * 2 - 9 : n * 2;
    sum += n;
  }
  return sum % 10 == 0;
}

/// Replaces e-mail addresses and Luhn-valid 13-19 digit card numbers in free text with their masked forms.
String redact(String text, {List<String> kinds = const ['email', 'card']}) {
  for (final k in kinds) {
    if (k != 'email' && k != 'card') throw const PiiMaskException('unsupported kind');
  }
  var out = text;
  if (kinds.contains('card')) {
    out = out.replaceAllMapped(_card, (m) {
      final s = m.group(0)!;
      return _luhn(s.replaceAll(RegExp('[ -]'), '')) ? maskCard(s) : s;
    });
  }
  if (kinds.contains('email')) out = out.replaceAllMapped(_email, (m) => maskEmail(m.group(0)!));
  return out;
}
