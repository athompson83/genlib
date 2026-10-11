// SPDX-License-Identifier: Apache-2.0

//! HTML escaping for text and quoted attributes, character-reference
//! decoding and tag stripping for plain-text previews.
//!
//! [`unescape_html`] decodes `&#NNN;` (1-10 decimal digits) and `&#xHHH;`
//! (1-8 hex digits) with a required ';' (0, surrogates and values above
//! U+10FFFF become U+FFFD and 0x80-0x9F map through the HTML5 windows-1252
//! table) plus a fixed set of common named references (case-sensitive, ';'
//! required). Anything else is left as is.

/// Replaces `& < > " '` with `&amp; &lt; &gt; &quot; &#39;`.
pub fn escape_html(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    for c in s.chars() {
        match c {
            '&' => out.push_str("&amp;"),
            '<' => out.push_str("&lt;"),
            '>' => out.push_str("&gt;"),
            '"' => out.push_str("&quot;"),
            '\'' => out.push_str("&#39;"),
            _ => out.push(c),
        }
    }
    out
}

fn named(name: &str) -> Option<&'static str> {
    Some(match name {
        "amp" => "&",
        "lt" => "<",
        "gt" => ">",
        "quot" => "\"",
        "apos" => "'",
        "nbsp" => "\u{a0}",
        "copy" => "\u{a9}",
        "reg" => "\u{ae}",
        "trade" => "\u{2122}",
        "hellip" => "\u{2026}",
        "mdash" => "\u{2014}",
        "ndash" => "\u{2013}",
        "lsquo" => "\u{2018}",
        "rsquo" => "\u{2019}",
        "ldquo" => "\u{201c}",
        "rdquo" => "\u{201d}",
        "bull" => "\u{2022}",
        "middot" => "\u{b7}",
        "deg" => "\u{b0}",
        "plusmn" => "\u{b1}",
        "times" => "\u{d7}",
        "divide" => "\u{f7}",
        "euro" => "\u{20ac}",
        "pound" => "\u{a3}",
        "yen" => "\u{a5}",
        "cent" => "\u{a2}",
        "sect" => "\u{a7}",
        "para" => "\u{b6}",
        "laquo" => "\u{ab}",
        "raquo" => "\u{bb}",
        "iexcl" => "\u{a1}",
        "iquest" => "\u{bf}",
        "shy" => "\u{ad}",
        _ => return None,
    })
}

fn c1(v: u64) -> Option<u32> {
    Some(match v {
        0x80 => 0x20AC,
        0x82 => 0x201A,
        0x83 => 0x0192,
        0x84 => 0x201E,
        0x85 => 0x2026,
        0x86 => 0x2020,
        0x87 => 0x2021,
        0x88 => 0x02C6,
        0x89 => 0x2030,
        0x8A => 0x0160,
        0x8B => 0x2039,
        0x8C => 0x0152,
        0x8E => 0x017D,
        0x91 => 0x2018,
        0x92 => 0x2019,
        0x93 => 0x201C,
        0x94 => 0x201D,
        0x95 => 0x2022,
        0x96 => 0x2013,
        0x97 => 0x2014,
        0x98 => 0x02DC,
        0x99 => 0x2122,
        0x9A => 0x0161,
        0x9B => 0x203A,
        0x9C => 0x0153,
        0x9E => 0x017E,
        0x9F => 0x0178,
        _ => return None,
    })
}

fn numeric(v: u64) -> char {
    if v == 0 || (0xD800..=0xDFFF).contains(&v) || v > 0x10FFFF {
        return '\u{FFFD}';
    }
    let cp = c1(v).unwrap_or(v as u32);
    char::from_u32(cp).unwrap_or('\u{FFFD}')
}

fn run_len(b: &[u8], from: usize, pred: impl Fn(u8) -> bool) -> usize {
    b[from.min(b.len())..]
        .iter()
        .take_while(|&&c| pred(c))
        .count()
}

/// Decodes the reference starting at `b[i] == b'&'`: returns (replacement, bytes consumed).
fn reference(s: &str, i: usize) -> Option<(String, usize)> {
    let b = s.as_bytes();
    let j = i + 1;
    if b.get(j) == Some(&b'#') {
        if matches!(b.get(j + 1), Some(b'x' | b'X')) {
            let n = run_len(b, j + 2, |c| c.is_ascii_hexdigit());
            if (1..=8).contains(&n) && b.get(j + 2 + n) == Some(&b';') {
                let v = u64::from_str_radix(&s[j + 2..j + 2 + n], 16).ok()?;
                return Some((numeric(v).to_string(), n + 4));
            }
        }
        let n = run_len(b, j + 1, |c| c.is_ascii_digit());
        if (1..=10).contains(&n) && b.get(j + 1 + n) == Some(&b';') {
            let v: u64 = s[j + 1..j + 1 + n].parse().ok()?;
            return Some((numeric(v).to_string(), n + 3));
        }
        return None;
    }
    if !b.get(j).is_some_and(|c| c.is_ascii_alphabetic()) {
        return None;
    }
    let n = 1 + run_len(b, j + 1, |c| c.is_ascii_alphanumeric());
    if n <= 32 && b.get(j + n) == Some(&b';') {
        return named(&s[j..j + n]).map(|r| (r.to_string(), n + 2));
    }
    None
}

