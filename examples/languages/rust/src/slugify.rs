// SPDX-License-Identifier: Apache-2.0

//! URL slugs ("Crème brûlée & Café" -> "creme-brulee-cafe") without a Unicode
//! database: a fixed table transliterates U+00C0..U+017F (Latin-1 Supplement
//! and Latin Extended-A), so every Genlib language gives identical results.
//! Other non-ASCII characters end a word and are dropped.

use std::collections::HashSet;
use std::fmt;

/// Invalid separator or empty base.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct SlugError(pub String);

impl fmt::Display for SlugError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(&self.0)
    }
}

impl std::error::Error for SlugError {}

/// Transliteration of each code point U+00C0..U+017F in order, separated by
/// `|`; an empty entry (U+00D7, U+00F7) has no transliteration.
const TABLE: &str = concat!(
    "A|A|A|A|A|A|AE|C|E|E|E|E|I|I|I|I|D|N|O|O|O|O|O||O|U|U|U|U|Y|TH|ss|",
    "a|a|a|a|a|a|ae|c|e|e|e|e|i|i|i|i|d|n|o|o|o|o|o||o|u|u|u|u|y|th|y|",
    "A|a|A|a|A|a|C|c|C|c|C|c|C|c|D|d|D|d|E|e|E|e|E|e|E|e|E|e|G|g|G|g|G|g|G|g|H|h|H|h|",
    "I|i|I|i|I|i|I|i|I|i|IJ|ij|J|j|K|k|q|L|l|L|l|L|l|L|l|L|l|N|n|N|n|N|n|n|N|n|",
    "O|o|O|o|O|o|OE|oe|R|r|R|r|R|r|S|s|S|s|S|s|S|s|T|t|T|t|T|t|",
    "U|u|U|u|U|u|U|u|U|u|U|u|W|w|Y|y|Y|Z|z|Z|z|Z|z|s"
);

/// The table entry for `c`, if any.
fn transliterate(c: char) -> Option<&'static str> {
    let cp = c as usize;
    if (0xC0..=0x17F).contains(&cp) {
        TABLE.split('|').nth(cp - 0xC0).filter(|t| !t.is_empty())
    } else {
        None
    }
}

