// SPDX-License-Identifier: Apache-2.0
/// Plain-text wrapping and truncation counted in Unicode code points. [wrapText] keeps input line breaks (CRLF and CR
/// become LF), splits words on runs of spaces/tabs, fills lines greedily and breaks words longer than the width.
/// [truncateText] shortens text to a maximum length including the ellipsis, preferring a word boundary in the second
/// half. Invalid widths and lengths throw [TextWrapException].
library;

/// A width or maximum length that cannot be honoured.
class TextWrapException implements Exception {
  final String message;
  const TextWrapException(this.message);
  @override
  String toString() => 'TextWrapException: $message';
}

final _blanks = RegExp(r'[ \t]+');

/// Greedily wraps [text] to lines of at most [width] code points.
String wrapText(String text, int width) {
  if (width < 1) throw const TextWrapException('width');
  final out = <String>[];
  for (final line in text.replaceAll('\r\n', '\n').replaceAll('\r', '\n').split('\n')) {
    var cur = <int>[];
    for (final word in line.split(_blanks)) {
      var w = word.runes.toList();
      if (w.isEmpty) continue;
      while (w.length > width) {
        if (cur.isNotEmpty) {
          out.add(String.fromCharCodes(cur));
          cur = [];
        }
        out.add(String.fromCharCodes(w.sublist(0, width)));
        w = w.sublist(width);
      }
      if (w.isEmpty) continue;
      if (cur.isEmpty) {
        cur = w;
      } else if (cur.length + 1 + w.length <= width) {
        cur = [...cur, 0x20, ...w];
      } else {
        out.add(String.fromCharCodes(cur));
        cur = w;
      }
    }
    out.add(String.fromCharCodes(cur));
  }
  return out.join('\n');
}

/// Shortens [text] to at most [maxLen] code points, ending with [ellipsis] when cut.
String truncateText(String text, int maxLen, [String ellipsis = '…']) {
  final cps = text.runes.toList();
  if (cps.length <= maxLen) return text;
  final keep = maxLen - ellipsis.runes.length;
  if (maxLen < 1 || keep < 0) throw const TextWrapException('max_len');
  var cut = cps.sublist(0, keep);
  final sp = cut.lastIndexOf(0x20);
  if (sp >= keep ~/ 2 && sp > 0) cut = cut.sublist(0, sp);
  var endAt = cut.length;
  while (endAt > 0 && cut[endAt - 1] == 0x20) {
    endAt--;
  }
  return String.fromCharCodes(cut.sublist(0, endAt)) + ellipsis;
}
