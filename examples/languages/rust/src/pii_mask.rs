// SPDX-License-Identifier: Apache-2.0

//! Masking personal data for logs and user interfaces. This is display
//! masking, not anonymization: the kept characters can still identify a
//! person when combined with other data.

use std::fmt;

/// The input is not the expected kind of value.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct PiiError(pub String);

impl fmt::Display for PiiError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "pii: {}", self.0)
    }
}

impl std::error::Error for PiiError {}

fn err<T>(m: &str) -> Result<T, PiiError> {
    Err(PiiError(m.to_string()))
}

/// Keeps the first code point of the local part, masks the rest (at least 3 '*') and keeps the domain.
pub fn mask_email(e: &str) -> Result<String, PiiError> {
    let mut parts = e.split('@');
    let (Some(local), Some(domain), None) = (parts.next(), parts.next(), parts.next()) else {
        return err("not an email address");
    };
    let mut chars = local.chars();
    let Some(first) = chars.next() else {
        return err("not an email address");
    };
    if domain.is_empty() {
        return err("not an email address");
    }
    let stars = chars.count().max(3);
    Ok(format!("{first}{}@{domain}", "*".repeat(stars)))
}

/// Keeps the last 4 ASCII digits and a leading "+CC " country code (ASCII digits), masking every other ASCII digit.
pub fn mask_phone(p: &str) -> Result<String, PiiError> {
    let total = p.chars().filter(char::is_ascii_digit).count();
    if total < 7 {
        return err("not a phone number");
    }
    let b = p.as_bytes();
    let mut keep_front = 0;
    if b.first() == Some(&b'+') {
        let mut j = 1;
        while j < b.len() && j <= 3 && b[j].is_ascii_digit() {
            j += 1;
        }
        if j > 1 && b.get(j) == Some(&b' ') {
            keep_front = j - 1;
        }
    }
    let mut seen = 0;
    Ok(p.chars()
        .map(|c| {
            if c.is_ascii_digit() {
                let keep = seen < keep_front || seen + 4 >= total;
                seen += 1;
                if keep {
                    c
                } else {
                    '*'
                }
            } else {
                c
            }
        })
        .collect())
}

/// Keeps the last 4 of 12-19 digits and the space or hyphen separators; other characters are an error.
pub fn mask_card(c: &str) -> Result<String, PiiError> {
    if c.is_empty()
        || !c
            .bytes()
            .all(|b| b.is_ascii_digit() || b == b' ' || b == b'-')
    {
        return err("not a card number");
    }
    let total = c.bytes().filter(u8::is_ascii_digit).count();
    if !(12..=19).contains(&total) {
        return err("not a card number");
    }
    let mut seen = 0;
    Ok(c.chars()
        .map(|ch| {
            if ch.is_ascii_digit() {
                seen += 1;
                if seen + 4 > total {
                    ch
                } else {
                    '*'
                }
            } else {
                ch
            }
        })
        .collect())
}

/// Keeps `keep_start` and `keep_end` code points (usually 1, 1, '*') and masks the rest, or everything when too short.
pub fn mask_middle(s: &str, keep_start: usize, keep_end: usize, mask: char) -> String {
    let r: Vec<char> = s.chars().collect();
    if r.len() <= keep_start + keep_end {
        return std::iter::repeat(mask).take(r.len()).collect();
    }
    let mut out: String = r[..keep_start].iter().collect();
    out.extend(std::iter::repeat(mask).take(r.len() - keep_start - keep_end));
    out.extend(&r[r.len() - keep_end..]);
    out
}

fn luhn(digits: &[u8]) -> bool {
    let mut s = 0;
    for (i, d) in digits.iter().rev().enumerate() {
        let mut n = (d - b'0') as u32;
        if i % 2 == 1 {
            n *= 2;
            if n > 9 {
                n -= 9;
            }
        }
        s += n;
    }
    s % 10 == 0
}

/// Masks runs of 13-19 digits (single space or hyphen separators allowed, not
/// touching other digits) that pass the Luhn check.
fn redact_cards(t: &str) -> String {
    let b = t.as_bytes();
    let n = b.len();
    let mut out: Vec<u8> = Vec::with_capacity(n);
    let mut i = 0;
    while i < n {
        if b[i].is_ascii_digit() && (i == 0 || !b[i - 1].is_ascii_digit()) {
            let mut ends = vec![i + 1];
            let mut j = i + 1;
            while ends.len() < 19 {
                let mut k = j;
                if k < n && (b[k] == b' ' || b[k] == b'-') {
                    k += 1;
                }
                if k < n && b[k].is_ascii_digit() {
                    j = k + 1;
                    ends.push(j);
                } else {
                    break;
                }
            }
            let end = (13..=ends.len())
                .rev()
                .map(|c| ends[c - 1])
                .find(|&e| e >= n || !b[e].is_ascii_digit());
            if let Some(end) = end {
                let run = &t[i..end];
                let digits: Vec<u8> = run.bytes().filter(u8::is_ascii_digit).collect();
                match mask_card(run) {
                    Ok(masked) if luhn(&digits) => out.extend_from_slice(masked.as_bytes()),
                    _ => out.extend_from_slice(run.as_bytes()),
                }
                i = end;
                continue;
            }
        }
        out.push(b[i]);
        i += 1;
    }
    String::from_utf8(out).expect("only ASCII was replaced")
}

