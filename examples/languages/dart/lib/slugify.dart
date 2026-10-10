// SPDX-License-Identifier: Apache-2.0
/// URL slugs ("Crème brûlée & Café" -> "creme-brulee-cafe") with a fixed transliteration table for U+00C0..U+017F, so
/// every language gives identical results without a Unicode database. Other non-ASCII characters end a word.
library;

// Transliteration of U+00C0..U+017F in order, comma separated; an empty entry (U+00D7, U+00F7) keeps the character.
const _tableSource =
    'A,A,A,A,A,A,AE,C,E,E,E,E,I,I,I,I,D,N,O,O,O,O,O,,O,U,U,U,U,Y,TH,ss,a,a,a,a,a,a,ae,c,e,e,e,e,i,i,i,i,d,n,o,o,o,o,o,,o,u,u,u,u,y,th,y,'
    'A,a,A,a,A,a,C,c,C,c,C,c,C,c,D,d,D,d,E,e,E,e,E,e,E,e,E,e,G,g,G,g,G,g,G,g,H,h,H,h,I,i,I,i,I,i,I,i,I,i,IJ,ij,J,j,K,k,q,L,l,L,l,L,l,L,l,L,l,'
    'N,n,N,n,N,n,n,N,n,O,o,O,o,O,o,OE,oe,R,r,R,r,R,r,S,s,S,s,S,s,S,s,T,t,T,t,T,t,U,u,U,u,U,u,U,u,U,u,U,u,W,w,Y,y,Y,Z,z,Z,z,Z,z,s';
final List<String> _table = _tableSource.split(',');

/// Lowercase ASCII words joined by [separator] (`-`, `_` or `.`). Apostrophes (U+0027, U+2019) and combining marks
/// (U+0300..U+036F) do not break a word. When [maxLength] > 0 the slug is cut at a word boundary where possible (a
/// single long word is cut inside). Throws [ArgumentError] for a bad separator or a negative maxLength.
String slugify(String text, {String separator = '-', int maxLength = 0}) {
  if (separator != '-' && separator != '_' && separator != '.') {
    throw ArgumentError.value(separator, 'separator', 'must be "-", "_" or "."');
  }
  if (maxLength < 0) throw ArgumentError.value(maxLength, 'maxLength', 'must not be negative');
  final words = <String>[];
  final cur = StringBuffer();
  void feed(int cp) {
    if (cp >= 0x41 && cp <= 0x5A) {
      cur.writeCharCode(cp + 32);
    } else if ((cp >= 0x61 && cp <= 0x7A) || (cp >= 0x30 && cp <= 0x39)) {
      cur.writeCharCode(cp);
    } else if (cp == 0x27 || cp == 0x2019 || (cp >= 0x300 && cp <= 0x36F)) {
      return;
    } else if (cur.isNotEmpty) {
      words.add(cur.toString());
      cur.clear();
    }
  }

  for (final cp in text.runes) {
    final mapped = cp >= 0xC0 && cp <= 0x17F ? _table[cp - 0xC0] : '';
    if (mapped.isEmpty) {
      feed(cp);
    } else {
      mapped.codeUnits.forEach(feed);
    }
  }
  if (cur.isNotEmpty) words.add(cur.toString());
  var slug = words.join(separator);
  if (maxLength > 0 && slug.length > maxLength) {
    var cut = slug.substring(0, maxLength);
    if (slug[maxLength] != separator && cut.contains(separator)) cut = cut.substring(0, cut.lastIndexOf(separator));
    while (cut.endsWith(separator)) {
      cut = cut.substring(0, cut.length - 1);
    }
    slug = cut;
  }
  return slug;
}

/// [base] when it is not in [taken], else the first free of base-2, base-3, ... (joined with [separator]). Throws
/// [ArgumentError] for an empty base.
String uniqueSlug(String base, Set<String> taken, {String separator = '-'}) {
  if (base.isEmpty) throw ArgumentError.value(base, 'base', 'must not be empty');
  if (!taken.contains(base)) return base;
  var n = 2;
  while (taken.contains('$base$separator$n')) {
    n++;
  }
  return '$base$separator$n';
}
