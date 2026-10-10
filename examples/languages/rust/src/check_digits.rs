// SPDX-License-Identifier: Apache-2.0

//! Check-digit validation for Luhn numbers, IBANs, GTIN/EAN/UPC and ISBN-10/13.
//! Validators return `false` for bad input; converters return an error. A valid
//! check digit only proves the value is well formed, not that it exists.

use std::fmt;

/// Invalid input for a converter, with a human-readable message.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct CheckDigitError(pub String);

impl fmt::Display for CheckDigitError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(&self.0)
    }
}

impl std::error::Error for CheckDigitError {}

fn strip(s: &str) -> String {
    s.chars().filter(|c| *c != ' ' && *c != '-').collect()
}

fn all_digits(s: &str) -> bool {
    s.bytes().all(|b| b.is_ascii_digit())
}

fn weighted_sum(t: &str, odd_weight: u32, luhn: bool) -> u32 {
    t.bytes()
        .rev()
        .enumerate()
        .map(|(i, b)| {
            let d = u32::from(b - b'0');
            if i % 2 == 1 {
                let v = d * odd_weight;
                if luhn && v > 9 {
                    v - 9
                } else {
                    v
                }
            } else {
                d
            }
        })
        .sum()
}

/// Luhn mod-10 check over at least two ASCII digits (spaces/hyphens ignored).
pub fn luhn_valid(s: &str) -> bool {
    let t = strip(s);
    t.len() >= 2 && all_digits(&t) && weighted_sum(&t, 2, true) % 10 == 0
}

/// The digit that makes `payload` + digit Luhn-valid.
pub fn luhn_check_digit(payload: &str) -> Result<String, CheckDigitError> {
    let t = strip(payload);
    if t.is_empty() || !all_digits(&t) {
        return Err(CheckDigitError("payload must be ASCII digits".into()));
    }
    let d = (10 - weighted_sum(&format!("{t}0"), 2, true) % 10) % 10;
    Ok(d.to_string())
}

fn iban_clean(s: &str) -> String {
    s.chars().filter(|c| *c != ' ').collect::<String>().to_ascii_uppercase()
}

/// ISO 13616 IBAN structure and ISO 7064 mod-97 check (spaces ignored, any case).
pub fn iban_valid(s: &str) -> bool {
    let t = iban_clean(s);
    let b = t.as_bytes();
    if !(15..=34).contains(&b.len()) {
        return false;
    }
    let shape = b.iter().enumerate().all(|(i, c)| match i {
        0 | 1 => c.is_ascii_uppercase(),
        2 | 3 => c.is_ascii_digit(),
        _ => c.is_ascii_uppercase() || c.is_ascii_digit(),
    });
    if !shape {
        return false;
    }
    let mut rem: u32 = 0;
    for &c in b[4..].iter().chain(&b[..4]) {
        rem = if c.is_ascii_digit() {
            (rem * 10 + u32::from(c - b'0')) % 97
        } else {
            (rem * 100 + u32::from(c - b'A') + 10) % 97
        };
    }
    rem == 1
}

/// A valid IBAN as uppercase groups of four separated by single spaces.
pub fn iban_format(s: &str) -> Result<String, CheckDigitError> {
    let t = iban_clean(s);
    if !iban_valid(&t) {
        return Err(CheckDigitError("invalid IBAN".into()));
    }
    let groups: Vec<&str> = t.as_bytes().chunks(4).map(|c| std::str::from_utf8(c).expect("ASCII")).collect();
    Ok(groups.join(" "))
}

/// GTIN-8/12/13/14 (EAN/UPC) check digit (spaces/hyphens ignored).
pub fn gtin_valid(s: &str) -> bool {
    let t = strip(s);
    matches!(t.len(), 8 | 12 | 13 | 14) && all_digits(&t) && weighted_sum(&t, 3, false) % 10 == 0
}

