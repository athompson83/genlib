// SPDX-License-Identifier: Apache-2.0
// Genlib recipe: URL slugs with a fixed transliteration table, so every Genlib language (Python, Go, Rust,
// Java, Kotlin, C#, Swift, Dart) returns the same slug. Original source; copy and adapt. Works on code points:
// U+00C0..U+017F letters are transliterated through the table below (no Unicode database), ASCII letters are
// lowercased, ASCII letters and digits form words, apostrophes (U+0027, U+2019) and combining marks
// (U+0300..U+036F) are dropped without splitting a word, and anything else ends a word. Other scripts are
// dropped, so the slug can be empty: supply your own fallback. For a Unicode-preserving slug with a fallback
// see slugify.ts.

// Transliterations of U+00C0..U+017F in order; an empty entry (U+00D7, U+00F7) has none.
const TABLE_TEXT =
  "A|A|A|A|A|A|AE|C|E|E|E|E|I|I|I|I|D|N|O|O|O|O|O||O|U|U|U|U|Y|TH|ss|a|a|a|a|a|a|ae|c|e|e|e|e|" +
  "i|i|i|i|d|n|o|o|o|o|o||o|u|u|u|u|y|th|y|A|a|A|a|A|a|C|c|C|c|C|c|C|c|D|d|D|d|E|e|E|e|E|e|E|e|" +
  "E|e|G|g|G|g|G|g|G|g|H|h|H|h|I|i|I|i|I|i|I|i|I|i|IJ|ij|J|j|K|k|q|L|l|L|l|L|l|L|l|L|l|N|n|N|n|" +
  "N|n|n|N|n|O|o|O|o|O|o|OE|oe|R|r|R|r|R|r|S|s|S|s|S|s|S|s|T|t|T|t|T|t|U|u|U|u|U|u|U|u|U|u|U|u|" +
  "W|w|Y|y|Y|Z|z|Z|z|Z|z|s";
const TABLE: readonly string[] = TABLE_TEXT.split("|");
export const SLUG_SEPARATORS: readonly string[] = ["-", "_", "."];

/** The transliteration of one code point from the fixed table, or undefined outside it. */
export function transliterate(codePoint: number): string | undefined {
  const t = codePoint >= 0xc0 && codePoint <= 0x17f ? TABLE[codePoint - 0xc0] : undefined;
  return t === "" ? undefined : t;
}

/** Lowercase ASCII slug; separator "-", "_" or "."; maxLength 0 = no limit, else cut at a separator when possible. */
export function slugify(text: string, separator = "-", maxLength = 0): string {
  if (!SLUG_SEPARATORS.includes(separator)) throw new RangeError('separator must be "-", "_" or "."');
  if (!Number.isInteger(maxLength) || maxLength < 0) throw new RangeError("maxLength must be a non-negative integer");
  const words: string[] = [];
  let current = "";
  for (const c of text) {
    const cp = c.codePointAt(0) ?? 0;
    for (const ch of transliterate(cp) ?? c) {
      const code = ch.codePointAt(0) ?? 0;
      if (code >= 0x41 && code <= 0x5a) current += String.fromCharCode(code + 32);
      else if ((code >= 0x61 && code <= 0x7a) || (code >= 0x30 && code <= 0x39)) current += ch;
      else if (code === 0x27 || code === 0x2019 || (code >= 0x300 && code <= 0x36f)) continue;
      else if (current) { words.push(current); current = ""; }
    }
  }
  if (current) words.push(current);
  let slug = words.join(separator);
  if (maxLength > 0 && slug.length > maxLength) {
    let cut = slug.slice(0, maxLength);
    if (slug[maxLength] !== separator && cut.includes(separator)) cut = cut.slice(0, cut.lastIndexOf(separator));
    while (cut.endsWith(separator)) cut = cut.slice(0, -1);
    slug = cut;
  }
  return slug;
}

/**
 * base, or base-2, base-3, ...: the first one not taken. `taken` is a set or a predicate. This is only a
 * pre-check: enforce a database unique constraint and retry on conflict, because two writers can race.
 */
export function uniqueSlug(base: string, taken: ReadonlySet<string> | ((slug: string) => boolean), separator = "-"): string {
  if (base === "") throw new RangeError("base must not be empty");
  const isTaken = typeof taken === "function" ? taken : (s: string): boolean => taken.has(s);
  if (!isTaken(base)) return base;
  let n = 2;
  while (isTaken(`${base}${separator}${n}`)) n++;
  return `${base}${separator}${n}`;
}
