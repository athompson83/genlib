// SPDX-License-Identifier: Apache-2.0

//! Plain-text wrapping and truncation, counting code points.
//!
//! [`wrap_text`] keeps input line breaks (CRLF and CR become LF), splits each
//! line on runs of spaces and tabs, fills lines greedily and breaks words
//! longer than the width into width-sized chunks. [`truncate_text`] prefers to
//! cut at a space in the second half of the kept text before adding the
//! ellipsis.

use std::fmt;

/// A width or maximum length that cannot be honored.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct WrapError(pub String);

impl fmt::Display for WrapError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "text wrap: {}", self.0)
    }
}

impl std::error::Error for WrapError {}

/// Wraps `text` to lines of at most `width` code points.
pub fn wrap_text(text: &str, width: usize) -> Result<String, WrapError> {
    if width < 1 {
        return Err(WrapError("width must be >= 1".into()));
    }
    let text = text.replace("\r\n", "\n").replace('\r', "\n");
    let mut out: Vec<String> = Vec::new();
    for line in text.split('\n') {
        let mut cur: Vec<char> = Vec::new();
        for word in line.split([' ', '\t']).filter(|w| !w.is_empty()) {
            let mut w: Vec<char> = word.chars().collect();
            while w.len() > width {
                if !cur.is_empty() {
                    out.push(cur.drain(..).collect());
                }
                out.push(w[..width].iter().collect());
                w.drain(..width);
            }
            if w.is_empty() {
                continue;
            }
            if cur.is_empty() {
                cur = w;
            } else if cur.len() + 1 + w.len() <= width {
                cur.push(' ');
                cur.extend(w);
            } else {
                out.push(cur.iter().collect());
                cur = w;
            }
        }
        out.push(cur.into_iter().collect());
    }
    Ok(out.join("\n"))
}

/// Shortens `text` to at most `max_len` code points including `ellipsis`.
pub fn truncate_text(text: &str, max_len: usize, ellipsis: &str) -> Result<String, WrapError> {
    let r: Vec<char> = text.chars().collect();
    if r.len() <= max_len {
        return Ok(text.to_string());
    }
    let el = ellipsis.chars().count();
    if max_len < 1 || el > max_len {
        return Err(WrapError(
            "max_len must be >= 1 and fit the ellipsis".into(),
        ));
    }
    let keep = max_len - el;
    let mut cut = &r[..keep];
    if let Some(sp) = cut.iter().rposition(|&c| c == ' ') {
        if sp >= keep / 2 && sp > 0 {
            cut = &cut[..sp];
        }
    }
    let s: String = cut.iter().collect();
    Ok(format!("{}{ellipsis}", s.trim_end_matches(' ')))
}

#[cfg(test)]
mod tests {
    // Generated from the wave 12 capability vectors; do not edit by hand.
    use super::*;

