// SPDX-License-Identifier: Apache-2.0

//! Text chunking for retrieval (RAG): split at the largest natural boundary
//! that fits (paragraphs, lines, sentences, spaces, then single code points),
//! pack pieces greedily and optionally overlap whole pieces. Lengths count
//! Unicode code points (`char`s); whitespace means ASCII space, tab, LF, CR,
//! FF and VT only.

use std::fmt;

/// Invalid `max_chars` or `overlap`.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ChunkError(pub String);

impl fmt::Display for ChunkError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(&self.0)
    }
}

impl std::error::Error for ChunkError {}

fn is_ws(c: char) -> bool {
    matches!(c, ' ' | '\t' | '\n' | '\r' | '\u{0C}' | '\u{0B}')
}

fn starts_at(t: &[char], i: usize, sep: &[char]) -> bool {
    i + sep.len() <= t.len() && &t[i..i + sep.len()] == sep
}

/// Pieces at one boundary level; each keeps its trailing separator.
fn split_keep(t: &[char], level: u8) -> Vec<&[char]> {
    let mut out = Vec::new();
    let mut start = 0;
    match level {
        0 | 1 | 3 => {
            let sep: &[char] = match level {
                0 => &['\n', '\n'],
                1 => &['\n'],
                _ => &[' '],
            };
            let mut i = 0;
            while i < t.len() {
                if !starts_at(t, i, sep) {
                    i += 1;
                    continue;
                }
                let mut j = i + sep.len();
                while starts_at(t, j, sep) {
                    j += sep.len();
                }
                out.push(&t[start..j]);
                start = j;
                i = j;
            }
        }
        2 => {
            let mut i = 0;
            while i < t.len() {
                if matches!(t[i], '.' | '!' | '?') && i + 1 < t.len() && is_ws(t[i + 1]) {
                    let mut j = i + 1;
                    while j < t.len() && is_ws(t[j]) {
                        j += 1;
                    }
                    out.push(&t[start..j]);
                    start = j;
                    i = j;
                    continue;
                }
                i += 1;
            }
        }
        _ => return t.chunks(1).collect(),
    }
    if start < t.len() {
        out.push(&t[start..]);
    }
    out
}

fn pieces(t: &[char], max_chars: usize, level: u8) -> Vec<&[char]> {
    if t.len() <= max_chars {
        return vec![t];
    }
    let mut out = Vec::new();
    for p in split_keep(t, level) {
        if p.len() <= max_chars {
            out.push(p);
        } else {
            out.extend(pieces(p, max_chars, level + 1));
        }
    }
    out
}

/// Chunks of at most `max_chars` code points, trimmed and never empty; `overlap` > 0 starts each chunk with the last whole pieces of the previous one totalling at most `overlap`.
pub fn chunk_text(text: &str, max_chars: usize, overlap: usize) -> Result<Vec<String>, ChunkError> {
    if max_chars < 1 {
        return Err(ChunkError("max_chars must be >= 1".into()));
    }
    if overlap >= max_chars {
        return Err(ChunkError("overlap must be in 0..max_chars-1".into()));
    }
    let chars: Vec<char> = text.chars().collect();
    let mut chunks = Vec::new();
    let emit = |cur: &[&[char]], chunks: &mut Vec<String>| {
        let s: String = cur.iter().flat_map(|p| p.iter()).collect();
        let s = s.trim_matches(is_ws);
        if !s.is_empty() {
            chunks.push(s.to_string());
        }
    };
    let mut cur: Vec<&[char]> = Vec::new();
    let mut size = 0;
    for p in pieces(&chars, max_chars, 0) {
        if !cur.is_empty() && size + p.len() > max_chars {
            emit(&cur, &mut chunks);
            let mut keep: Vec<&[char]> = Vec::new();
            let mut total = 0;
            if overlap > 0 {
                // never repeat the whole previous chunk
                for q in cur[1..].iter().rev() {
                    if total + q.len() > overlap {
                        break;
                    }
                    keep.insert(0, q);
                    total += q.len();
                }
            }
            while !keep.is_empty() && total + p.len() > max_chars {
                total -= keep.remove(0).len();
            }
            cur = keep;
            size = total;
        }
        cur.push(p);
        size += p.len();
    }
    if !cur.is_empty() {
        emit(&cur, &mut chunks);
    }
    Ok(chunks)
}

