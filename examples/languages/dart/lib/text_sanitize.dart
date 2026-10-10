// SPDX-License-Identifier: Apache-2.0
/// Untrusted-text cleanup: control, bidirectional (Trojan Source, CVE-2021-42574) and invisible characters.
/// U+200C/U+200D are kept because emoji sequences and Indic/Persian text need them. This is not HTML escaping;
/// still escape for the output context.
library;

const _bidi = {0x061C, 0x200E, 0x200F, 0x202A, 0x202B, 0x202C, 0x202D, 0x202E, 0x2066, 0x2067, 0x2068, 0x2069};
const _invisible = {0x200B, 0x2060, 0xFEFF};
final _whitespace = RegExp(r'[ \t\n\r\f\v]+');

/// Normalizes CRLF/CR to LF (or a space when [allowNewlines] is false), keeps TAB, removes other C0, DEL, C1, bidi
/// controls and U+200B/U+2060/U+FEFF, then truncates to [maxLength] code points.
String sanitizeText(String text, {bool allowNewlines = true, int? maxLength}) {
  if (maxLength != null && maxLength < 0) throw RangeError.value(maxLength, 'maxLength', 'must not be negative');
  final t = text.replaceAll('\r\n', '\n').replaceAll('\r', '\n');
  final out = <int>[];
  for (final cp in t.runes) {
    if (maxLength != null && out.length >= maxLength) break;
    if (cp == 0x0a) {
      out.add(allowNewlines ? 0x0a : 0x20);
    } else if (cp == 0x09) {
      out.add(cp);
    } else if (cp < 0x20 || (cp >= 0x7f && cp <= 0x9f) || _bidi.contains(cp) || _invisible.contains(cp)) {
      continue;
    } else {
      out.add(cp);
    }
  }
  return String.fromCharCodes(out);
}

/// Lists bidirectional control characters as (code point index, uppercase hex) records, e.g. `(24, '202E')`.
List<(int, String)> findBidiControls(String text) {
  final found = <(int, String)>[];
  var i = 0;
  for (final cp in text.runes) {
    if (_bidi.contains(cp)) found.add((i, cp.toRadixString(16).toUpperCase().padLeft(4, '0')));
    i++;
  }
  return found;
}

/// Collapses runs of space, tab, LF, CR, FF and VT into one space and trims spaces at both ends.
String normalizeWhitespace(String text) {
  final s = text.replaceAll(_whitespace, ' ');
  var start = 0, end = s.length;
  while (start < end && s[start] == ' ') {
    start++;
  }
  while (end > start && s[end - 1] == ' ') {
    end--;
  }
  return s.substring(start, end);
}