fn is_local(c: u8) -> bool {
    c.is_ascii_alphanumeric() || b"._%+-".contains(&c)
}

fn is_domain(c: u8) -> bool {
    c.is_ascii_alphanumeric() || c == b'.' || c == b'-'
}

/// End of `[A-Za-z0-9.-]+\.[A-Za-z]{2,}` starting at `i`, if it matches.
fn domain_end(b: &[u8], i: usize) -> Option<usize> {
    let mut d = i;
    while d < b.len() && is_domain(b[d]) {
        d += 1;
    }
    let p = (i + 1..d).rev().find(|&p| {
        b[p] == b'.'
            && p + 2 < b.len()
            && b[p + 1].is_ascii_alphabetic()
            && b[p + 2].is_ascii_alphabetic()
    })?;
    let mut e = p + 1;
    while e < b.len() && b[e].is_ascii_alphabetic() {
        e += 1;
    }
    Some(e)
}

fn redact_emails(t: &str) -> String {
    let b = t.as_bytes();
    let n = b.len();
    let mut out: Vec<u8> = Vec::with_capacity(n);
    let mut i = 0;
    while i < n {
        if !is_local(b[i]) {
            out.push(b[i]);
            i += 1;
            continue;
        }
        let mut r = i;
        while r < n && is_local(b[r]) {
            r += 1;
        }
        if r < n && b[r] == b'@' {
            if let Some(e) = domain_end(b, r + 1) {
                let masked = mask_email(&t[i..e]).expect("matched an address");
                out.extend_from_slice(masked.as_bytes());
                i = e;
                continue;
            }
        }
        out.extend_from_slice(&b[i..r]);
        i = r;
    }
    String::from_utf8(out).expect("only ASCII was replaced")
}

/// Masks Luhn-valid card numbers and then email addresses in free text; phone numbers are not detected.
pub fn redact(text: &str) -> String {
    redact_emails(&redact_cards(text))
}

#[cfg(test)]
#[allow(clippy::type_complexity, clippy::single_element_loop)] // generated vector tables
mod tests {
    // Generated from the wave 11 capability vectors; do not edit by hand.
    use super::*;

    #[test]
    fn mask_email_vectors() {
        let cases: &[(&str, &str)] = &[
            ("jane.doe@example.com", "j*******@example.com"),
            ("a@b.co", "a***@b.co"),
            ("ab@x.io", "a***@x.io"),
            ("\u{e9}mile@ex.fr", "\u{e9}****@ex.fr"),
        ];
        for &(input, want) in cases {
            assert_eq!(mask_email(input).as_deref(), Ok(want), "{input:?}");
        }
        for s in ["nope", "a@b@c", "@x.com", "x@"] {
            assert!(mask_email(s).is_err(), "{s:?}");
        }
    }

    #[test]
    fn mask_phone_vectors() {
        let cases: &[(&str, &str)] = &[
            ("+1 (415) 555-0123", "+1 (***) ***-0123"),
            ("+44 20 7946 0958", "+44 ** **** 0958"),
            ("0612345678", "******5678"),
            ("555-0123-99", "***-**23-99"),
        ];
        for &(input, want) in cases {
            assert_eq!(mask_phone(input).as_deref(), Ok(want), "{input:?}");
        }
        for s in ["123", "+1 55"] {
            assert!(mask_phone(s).is_err(), "{s:?}");
        }
    }

    #[test]
    fn mask_card_vectors() {
        let cases: &[(&str, &str)] = &[
            ("4111 1111 1111 1111", "**** **** **** 1111"),
            ("4111-1111-1111-1111", "****-****-****-1111"),
            ("378282246310005", "***********0005"),
            ("6011000990139424", "************9424"),
        ];
        for &(input, want) in cases {
            assert_eq!(mask_card(input).as_deref(), Ok(want), "{input:?}");
        }
        for s in ["4111", "4111 1111 1111 1111 1111 1", "4111a1111111111"] {
            assert!(mask_card(s).is_err(), "{s:?}");
        }
    }

    #[test]
    fn mask_middle_vectors() {
        let cases: &[(&str, usize, usize, &str)] = &[
            ("secret-token", 2, 2, "se********en"),
            ("abc", 1, 1, "a*c"),
            ("ab", 1, 1, "**"),
            ("password", 0, 0, "********"),
            ("h\u{e9}llo", 1, 0, "h****"),
        ];
        for &(s, a, e, want) in cases {
            assert_eq!(mask_middle(s, a, e, '*'), want, "{s:?}");
        }
    }

    #[test]
    fn redact_vectors() {
        let cases: &[(&str, &str)] = &[
            (
                "contact jane@example.com today",
                "contact j***@example.com today",
            ),
            (
                "card 4111 1111 1111 1111 exp",
                "card **** **** **** 1111 exp",
            ),
            (
                "order 1234 5678 9012 3456 ok",
                "order 1234 5678 9012 3456 ok",
            ),
            ("two a@b.io, c.d@e.org", "two a***@b.io, c***@e.org"),
            ("id 4111111111111111x", "id ************1111x"),
        ];
        for &(input, want) in cases {
            assert_eq!(redact(input), want, "{input:?}");
        }
    }
}