/// Lowercases ASCII letters, transliterates U+00C0..U+017F, keeps a-z and
/// 0-9, drops apostrophes (U+0027, U+2019) and combining marks
/// (U+0300..U+036F) inside words, and joins the words with `separator`, which
/// must be `"-"`, `"_"` or `"."`. When `max_length > 0` the slug is cut to at
/// most `max_length` characters, back to a word boundary when the cut splits
/// a word (a single over-long word is cut inside), with no trailing separator.
pub fn slugify(text: &str, separator: &str, max_length: usize) -> Result<String, SlugError> {
    if !matches!(separator, "-" | "_" | ".") {
        return Err(SlugError(r#"separator must be "-", "_" or ".""#.into()));
    }
    let (mut words, mut cur): (Vec<String>, String) = (vec![], String::new());
    let mut buf = [0u8; 4];
    for c in text.chars() {
        let mapped = transliterate(c).unwrap_or_else(|| &*c.encode_utf8(&mut buf));
        for ch in mapped.chars() {
            let lo = ch.to_ascii_lowercase();
            if lo.is_ascii_lowercase() || lo.is_ascii_digit() {
                cur.push(lo);
            } else if ch == '\'' || ch == '\u{2019}' || ('\u{300}'..='\u{36f}').contains(&ch) {
                // apostrophes and combining marks join words
            } else if !cur.is_empty() {
                words.push(std::mem::take(&mut cur));
            }
        }
    }
    if !cur.is_empty() {
        words.push(cur);
    }
    let mut slug = words.join(separator);
    if max_length > 0 && slug.len() > max_length {
        let mut cut = &slug[..max_length];
        if &slug[max_length..max_length + 1] != separator {
            if let Some(k) = cut.rfind(separator) {
                cut = &cut[..k];
            }
        }
        slug = cut.trim_end_matches(separator).to_string();
    }
    Ok(slug)
}

/// `base` when it is not taken, otherwise the first free `base` + separator +
/// `2`, `3`, ...
pub fn unique_slug(base: &str, taken: &HashSet<String>, separator: &str) -> Result<String, SlugError> {
    if base.is_empty() {
        return Err(SlugError("empty base".into()));
    }
    if !taken.contains(base) {
        return Ok(base.to_string());
    }
    (2..).map(|n| format!("{base}{separator}{n}")).find(|s| !taken.contains(s)).ok_or_else(|| SlugError("no free slug".into()))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn cases() {
        for (text, sep, max, want) in CASES {
            assert_eq!(slugify(text, sep, max).as_deref(), Ok(want), "{text:?} {sep:?} {max}");
        }
    }

    #[test]
    fn invalid() {
        for (text, sep, max) in INVALID {
            // A negative max_length cannot be expressed: the parameter is a usize.
            if let Ok(max) = usize::try_from(max) {
                assert!(slugify(text, sep, max).is_err(), "{text:?} {sep:?} {max}");
            }
        }
    }

    #[test]
    fn unique() {
        for (base, taken, want) in UNIQUE {
            let taken: HashSet<String> = taken.iter().map(|s| s.to_string()).collect();
            assert_eq!(unique_slug(base, &taken, "-").as_deref(), Ok(want), "{base:?}");
        }
        assert!(unique_slug("", &HashSet::new(), "-").is_err());
    }

    #[test]
    fn table() {
        assert_eq!(TABLE_VECTORS.len(), 190);
        for cp in 0xC0u32..=0x17F {
            let c = char::from_u32(cp).expect("char");
            let want = TABLE_VECTORS.iter().find(|(k, _)| *k == c).map(|(_, v)| *v);
            assert_eq!(transliterate(c), want, "{c:?}");
        }
    }

    // Test vectors copied verbatim from the shared Genlib capability vectors.
    const CASES: [(&str, &str, usize, &str); 38] = [
        ("Hello, World!", "-", 0, "hello-world"),
        ("Crème brûlée & Café", "-", 0, "creme-brulee-cafe"),
        ("Straße in Łódź", "-", 0, "strasse-in-lodz"),
        ("don't stop", "-", 0, "dont-stop"),
        ("don’t stop", "-", 0, "dont-stop"),
        ("  --Already--slugged--  ", "-", 0, "already-slugged"),
        ("日本語 title 2026", "-", 0, "title-2026"),
        ("Ærøskøbing ŒUVRE", "-", 0, "aeroskobing-oeuvre"),
        ("Crème brûlée", "-", 0, "creme-brulee"),
        ("ÀÁÂÃÄÅ àáâãäå Çç Ññ", "-", 0, "aaaaaa-aaaaaa-cc-nn"),
        ("Ĳssel ŀ ĸ ſ ŉ", "-", 0, "ijssel-l-q-s-n"),
        ("C# and C++", "-", 0, "c-and-c"),
        ("100% pure", "-", 0, "100-pure"),
        ("", "-", 0, ""),
        ("---", "-", 0, ""),
        ("a_b.c-d", "-", 0, "a-b-c-d"),
        ("Emoji 😀 test", "-", 0, "emoji-test"),
        ("Ｆｕｌｌ width", "-", 0, "width"),
        ("ǅemal (outside the table)", "-", 0, "emal-outside-the-table"),
        ("ÿ Ÿ", "-", 0, "y-y"),
        ("MiXeD CaSe 42", "-", 0, "mixed-case-42"),
        ("Hello, World!", "_", 0, "hello_world"),
        ("Hello, World!", ".", 0, "hello.world"),
        ("Crème brûlée & Café", "_", 0, "creme_brulee_cafe"),
        ("Crème brûlée & Café", ".", 0, "creme.brulee.cafe"),
        ("Straße in Łódź", "_", 0, "strasse_in_lodz"),
        ("Straße in Łódź", ".", 0, "strasse.in.lodz"),
        ("don't stop", "_", 0, "dont_stop"),
        ("don't stop", ".", 0, "dont.stop"),
        ("The quick brown fox jumps", "-", 12, "the-quick"),
        ("The quick brown fox jumps", "-", 9, "the-quick"),
        ("The quick brown fox jumps", "-", 10, "the-quick"),
        ("Supercalifragilistic", "-", 5, "super"),
        ("ab cd", "-", 3, "ab"),
        ("ab cd", "-", 2, "ab"),
        ("ab cd", "-", 5, "ab-cd"),
        ("ab cd", "-", 100, "ab-cd"),
        ("a b", "-", 1, "a"),
    ];

    const INVALID: [(&str, &str, i64); 4] = [
        ("x", "/", 0),
        ("x", "", 0),
        ("x", "--", 0),
        ("x", "-", -1),
    ];

    const UNIQUE: [(&str, &[&str], &str); 5] = [
        ("post", &[], "post"),
        ("post", &["post"], "post-2"),
        ("post", &["post", "post-2", "post-3"], "post-4"),
        ("post", &["post-2"], "post"),
        ("a", &["a", "a-2", "a-4"], "a-3"),
    ];

    const TABLE_VECTORS: [(char, &str); 190] = [
        ('\u{c0}', "A"), ('\u{c1}', "A"), ('\u{c2}', "A"), ('\u{c3}', "A"), ('\u{c4}', "A"), ('\u{c5}', "A"), ('\u{c6}', "AE"), ('\u{c7}', "C"),
        ('\u{c8}', "E"), ('\u{c9}', "E"), ('\u{ca}', "E"), ('\u{cb}', "E"), ('\u{cc}', "I"), ('\u{cd}', "I"), ('\u{ce}', "I"), ('\u{cf}', "I"),
        ('\u{d0}', "D"), ('\u{d1}', "N"), ('\u{d2}', "O"), ('\u{d3}', "O"), ('\u{d4}', "O"), ('\u{d5}', "O"), ('\u{d6}', "O"), ('\u{d8}', "O"),
        ('\u{d9}', "U"), ('\u{da}', "U"), ('\u{db}', "U"), ('\u{dc}', "U"), ('\u{dd}', "Y"), ('\u{de}', "TH"), ('\u{df}', "ss"), ('\u{e0}', "a"),
        ('\u{e1}', "a"), ('\u{e2}', "a"), ('\u{e3}', "a"), ('\u{e4}', "a"), ('\u{e5}', "a"), ('\u{e6}', "ae"), ('\u{e7}', "c"), ('\u{e8}', "e"),
        ('\u{e9}', "e"), ('\u{ea}', "e"), ('\u{eb}', "e"), ('\u{ec}', "i"), ('\u{ed}', "i"), ('\u{ee}', "i"), ('\u{ef}', "i"), ('\u{f0}', "d"),
        ('\u{f1}', "n"), ('\u{f2}', "o"), ('\u{f3}', "o"), ('\u{f4}', "o"), ('\u{f5}', "o"), ('\u{f6}', "o"), ('\u{f8}', "o"), ('\u{f9}', "u"),
        ('\u{fa}', "u"), ('\u{fb}', "u"), ('\u{fc}', "u"), ('\u{fd}', "y"), ('\u{fe}', "th"), ('\u{ff}', "y"), ('\u{100}', "A"), ('\u{101}', "a"),
        ('\u{102}', "A"), ('\u{103}', "a"), ('\u{104}', "A"), ('\u{105}', "a"), ('\u{106}', "C"), ('\u{107}', "c"), ('\u{108}', "C"), ('\u{109}', "c"),
        ('\u{10a}', "C"), ('\u{10b}', "c"), ('\u{10c}', "C"), ('\u{10d}', "c"), ('\u{10e}', "D"), ('\u{10f}', "d"), ('\u{110}', "D"), ('\u{111}', "d"),
        ('\u{112}', "E"), ('\u{113}', "e"), ('\u{114}', "E"), ('\u{115}', "e"), ('\u{116}', "E"), ('\u{117}', "e"), ('\u{118}', "E"), ('\u{119}', "e"),
        ('\u{11a}', "E"), ('\u{11b}', "e"), ('\u{11c}', "G"), ('\u{11d}', "g"), ('\u{11e}', "G"), ('\u{11f}', "g"), ('\u{120}', "G"), ('\u{121}', "g"),
        ('\u{122}', "G"), ('\u{123}', "g"), ('\u{124}', "H"), ('\u{125}', "h"), ('\u{126}', "H"), ('\u{127}', "h"), ('\u{128}', "I"), ('\u{129}', "i"),
        ('\u{12a}', "I"), ('\u{12b}', "i"), ('\u{12c}', "I"), ('\u{12d}', "i"), ('\u{12e}', "I"), ('\u{12f}', "i"), ('\u{130}', "I"), ('\u{131}', "i"),
        ('\u{132}', "IJ"), ('\u{133}', "ij"), ('\u{134}', "J"), ('\u{135}', "j"), ('\u{136}', "K"), ('\u{137}', "k"), ('\u{138}', "q"), ('\u{139}', "L"),
        ('\u{13a}', "l"), ('\u{13b}', "L"), ('\u{13c}', "l"), ('\u{13d}', "L"), ('\u{13e}', "l"), ('\u{13f}', "L"), ('\u{140}', "l"), ('\u{141}', "L"),
        ('\u{142}', "l"), ('\u{143}', "N"), ('\u{144}', "n"), ('\u{145}', "N"), ('\u{146}', "n"), ('\u{147}', "N"), ('\u{148}', "n"), ('\u{149}', "n"),
        ('\u{14a}', "N"), ('\u{14b}', "n"), ('\u{14c}', "O"), ('\u{14d}', "o"), ('\u{14e}', "O"), ('\u{14f}', "o"), ('\u{150}', "O"), ('\u{151}', "o"),
        ('\u{152}', "OE"), ('\u{153}', "oe"), ('\u{154}', "R"), ('\u{155}', "r"), ('\u{156}', "R"), ('\u{157}', "r"), ('\u{158}', "R"), ('\u{159}', "r"),
        ('\u{15a}', "S"), ('\u{15b}', "s"), ('\u{15c}', "S"), ('\u{15d}', "s"), ('\u{15e}', "S"), ('\u{15f}', "s"), ('\u{160}', "S"), ('\u{161}', "s"),
        ('\u{162}', "T"), ('\u{163}', "t"), ('\u{164}', "T"), ('\u{165}', "t"), ('\u{166}', "T"), ('\u{167}', "t"), ('\u{168}', "U"), ('\u{169}', "u"),
        ('\u{16a}', "U"), ('\u{16b}', "u"), ('\u{16c}', "U"), ('\u{16d}', "u"), ('\u{16e}', "U"), ('\u{16f}', "u"), ('\u{170}', "U"), ('\u{171}', "u"),
        ('\u{172}', "U"), ('\u{173}', "u"), ('\u{174}', "W"), ('\u{175}', "w"), ('\u{176}', "Y"), ('\u{177}', "y"), ('\u{178}', "Y"), ('\u{179}', "Z"),
        ('\u{17a}', "z"), ('\u{17b}', "Z"), ('\u{17c}', "z"), ('\u{17d}', "Z"), ('\u{17e}', "z"), ('\u{17f}', "s"),
    ];
}