#[cfg(test)]
#[allow(clippy::type_complexity, clippy::approx_constant)] // generated vector tables
mod tests {
    use super::*;

    #[test]
    fn vectors() {
        let cases: &[(&str, usize, usize, &[&str])] = &[
            ("First paragraph. It has two sentences.\n\nSecond paragraph is a bit longer and keeps going. Another sentence here! And a question?\n\nThird.", 60, 0, &["First paragraph. It has two sentences.", "Second paragraph is a bit longer and keeps going.", "Another sentence here! And a question?\n\nThird."]),
            ("First paragraph. It has two sentences.\n\nSecond paragraph is a bit longer and keeps going. Another sentence here! And a question?\n\nThird.", 40, 15, &["First paragraph. It has two sentences.", "Second paragraph is a bit longer and", "bit longer and keeps going.", "keeps going. Another sentence here!", "And a question?\n\nThird."]),
            ("First paragraph. It has two sentences.\n\nSecond paragraph is a bit longer and keeps going. Another sentence here! And a question?\n\nThird.", 10, 0, &["First para", "graph. It", "has two se", "ntences.", "Second", "paragraph", "is a bit", "longer", "and keeps", "going.", "Another", "sentence", "here! And", "a question", "?\n\nThird."]),
            ("First paragraph. It has two sentences.\n\nSecond paragraph is a bit longer and keeps going. Another sentence here! And a question?\n\nThird.", 10, 4, &["First para", "paragraph.", "aph. It", "It has", "has two se", "sentences.", "ces.", ".\n\nSecond", "paragraph", "is a bit", "longer", "and keeps", "going.", "Another", "sentence", "here! And", "And a ques", "question?", "on?", "n?\n\nThird."]),
            ("First paragraph. It has two sentences.\n\nSecond paragraph is a bit longer and keeps going. Another sentence here! And a question?\n\nThird.", 4, 0, &["Firs", "t pa", "ragr", "aph.", "It", "has", "two", "sent", "ence", "s.", "Seco", "nd p", "arag", "raph", "is", "a", "bit", "long", "er", "and", "keep", "s go", "ing.", "Ano", "ther", "sen", "tenc", "e he", "re!", "And", "a qu", "esti", "on?", "Thi", "rd."]),
            ("First paragraph. It has two sentences.\n\nSecond paragraph is a bit longer and keeps going. Another sentence here! And a question?\n\nThird.", 9, 4, &["First par", "paragraph", "raph. It", "It has", "has two s", "sentences", "nces.", "Second", "paragraph", "raph is", "is a", "a bit", "longer", "and", "keeps", "going.", "Another", "sentence", "here!", "And a que", "question?", "ion?", "?\n\nThird."]),
            ("First paragraph. It has two sentences.\n\nSecond paragraph is a bit longer and keeps going. Another sentence here! And a question?\n\nThird.", 1, 0, &["F", "i", "r", "s", "t", "p", "a", "r", "a", "g", "r", "a", "p", "h", ".", "I", "t", "h", "a", "s", "t", "w", "o", "s", "e", "n", "t", "e", "n", "c", "e", "s", ".", "S", "e", "c", "o", "n", "d", "p", "a", "r", "a", "g", "r", "a", "p", "h", "i", "s", "a", "b", "i", "t", "l", "o", "n", "g", "e", "r", "a", "n", "d", "k", "e", "e", "p", "s", "g", "o", "i", "n", "g", ".", "A", "n", "o", "t", "h", "e", "r", "s", "e", "n", "t", "e", "n", "c", "e", "h", "e", "r", "e", "!", "A", "n", "d", "a", "q", "u", "e", "s", "t", "i", "o", "n", "?", "T", "h", "i", "r", "d", "."]),
            ("First paragraph. It has two sentences.\n\nSecond paragraph is a bit longer and keeps going. Another sentence here! And a question?\n\nThird.", 200, 50, &["First paragraph. It has two sentences.\n\nSecond paragraph is a bit longer and keeps going. Another sentence here! And a question?\n\nThird."]),
            ("abcdefghij", 60, 0, &["abcdefghij"]),
            ("abcdefghij", 40, 15, &["abcdefghij"]),
            ("abcdefghij", 10, 0, &["abcdefghij"]),
            ("abcdefghij", 10, 4, &["abcdefghij"]),
            ("abcdefghij", 4, 0, &["abcd", "efgh", "ij"]),
            ("abcdefghij", 9, 4, &["abcdefghi", "fghij"]),
            ("abcdefghij", 1, 0, &["a", "b", "c", "d", "e", "f", "g", "h", "i", "j"]),
            ("abcdefghij", 200, 50, &["abcdefghij"]),
            ("one two three four five", 60, 0, &["one two three four five"]),
            ("one two three four five", 40, 15, &["one two three four five"]),
            ("one two three four five", 10, 0, &["one two", "three", "four five"]),
            ("one two three four five", 10, 4, &["one two", "two three", "four five"]),
            ("one two three four five", 4, 0, &["one", "two", "thre", "e fo", "ur", "five"]),
            ("one two three four five", 9, 4, &["one two", "three", "four five"]),
            ("one two three four five", 1, 0, &["o", "n", "e", "t", "w", "o", "t", "h", "r", "e", "e", "f", "o", "u", "r", "f", "i", "v", "e"]),
            ("one two three four five", 200, 50, &["one two three four five"]),
            ("A. B. C.", 60, 0, &["A. B. C."]),
            ("A. B. C.", 40, 15, &["A. B. C."]),
            ("A. B. C.", 10, 0, &["A. B. C."]),
            ("A. B. C.", 10, 4, &["A. B. C."]),
            ("A. B. C.", 4, 0, &["A.", "B.", "C."]),
            ("A. B. C.", 9, 4, &["A. B. C."]),
            ("A. B. C.", 1, 0, &["A", ".", "B", ".", "C", "."]),
            ("A. B. C.", 200, 50, &["A. B. C."]),
            ("  \n\n  ", 60, 0, &[]),
            ("  \n\n  ", 40, 15, &[]),
            ("  \n\n  ", 10, 0, &[]),
            ("  \n\n  ", 10, 4, &[]),
            ("  \n\n  ", 4, 0, &[]),
            ("  \n\n  ", 9, 4, &[]),
            ("  \n\n  ", 1, 0, &[]),
            ("  \n\n  ", 200, 50, &[]),
            ("", 60, 0, &[]),
            ("", 40, 15, &[]),
            ("", 10, 0, &[]),
            ("", 10, 4, &[]),
            ("", 4, 0, &[]),
            ("", 9, 4, &[]),
            ("", 1, 0, &[]),
            ("", 200, 50, &[]),
            ("Line one\nLine two\nLine three\nLine four", 60, 0, &["Line one\nLine two\nLine three\nLine four"]),
            ("Line one\nLine two\nLine three\nLine four", 40, 15, &["Line one\nLine two\nLine three\nLine four"]),
            ("Line one\nLine two\nLine three\nLine four", 10, 0, &["Line one", "Line two", "Line", "three", "Line four"]),
            ("Line one\nLine two\nLine three\nLine four", 10, 4, &["Line one", "Line two", "Line", "three", "Line four"]),
            ("Line one\nLine two\nLine three\nLine four", 4, 0, &["Line", "one", "Line", "two", "Line", "thr", "ee\nL", "ine", "four"]),
            ("Line one\nLine two\nLine three\nLine four", 9, 4, &["Line one", "Line two", "Line", "three", "Line four"]),
            ("Line one\nLine two\nLine three\nLine four", 1, 0, &["L", "i", "n", "e", "o", "n", "e", "L", "i", "n", "e", "t", "w", "o", "L", "i", "n", "e", "t", "h", "r", "e", "e", "L", "i", "n", "e", "f", "o", "u", "r"]),
            ("Line one\nLine two\nLine three\nLine four", 200, 50, &["Line one\nLine two\nLine three\nLine four"]),
            ("Short.", 60, 0, &["Short."]),
            ("Short.", 40, 15, &["Short."]),
            ("Short.", 10, 0, &["Short."]),
            ("Short.", 10, 4, &["Short."]),
            ("Short.", 4, 0, &["Shor", "t."]),
            ("Short.", 9, 4, &["Short."]),
            ("Short.", 1, 0, &["S", "h", "o", "r", "t", "."]),
            ("Short.", 200, 50, &["Short."]),
            ("Caf\u{e9} na\u{ef}ve r\u{e9}sum\u{e9} \u{2014} \u{65e5}\u{672c}\u{8a9e}\u{306e}\u{30c6}\u{30ad}\u{30b9}\u{30c8}\u{3002} End.", 60, 0, &["Caf\u{e9} na\u{ef}ve r\u{e9}sum\u{e9} \u{2014} \u{65e5}\u{672c}\u{8a9e}\u{306e}\u{30c6}\u{30ad}\u{30b9}\u{30c8}\u{3002} End."]),
            ("Caf\u{e9} na\u{ef}ve r\u{e9}sum\u{e9} \u{2014} \u{65e5}\u{672c}\u{8a9e}\u{306e}\u{30c6}\u{30ad}\u{30b9}\u{30c8}\u{3002} End.", 40, 15, &["Caf\u{e9} na\u{ef}ve r\u{e9}sum\u{e9} \u{2014} \u{65e5}\u{672c}\u{8a9e}\u{306e}\u{30c6}\u{30ad}\u{30b9}\u{30c8}\u{3002} End."]),
            ("Caf\u{e9} na\u{ef}ve r\u{e9}sum\u{e9} \u{2014} \u{65e5}\u{672c}\u{8a9e}\u{306e}\u{30c6}\u{30ad}\u{30b9}\u{30c8}\u{3002} End.", 10, 0, &["Caf\u{e9}", "na\u{ef}ve", "r\u{e9}sum\u{e9} \u{2014}", "\u{65e5}\u{672c}\u{8a9e}\u{306e}\u{30c6}\u{30ad}\u{30b9}\u{30c8}\u{3002}", "End."]),
            ("Caf\u{e9} na\u{ef}ve r\u{e9}sum\u{e9} \u{2014} \u{65e5}\u{672c}\u{8a9e}\u{306e}\u{30c6}\u{30ad}\u{30b9}\u{30c8}\u{3002} End.", 10, 4, &["Caf\u{e9}", "na\u{ef}ve", "r\u{e9}sum\u{e9} \u{2014}", "\u{65e5}\u{672c}\u{8a9e}\u{306e}\u{30c6}\u{30ad}\u{30b9}\u{30c8}\u{3002}", "End."]),
            ("Caf\u{e9} na\u{ef}ve r\u{e9}sum\u{e9} \u{2014} \u{65e5}\u{672c}\u{8a9e}\u{306e}\u{30c6}\u{30ad}\u{30b9}\u{30c8}\u{3002} End.", 4, 0, &["Caf\u{e9}", "na\u{ef}", "ve r", "\u{e9}sum", "\u{e9} \u{2014}", "\u{65e5}\u{672c}\u{8a9e}\u{306e}", "\u{30c6}\u{30ad}\u{30b9}\u{30c8}", "\u{3002}", "End."]),
            ("Caf\u{e9} na\u{ef}ve r\u{e9}sum\u{e9} \u{2014} \u{65e5}\u{672c}\u{8a9e}\u{306e}\u{30c6}\u{30ad}\u{30b9}\u{30c8}\u{3002} End.", 9, 4, &["Caf\u{e9}", "na\u{ef}ve", "r\u{e9}sum\u{e9} \u{2014}", "\u{2014} \u{65e5}\u{672c}\u{8a9e}\u{306e}\u{30c6}\u{30ad}\u{30b9}", "\u{306e}\u{30c6}\u{30ad}\u{30b9}\u{30c8}\u{3002}", "\u{30b9}\u{30c8}\u{3002} End."]),
            ("Caf\u{e9} na\u{ef}ve r\u{e9}sum\u{e9} \u{2014} \u{65e5}\u{672c}\u{8a9e}\u{306e}\u{30c6}\u{30ad}\u{30b9}\u{30c8}\u{3002} End.", 1, 0, &["C", "a", "f", "\u{e9}", "n", "a", "\u{ef}", "v", "e", "r", "\u{e9}", "s", "u", "m", "\u{e9}", "\u{2014}", "\u{65e5}", "\u{672c}", "\u{8a9e}", "\u{306e}", "\u{30c6}", "\u{30ad}", "\u{30b9}", "\u{30c8}", "\u{3002}", "E", "n", "d", "."]),
            ("Caf\u{e9} na\u{ef}ve r\u{e9}sum\u{e9} \u{2014} \u{65e5}\u{672c}\u{8a9e}\u{306e}\u{30c6}\u{30ad}\u{30b9}\u{30c8}\u{3002} End.", 200, 50, &["Caf\u{e9} na\u{ef}ve r\u{e9}sum\u{e9} \u{2014} \u{65e5}\u{672c}\u{8a9e}\u{306e}\u{30c6}\u{30ad}\u{30b9}\u{30c8}\u{3002} End."]),
            ("xxxxxxxxxxxxxxxxxxxxxxxxx yyyyy", 60, 0, &["xxxxxxxxxxxxxxxxxxxxxxxxx yyyyy"]),
            ("xxxxxxxxxxxxxxxxxxxxxxxxx yyyyy", 40, 15, &["xxxxxxxxxxxxxxxxxxxxxxxxx yyyyy"]),
            ("xxxxxxxxxxxxxxxxxxxxxxxxx yyyyy", 10, 0, &["xxxxxxxxxx", "xxxxxxxxxx", "xxxxx", "yyyyy"]),
            ("xxxxxxxxxxxxxxxxxxxxxxxxx yyyyy", 10, 4, &["xxxxxxxxxx", "xxxxxxxxxx", "xxxxxxxxxx", "xxxxxxx", "xxx yyyyy"]),
            ("xxxxxxxxxxxxxxxxxxxxxxxxx yyyyy", 4, 0, &["xxxx", "xxxx", "xxxx", "xxxx", "xxxx", "xxxx", "x yy", "yyy"]),
            ("xxxxxxxxxxxxxxxxxxxxxxxxx yyyyy", 9, 4, &["xxxxxxxxx", "xxxxxxxxx", "xxxxxxxxx", "xxxxxxxxx", "xxxxx", "xxx yyyyy"]),
            ("xxxxxxxxxxxxxxxxxxxxxxxxx yyyyy", 1, 0, &["x", "x", "x", "x", "x", "x", "x", "x", "x", "x", "x", "x", "x", "x", "x", "x", "x", "x", "x", "x", "x", "x", "x", "x", "x", "y", "y", "y", "y", "y"]),
            ("xxxxxxxxxxxxxxxxxxxxxxxxx yyyyy", 200, 50, &["xxxxxxxxxxxxxxxxxxxxxxxxx yyyyy"]),
            ("Mr. Smith went. Then? Yes! Done.", 60, 0, &["Mr. Smith went. Then? Yes! Done."]),
            ("Mr. Smith went. Then? Yes! Done.", 40, 15, &["Mr. Smith went. Then? Yes! Done."]),
            ("Mr. Smith went. Then? Yes! Done.", 10, 0, &["Mr. Smith", "went.", "Then?", "Yes! Done."]),
            ("Mr. Smith went. Then? Yes! Done.", 10, 4, &["Mr. Smith", "went.", "Then?", "Yes! Done."]),
            ("Mr. Smith went. Then? Yes! Done.", 4, 0, &["Mr.", "Smit", "h we", "nt.", "Then", "? Ye", "s! D", "one."]),
            ("Mr. Smith went. Then? Yes! Done.", 9, 4, &["Mr.", "Smith", "went.", "Then?", "Yes!", "Done."]),
            ("Mr. Smith went. Then? Yes! Done.", 1, 0, &["M", "r", ".", "S", "m", "i", "t", "h", "w", "e", "n", "t", ".", "T", "h", "e", "n", "?", "Y", "e", "s", "!", "D", "o", "n", "e", "."]),
            ("Mr. Smith went. Then? Yes! Done.", 200, 50, &["Mr. Smith went. Then? Yes! Done."]),
        ];
        for (i, &(text, max, overlap, want)) in cases.iter().enumerate() {
            assert_eq!(chunk_text(text, max, overlap).unwrap(), want, "case {i}");
        }
    }

    #[test]
    fn invalid() {
        // Negative max_chars/overlap vectors are unrepresentable with usize.
        assert!(chunk_text("x", 0, 0).is_err());
        assert!(chunk_text("x", 5, 5).is_err());
    }
}
