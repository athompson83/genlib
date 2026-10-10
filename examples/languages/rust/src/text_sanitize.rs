// SPDX-License-Identifier: Apache-2.0

//! Cleans untrusted display text: normalizes line endings and removes control
//! characters, bidirectional controls (the Trojan Source attack,
//! CVE-2021-42574) and invisible zero-width characters, while keeping
//! ZWNJ/ZWJ (U+200C/U+200D) that emoji sequences and Indic or Persian text
//! need. Not HTML escaping; escape for the output context too.

fn is_bidi(c: char) -> bool {
    matches!(c, '\u{061C}' | '\u{200E}' | '\u{200F}' | '\u{202A}'..='\u{202E}' | '\u{2066}'..='\u{2069}')
}

fn is_control(c: char) -> bool {
    c < '\u{20}' || ('\u{7F}'..='\u{9F}').contains(&c)
}

/// Converts CRLF and lone CR to LF, keeps LF (or a space when
/// `allow_newlines` is false) and TAB, removes other C0/C1 controls, DEL,
/// bidirectional controls and U+200B, U+2060, U+FEFF, then truncates to
/// `max_length` code points.
pub fn sanitize_text(text: &str, allow_newlines: bool, max_length: Option<usize>) -> String {
    let normalized = text.replace("\r\n", "\n").replace('\r', "\n");
    normalized
        .chars()
        .filter_map(|c| match c {
            '\n' if !allow_newlines => Some(' '),
            '\n' | '\t' => Some(c),
            '\u{200B}' | '\u{2060}' | '\u{FEFF}' => None,
            c if is_control(c) || is_bidi(c) => None,
            c => Some(c),
        })
        .take(max_length.unwrap_or(usize::MAX))
        .collect()
}

/// Bidirectional controls as (code point index, uppercase hex such as
/// "202E"), for rejecting or flagging misleading source or identifiers.
pub fn find_bidi_controls(text: &str) -> Vec<(usize, String)> {
    text.chars().enumerate().filter(|&(_, c)| is_bidi(c)).map(|(i, c)| (i, format!("{:04X}", c as u32))).collect()
}

/// Collapses runs of space, tab, LF, CR, FF and VT into one space and trims.
pub fn normalize_whitespace(text: &str) -> String {
    text.split([' ', '\t', '\n', '\r', '\u{0C}', '\u{0B}']).filter(|s| !s.is_empty()).collect::<Vec<_>>().join(" ")
}

#[cfg(test)]
mod tests {
    use super::*;

    const TROJAN: &str = "if (accessLevel != \"user\u{202E} \u{2066}// Check if admin\u{2069} \u{2066}\") {";
    const EMOJI: &str = "emoji \u{1F44D}\u{1F3FD} and ZWJ \u{1F468}\u{200D}\u{1F469}\u{200D}\u{1F467} family";

    #[test]
    fn sanitize() {
        for (text, allow, max, want) in [
            ("plain text", true, None, "plain text"),
            ("line1\r\nline2\rline3", true, None, "line1\nline2\nline3"),
            ("zero\u{200B}width\u{FEFF}bom", true, None, "zerowidthbom"),
            ("tab\there\u{0}nul\u{7F}del\u{85}nel", true, None, "tab\therenuldelnel"),
            (TROJAN, true, None, "if (accessLevel != \"user // Check if admin \") {"),
            (EMOJI, true, None, EMOJI),
            ("caf\u{E9} e\u{301}", true, None, "caf\u{E9} e\u{301}"),
            ("a\nb\r\nc", false, None, "a b c"),
            ("abcdef", true, Some(3), "abc"),
            ("\u{1F600}\u{1F600}\u{1F600}", true, Some(2), "\u{1F600}\u{1F600}"),
        ] {
            assert_eq!(sanitize_text(text, allow, max), want, "{text:?}");
        }
    }

    #[test]
    fn bidi() {
        for s in ["plain text", "line1\r\nline2\rline3", "zero\u{200B}width\u{FEFF}bom", "tab\there\u{0}nul\u{7F}del\u{85}nel", EMOJI, "caf\u{E9} e\u{301}"] {
            assert!(find_bidi_controls(s).is_empty(), "{s:?}");
        }
        let want: Vec<(usize, String)> = [(24, "202E"), (26, "2066"), (44, "2069"), (46, "2066")].iter().map(|&(i, h)| (i, h.to_string())).collect();
        assert_eq!(find_bidi_controls(TROJAN), want);
    }

    #[test]
    fn whitespace() {
        for (s, want) in [("  a   b\t\tc\n\nd  ", "a b c d"), ("", ""), (" \t\n ", ""), ("one", "one")] {
            assert_eq!(normalize_whitespace(s), want, "{s:?}");
        }
    }
}
