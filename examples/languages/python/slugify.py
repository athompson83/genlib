# SPDX-License-Identifier: Apache-2.0
"""URL slugs with a fixed transliteration table, identical in every Genlib language.

slugify works on code points: Latin-1 Supplement and Latin Extended-A letters (U+00C0..U+017F) are
transliterated through a fixed table (no Unicode database), ASCII letters are lowercased, ASCII
letters and digits form words, apostrophes (U+0027, U+2019) and combining marks (U+0300..U+036F)
are dropped without splitting a word, and every other character ends the current word. Words are
joined with the separator ("-", "_" or "."). Text in other scripts is dropped, so the slug can be
empty: supply your own fallback. unique_slug is only a pre-check; enforce a database unique
constraint and retry on conflict.
"""

# Transliterations of U+00C0..U+017F in order; an empty entry (U+00D7, U+00F7) has none.
_TABLE_TEXT = (
    "A|A|A|A|A|A|AE|C|E|E|E|E|I|I|I|I|D|N|O|O|O|O|O||O|U|U|U|U|Y|TH|ss|a|a|a|a|a|a|ae|c|e|e|e|e|"
    "i|i|i|i|d|n|o|o|o|o|o||o|u|u|u|u|y|th|y|A|a|A|a|A|a|C|c|C|c|C|c|C|c|D|d|D|d|E|e|E|e|E|e|E|e|"
    "E|e|G|g|G|g|G|g|G|g|H|h|H|h|I|i|I|i|I|i|I|i|I|i|IJ|ij|J|j|K|k|q|L|l|L|l|L|l|L|l|L|l|N|n|N|n|"
    "N|n|n|N|n|O|o|O|o|O|o|OE|oe|R|r|R|r|R|r|S|s|S|s|S|s|S|s|T|t|T|t|T|t|U|u|U|u|U|u|U|u|U|u|U|u|"
    "W|w|Y|y|Y|Z|z|Z|z|Z|z|s"
)
TABLE = {chr(0xC0 + k): v for k, v in enumerate(_TABLE_TEXT.split("|")) if v}
SEPARATORS = ("-", "_", ".")


def slugify(text: str, separator: str = "-", max_length: int = 0) -> str:
    """Lowercase ASCII slug; max_length 0 means no limit, otherwise cut at a separator if possible."""
    if separator not in SEPARATORS:
        raise ValueError('separator must be "-", "_" or "."')
    if isinstance(max_length, bool) or not isinstance(max_length, int) or max_length < 0:
        raise ValueError("max_length must be a non-negative integer")
    words, current = [], []
    for c in text:
        for ch in TABLE.get(c, c):
            if "A" <= ch <= "Z":
                ch = ch.lower()
            if "a" <= ch <= "z" or "0" <= ch <= "9":
                current.append(ch)
            elif ch in "'’" or "̀" <= ch <= "ͯ":
                continue
            elif current:
                words.append("".join(current))
                current = []
    if current:
        words.append("".join(current))
    slug = separator.join(words)
    if max_length and len(slug) > max_length:
        cut = slug[:max_length]
        if slug[max_length] != separator and separator in cut:
            cut = cut[:cut.rindex(separator)]
        slug = cut.rstrip(separator)
    return slug


def unique_slug(base: str, taken, separator: str = "-") -> str:
    """base, or base-2, base-3, ...: the first one not in taken (a set of existing slugs)."""
    if not base:
        raise ValueError("base must not be empty")
    if base not in taken:
        return base
    n = 2
    while f"{base}{separator}{n}" in taken:
        n += 1
    return f"{base}{separator}{n}"
