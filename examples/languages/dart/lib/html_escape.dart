// SPDX-License-Identifier: Apache-2.0
/// HTML escaping for text and quoted attributes, unescaping of character references (decimal with 1-10 digits, hex
/// with 1-8 digits, ';' required; 0, surrogates and values above U+10FFFF become U+FFFD; 0x80-0x9F map through the
/// HTML5 windows-1252 table) and a fixed set of named references (case-sensitive, ';' required). [stripTags] is for
/// plain-text previews only: it is NOT a sanitizer and its output must never be rendered as HTML.
library;

const _named = {
  'amp': '&', 'lt': '<', 'gt': '>', 'quot': '"', 'apos': "'", 'nbsp': ' ', 'copy': '©', 'reg': '®', //
  'trade': '™', 'hellip': '…', 'mdash': '—', 'ndash': '–', 'lsquo': '‘', 'rsquo': '’',
  'ldquo': '“', 'rdquo': '”', 'bull': '•', 'middot': '·', 'deg': '°', 'plusmn': '±',
  'times': '×', 'divide': '÷', 'euro': '€', 'pound': '£', 'yen': '¥', 'cent': '¢',
  'sect': '§', 'para': '¶', 'laquo': '«', 'raquo': '»', 'iexcl': '¡', 'iquest': '¿',
  'shy': '­',
};
const _c1 = {
  0x80: 0x20AC, 0x82: 0x201A, 0x83: 0x0192, 0x84: 0x201E, 0x85: 0x2026, 0x86: 0x2020, 0x87: 0x2021, 0x88: 0x02C6, //
  0x89: 0x2030, 0x8A: 0x0160, 0x8B: 0x2039, 0x8C: 0x0152, 0x8E: 0x017D, 0x91: 0x2018, 0x92: 0x2019, 0x93: 0x201C,
  0x94: 0x201D, 0x95: 0x2022, 0x96: 0x2013, 0x97: 0x2014, 0x98: 0x02DC, 0x99: 0x2122, 0x9A: 0x0161, 0x9B: 0x203A,
  0x9C: 0x0153, 0x9E: 0x017E, 0x9F: 0x0178,
};
final _ref = RegExp(r'&(#[xX][0-9A-Fa-f]{1,8}|#[0-9]{1,10}|[A-Za-z][A-Za-z0-9]{0,31});');
final _tag = RegExp(r'<[A-Za-z/!?][^>]*>');

/// Escapes & < > " ' for HTML text and single- or double-quoted attribute values.
String escapeHtml(String s) => s
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');

String _numeric(int v) {
  if (v == 0 || (v >= 0xD800 && v <= 0xDFFF) || v > 0x10FFFF) return '�';
  return String.fromCharCode(_c1[v] ?? v);
}

/// Decodes numeric and the fixed named character references; anything else is left as is.
String unescapeHtml(String s) => s.replaceAllMapped(_ref, (m) {
      final g = m.group(1)!;
      if (g.startsWith('#')) {
        final hex = g[1] == 'x' || g[1] == 'X';
        return _numeric(int.parse(hex ? g.substring(2) : g.substring(1), radix: hex ? 16 : 10));
      }
      return _named[g] ?? m.group(0)!;
    });

// Python str.isspace() code points (the reference's `\s`).
bool _isSpace(int c) =>
    (c >= 9 && c <= 13) ||
    (c >= 0x1C && c <= 0x20) ||
    c == 0x85 ||
    c == 0xA0 ||
    c == 0x1680 ||
    (c >= 0x2000 && c <= 0x200A) ||
    c == 0x2028 ||
    c == 0x2029 ||
    c == 0x202F ||
    c == 0x205F ||
    c == 0x3000;

final _wordChar = RegExp(r'^[\p{L}\p{N}_]$', unicode: true);
bool _isWord(int c) => _wordChar.hasMatch(String.fromCharCode(c));

// Case-insensitive match of one code point against a lowercase ASCII letter, including the non-ASCII case partners
// Python's re.IGNORECASE accepts (U+0130/U+0131 for i, U+017F for s, U+212A for k).
bool _ci(int c, int letter) =>
    c == letter ||
    c == letter - 32 ||
    (letter == 0x69 && (c == 0x130 || c == 0x131)) ||
    (letter == 0x73 && c == 0x17F) ||
    (letter == 0x6B && c == 0x212A);

bool _word(List<int> t, int at, String w) {
  if (at + w.length > t.length) return false;
  for (var i = 0; i < w.length; i++) {
    if (!_ci(t[at + i], w.codeUnitAt(i))) return false;
  }
  return true;
}

/// Removes `<script>`/`<style>` elements with their content (to the matching close tag or the end of input).
String _dropRawText(List<int> t) {
  final out = <int>[];
  var i = 0;
  outer:
  while (i < t.length) {
    if (t[i] == 0x3C) {
      for (final w in const ['script', 'style']) {
        final e = i + 1 + w.length;
        if (!_word(t, i + 1, w) || (e < t.length && _isWord(t[e]))) continue;
        final gt = t.indexOf(0x3E, e);
        if (gt < 0) continue;
        // Lazy scan for '</name\s*>' or the end of input ('$' also matches before a final newline).
        for (var q = gt + 1; q <= t.length; q++) {
          if (q + 1 < t.length && t[q] == 0x3C && t[q + 1] == 0x2F && _word(t, q + 2, w)) {
            var r = q + 2 + w.length;
            while (r < t.length && _isSpace(t[r])) {
              r++;
            }
            if (r < t.length && t[r] == 0x3E) {
              i = r + 1;
              continue outer;
            }
          }
          if (q == t.length || (q == t.length - 1 && t[q] == 0x0A)) {
            i = q;
            continue outer;
          }
        }
      }
    }
    out.add(t[i]);
    i++;
  }
  return String.fromCharCodes(out);
}

/// Plain-text preview: drops script/style contents, removes tags, then unescapes. NOT an HTML sanitizer.
String stripTags(String s) => unescapeHtml(_dropRawText(s.runes.toList()).replaceAll(_tag, ''));