    #[test]
    fn wrap_vectors() {
        for (text, width, want) in [
            ("The quick brown fox jumps over the lazy dog", 1, "T\nh\ne\nq\nu\ni\nc\nk\nb\nr\no\nw\nn\nf\no\nx\nj\nu\nm\np\ns\no\nv\ne\nr\nt\nh\ne\nl\na\nz\ny\nd\no\ng"),
            ("The quick brown fox jumps over the lazy dog", 5, "The\nquick\nbrown\nfox\njumps\nover\nthe\nlazy\ndog"),
            ("The quick brown fox jumps over the lazy dog", 10, "The quick\nbrown fox\njumps over\nthe lazy\ndog"),
            ("The quick brown fox jumps over the lazy dog", 20, "The quick brown fox\njumps over the lazy\ndog"),
            ("a  b\t\tc", 1, "a\nb\nc"),
            ("a  b\t\tc", 5, "a b c"),
            ("a  b\t\tc", 10, "a b c"),
            ("a  b\t\tc", 20, "a b c"),
            ("supercalifragilisticexpialidocious word", 1, "s\nu\np\ne\nr\nc\na\nl\ni\nf\nr\na\ng\ni\nl\ni\ns\nt\ni\nc\ne\nx\np\ni\na\nl\ni\nd\no\nc\ni\no\nu\ns\nw\no\nr\nd"),
            ("supercalifragilisticexpialidocious word", 5, "super\ncalif\nragil\nistic\nexpia\nlidoc\nious\nword"),
            ("supercalifragilisticexpialidocious word", 10, "supercalif\nragilistic\nexpialidoc\nious word"),
            ("supercalifragilisticexpialidocious word", 20, "supercalifragilistic\nexpialidocious word"),
            ("line one\nline two is longer than ten\n\nend", 1, "l\ni\nn\ne\no\nn\ne\nl\ni\nn\ne\nt\nw\no\ni\ns\nl\no\nn\ng\ne\nr\nt\nh\na\nn\nt\ne\nn\n\ne\nn\nd"),
            ("line one\nline two is longer than ten\n\nend", 5, "line\none\nline\ntwo\nis\nlonge\nr\nthan\nten\n\nend"),
            ("line one\nline two is longer than ten\n\nend", 10, "line one\nline two\nis longer\nthan ten\n\nend"),
            ("line one\nline two is longer than ten\n\nend", 20, "line one\nline two is longer\nthan ten\n\nend"),
            ("caf\u{e9} \u{1f600}\u{1f600}\u{1f600} na\u{ef}ve", 1, "c\na\nf\n\u{e9}\n\u{1f600}\n\u{1f600}\n\u{1f600}\nn\na\n\u{ef}\nv\ne"),
            ("caf\u{e9} \u{1f600}\u{1f600}\u{1f600} na\u{ef}ve", 5, "caf\u{e9}\n\u{1f600}\u{1f600}\u{1f600}\nna\u{ef}ve"),
            ("caf\u{e9} \u{1f600}\u{1f600}\u{1f600} na\u{ef}ve", 10, "caf\u{e9} \u{1f600}\u{1f600}\u{1f600}\nna\u{ef}ve"),
            ("caf\u{e9} \u{1f600}\u{1f600}\u{1f600} na\u{ef}ve", 20, "caf\u{e9} \u{1f600}\u{1f600}\u{1f600} na\u{ef}ve"),
            ("trailing   ", 1, "t\nr\na\ni\nl\ni\nn\ng"),
            ("trailing   ", 5, "trail\ning"),
            ("trailing   ", 10, "trailing"),
            ("trailing   ", 20, "trailing"),
            ("", 1, ""),
            ("", 5, ""),
            ("", 10, ""),
            ("", 20, ""),
            ("crlf\r\nand\rcr", 1, "c\nr\nl\nf\na\nn\nd\nc\nr"),
            ("crlf\r\nand\rcr", 5, "crlf\nand\ncr"),
            ("crlf\r\nand\rcr", 10, "crlf\nand\ncr"),
            ("crlf\r\nand\rcr", 20, "crlf\nand\ncr"),
        ] {
            assert_eq!(wrap_text(text, width).as_deref(), Ok(want), "{text:?} {width}");
        }
        for w in [0_usize] {
            assert!(wrap_text("x", w).is_err());
        }
    }

    #[test]
    fn truncate_vectors() {
        for (text, max_len, ellipsis, want) in [
            (
                "The quick brown fox jumps",
                15,
                "\u{2026}",
                "The quick\u{2026}",
            ),
            (
                "The quick brown fox jumps",
                100,
                "\u{2026}",
                "The quick brown fox jumps",
            ),
            ("Supercalifragilistic", 10, "\u{2026}", "Supercali\u{2026}"),
            ("Hello world", 8, "...", "Hello..."),
            ("Hi there you", 12, "\u{2026}", "Hi there you"),
            ("a b c d e f g", 6, "\u{2026}", "a b\u{2026}"),
            (
                "\u{1f600}\u{1f600}\u{1f600}\u{1f600}",
                3,
                "\u{2026}",
                "\u{1f600}\u{1f600}\u{2026}",
            ),
            ("abc", 3, "...", "abc"),
            ("abcd", 3, "...", "..."),
        ] {
            assert_eq!(
                truncate_text(text, max_len, ellipsis).as_deref(),
                Ok(want),
                "{text:?} {max_len}"
            );
        }
        for (text, max_len, ellipsis) in [("long text", 2, "..."), ("long text", 0, "")] {
            assert!(
                truncate_text(text, max_len, ellipsis).is_err(),
                "{text:?} {max_len}"
            );
        }
    }
}
