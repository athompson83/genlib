// SPDX-License-Identifier: Apache-2.0

//! `application/x-www-form-urlencoded` parsing and serialization per the WHATWG
//! URL standard: '+' is a space, percent-escapes decode to bytes (an invalid '%'
//! stays literal) and the bytes decode as UTF-8 with U+FFFD replacement.

fn hex_val(c: u8) -> Option<u8> {
    (c as char).to_digit(16).map(|d| d as u8)
}

fn decode(s: &str) -> String {
    let b = s.replace('+', " ").into_bytes();
    let mut out = Vec::with_capacity(b.len());
    let mut i = 0;
    while i < b.len() {
        if b[i] == b'%' && i + 2 < b.len() {
            if let (Some(h), Some(l)) = (hex_val(b[i + 1]), hex_val(b[i + 2])) {
                out.push(h << 4 | l);
                i += 3;
                continue;
            }
        }
        out.push(b[i]);
        i += 1;
    }
    String::from_utf8_lossy(&out).into_owned()
}

/// Splits a query string (one leading '?' removed) into ordered name/value pairs; empty pieces are skipped.
pub fn parse_query(s: &str) -> Vec<(String, String)> {
    let s = s.strip_prefix('?').unwrap_or(s);
    s.split('&')
        .filter(|p| !p.is_empty())
        .map(|p| {
            let (n, v) = p.split_once('=').unwrap_or((p, ""));
            (decode(n), decode(v))
        })
        .collect()
}

fn encode(s: &str, out: &mut String) {
    const HEX: &[u8; 16] = b"0123456789ABCDEF";
    for &c in s.as_bytes() {
        match c {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'*' | b'-' | b'.' | b'_' => out.push(c as char),
            b' ' => out.push('+'),
            _ => {
                out.push('%');
                out.push(HEX[(c >> 4) as usize] as char);
                out.push(HEX[(c & 15) as usize] as char);
            }
        }
    }
}

/// Serializes pairs as name=value joined by '&', keeping only A-Z a-z 0-9 * - . _ unescaped.
pub fn stringify_query<N: AsRef<str>, V: AsRef<str>>(pairs: &[(N, V)]) -> String {
    let mut out = String::new();
    for (i, (n, v)) in pairs.iter().enumerate() {
        if i > 0 {
            out.push('&');
        }
        encode(n.as_ref(), &mut out);
        out.push('=');
        encode(v.as_ref(), &mut out);
    }
    out
}

/// Returns every value whose name equals `name`, in order.
pub fn get_all<N: AsRef<str>, V: AsRef<str>>(pairs: &[(N, V)], name: &str) -> Vec<String> {
    pairs.iter().filter(|(n, _)| n.as_ref() == name).map(|(_, v)| v.as_ref().to_string()).collect()
}

// --- generated tests below ---
#[cfg(test)]
#[allow(clippy::type_complexity, clippy::single_element_loop)] // generated vector tables
mod tests {
    use super::*;

    #[test]
    fn parse_vectors() {
        let cases: &[(&str, &[(&str, &str)])] = &[
            ("a=1&b=2", &[("a", "1"), ("b", "2")]),
            ("?a=1&a=2", &[("a", "1"), ("a", "2")]),
            ("x=a+b%20c", &[("x", "a b c")]),
            ("e=%E2%82%AC", &[("e", "\u{20ac}")]),
            ("bad=%zz&ok=1", &[("bad", "%zz"), ("ok", "1")]),
            ("%", &[("%", "")]),
            ("&&a&&", &[("a", "")]),
            ("k=v=w", &[("k", "v=w")]),
            ("=v", &[("", "v")]),
            ("emoji=%F0%9F%98%80", &[("emoji", "\u{1f600}")]),
            ("invalid=%FF", &[("invalid", "\u{fffd}")]),
            ("plus=%2B", &[("plus", "+")]),
        ];
        for &(s, want) in cases {
            let want: Vec<(String, String)> = want.iter().map(|&(k, v)| (k.to_string(), v.to_string())).collect();
            assert_eq!(parse_query(s), want, "{s:?}");
        }
    }

    #[test]
    fn stringify_vectors() {
        let cases: &[(&[(&str, &str)], &str)] = &[
            (&[("a", "1"), ("b", "x y")], "a=1&b=x+y"),
            (&[("q", "a&b=c"), ("e", "\u{20ac}")], "q=a%26b%3Dc&e=%E2%82%AC"),
            (&[("*-._", "~!'()")], "*-._=%7E%21%27%28%29"),
            (&[("k", ""), ("", "v")], "k=&=v"),
        ];
        for &(pairs, want) in cases {
            assert_eq!(stringify_query(pairs), want);
            let back: Vec<(String, String)> = pairs.iter().map(|&(k, v)| (k.to_string(), v.to_string())).collect();
            assert_eq!(parse_query(want), back);
        }
    }

    #[test]
    fn get_all_vectors() {
        assert_eq!(get_all(&parse_query("a=1&b=2&a=3"), "a"), vec!["1".to_string(), "3".to_string()]);
        assert!(get_all::<&str, &str>(&[], "a").is_empty());
        assert_eq!(parse_query("x=%E2%82")[0].1, "\u{fffd}");
    }
}