/// Decodes numeric and the supported named character references.
pub fn unescape_html(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    let mut last = 0;
    let mut i = 0;
    while let Some(off) = s[i..].find('&') {
        let at = i + off;
        match reference(s, at) {
            Some((rep, used)) => {
                out.push_str(&s[last..at]);
                out.push_str(&rep);
                i = at + used;
                last = i;
            }
            None => i = at + 1,
        }
    }
    out.push_str(&s[last..]);
    out
}

/// Python `str.isspace` (Unicode White_Space plus U+001C..U+001F).
fn is_space(c: char) -> bool {
    c.is_whitespace() || ('\u{1c}'..='\u{1f}').contains(&c)
}

fn starts_with_fold(s: &str, i: usize, w: &str) -> bool {
    s.as_bytes()
        .get(i..i + w.len())
        .is_some_and(|p| p.eq_ignore_ascii_case(w.as_bytes()))
}

/// End of `</name\s*>` at `i` (ASCII case-insensitive), if present.
fn close_tag_end(s: &str, i: usize, name: &str) -> Option<usize> {
    if !s[i..].starts_with("</") || !starts_with_fold(s, i + 2, name) {
        return None;
    }
    let j = i + 2 + name.len();
    let k = j + s[j..].find(|c: char| !is_space(c)).unwrap_or(s.len() - j);
    (s.as_bytes().get(k) == Some(&b'>')).then_some(k + 1)
}

/// End of a `<script>`/`<style>` element starting at `i`, up to its close tag or the end of the text.
fn script_element_end(s: &str, i: usize) -> Option<usize> {
    for name in ["script", "style"] {
        if !starts_with_fold(s, i + 1, name) {
            continue;
        }
        let j = i + 1 + name.len();
        if s[j..]
            .chars()
            .next()
            .is_some_and(|c| c == '_' || c.is_alphanumeric())
        {
            continue;
        }
        let Some(gt) = s[j..].find('>') else {
            continue;
        };
        let mut q = j + gt + 1;
        loop {
            if q < s.len() {
                if let Some(e) = close_tag_end(s, q, name) {
                    return Some(e);
                }
            }
            if q == s.len() || (q + 1 == s.len() && s.ends_with('\n')) {
                return Some(q);
            }
            q += s[q..].chars().next().map_or(1, char::len_utf8);
        }
    }
    None
}

/// Drops script/style contents, removes tags and unescapes, for plain-text previews; it is NOT an HTML sanitizer.
pub fn strip_tags(s: &str) -> String {
    let mut dropped = String::with_capacity(s.len());
    let mut i = 0;
    while i < s.len() {
        if s.as_bytes()[i] == b'<' {
            if let Some(e) = script_element_end(s, i) {
                i = e;
                continue;
            }
        }
        let c = s[i..].chars().next().unwrap();
        dropped.push(c);
        i += c.len_utf8();
    }
    let b = dropped.as_bytes();
    let mut out = String::with_capacity(dropped.len());
    let mut i = 0;
    while i < b.len() {
        if b[i] == b'<'
            && b.get(i + 1)
                .is_some_and(|&c| c.is_ascii_alphabetic() || b"/!?".contains(&c))
        {
            if let Some(gt) = dropped[i + 1..].find('>') {
                i += 1 + gt + 1;
                continue;
            }
        }
        let c = dropped[i..].chars().next().unwrap();
        out.push(c);
        i += c.len_utf8();
    }
    unescape_html(&out)
}

#[cfg(test)]
#[allow(clippy::type_complexity, clippy::single_element_loop)] // generated vector tables
mod tests {
    // Generated from the wave 11 capability vectors; do not edit by hand.
    use super::*;

    #[test]
    fn escape_html_vectors() {
        let cases: &[(&str, &str)] = &[
            ("<a href=\"x\">", "&lt;a href=&quot;x&quot;&gt;"),
            ("Tom & Jerry's", "Tom &amp; Jerry&#39;s"),
            ("plain", "plain"),
            ("", ""),
        ];
        for &(input, want) in cases {
            assert_eq!(escape_html(input), want, "{input:?}");
        }
    }

    #[test]
    fn unescape_html_vectors() {
        let cases: &[(&str, &str)] = &[
            ("&lt;p&gt;", "<p>"),
            ("&#169; &#xA9; &#XA9;", "\u{a9} \u{a9} \u{a9}"),
            ("&amp;amp;", "&amp;"),
            ("&amp no semicolon", "&amp no semicolon"),
            ("&bogus; &AMP;", "&bogus; &AMP;"),
            ("&#128; &#x9F;", "\u{20ac} \u{178}"),
            ("&#0; &#xD800; &#1114112;", "\u{fffd} \u{fffd} \u{fffd}"),
            ("&euro;5 &mdash; &hellip;", "\u{20ac}5 \u{2014} \u{2026}"),
            ("&#99999999999;", "&#99999999999;"),
        ];
        for &(input, want) in cases {
            assert_eq!(unescape_html(input), want, "{input:?}");
        }
    }

    #[test]
    fn strip_tags_vectors() {
        let cases: &[(&str, &str)] = &[
            ("<p>Hello <b>world</b></p>", "Hello world"),
            ("a<script>alert(1)</script>b", "ab"),
            ("<STYLE>p{}</STYLE>x &amp; y", "x & y"),
            ("1 < 2 and 3>1", "1 < 2 and 3>1"),
            ("<!-- c -->t", "t"),
            ("unclosed <script>evil", "unclosed "),
        ];
        for &(input, want) in cases {
            assert_eq!(strip_tags(input), want, "{input:?}");
        }
    }
}