fn isbn10_clean(s: &str) -> Option<String> {
    let t = strip(s).to_ascii_uppercase();
    let b = t.as_bytes();
    if b.len() != 10 || !b[..9].iter().all(u8::is_ascii_digit) || !(b[9].is_ascii_digit() || b[9] == b'X') {
        return None;
    }
    let sum: u32 = b.iter().enumerate().map(|(i, &c)| (10 - i as u32) * if c == b'X' { 10 } else { u32::from(c - b'0') }).sum();
    (sum % 11 == 0).then_some(t)
}

/// ISBN-10 (final `X` allowed) with a correct mod-11 check digit.
pub fn isbn10_valid(s: &str) -> bool {
    isbn10_clean(s).is_some()
}

/// 978/979-prefixed ISBN-13 with a correct check digit.
pub fn isbn13_valid(s: &str) -> bool {
    let t = strip(s);
    t.len() == 13 && (t.starts_with("978") || t.starts_with("979")) && gtin_valid(&t)
}

/// Converts a valid ISBN-10 to its 978-prefixed ISBN-13.
pub fn isbn10_to_13(s: &str) -> Result<String, CheckDigitError> {
    let t = isbn10_clean(s).ok_or_else(|| CheckDigitError("invalid ISBN-10".into()))?;
    let body = format!("978{}", &t[..9]);
    let check = (10 - weighted_sum(&format!("{body}0"), 3, false) % 10) % 10;
    Ok(format!("{body}{check}"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn luhn() {
        for (s, want) in [
            ("4539 1488 0343 6467", true),
            ("79927398713", true),
            ("79927398710", false),
            ("0", false),
            ("4539-1488-0343-6468", false),
            ("12a4", false),
            ("", false),
        ] {
            assert_eq!(luhn_valid(s), want, "{s}");
        }
        assert_eq!(luhn_check_digit("7992739871").unwrap(), "3");
        assert_eq!(luhn_check_digit("453914880343646").unwrap(), "7");
        assert!(luhn_check_digit("12a").is_err());
        assert!(luhn_check_digit("").is_err());
    }

    #[test]
    fn iban() {
        for (s, want) in [
            ("GB82 WEST 1234 5698 7654 32", true),
            ("DE89 3704 0044 0532 0130 00", true),
            ("gb82west12345698765432", true),
            ("GB82 WEST 1234 5698 7654 33", false),
            ("GB82-WEST", false),
            ("NO9386011117947", true),
            ("XX00", false),
        ] {
            assert_eq!(iban_valid(s), want, "{s}");
        }
        assert_eq!(iban_format("gb82west12345698765432").unwrap(), "GB82 WEST 1234 5698 7654 32");
        assert_eq!(iban_format("NO9386011117947").unwrap(), "NO93 8601 1117 947");
        assert!(iban_format("GB82 WEST 1234 5698 7654 33").is_err());
    }

    #[test]
    fn gtin_and_isbn() {
        for (s, want) in [
            ("4006381333931", true),
            ("036000291452", true),
            ("96385074", true),
            ("10614141000415", true),
            ("4006381333932", false),
            ("12345", false),
        ] {
            assert_eq!(gtin_valid(s), want, "{s}");
        }
        for (s, want) in [("0-306-40615-2", true), ("0-8044-2957-X", true), ("0-306-40615-3", false), ("030640615", false)] {
            assert_eq!(isbn10_valid(s), want, "{s}");
        }
        for (s, want) in [("978-0-306-40615-7", true), ("979-10-90636-07-1", true), ("978-0-306-40615-8", false), ("4006381333931", false)] {
            assert_eq!(isbn13_valid(s), want, "{s}");
        }
        assert_eq!(isbn10_to_13("0-306-40615-2").unwrap(), "9780306406157");
        assert_eq!(isbn10_to_13("080442957X").unwrap(), "9780804429573");
        assert!(isbn10_to_13("0-306-40615-3").is_err());
    }
}
