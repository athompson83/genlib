// SPDX-License-Identifier: Apache-2.0

//! Roman numerals 1..3999 in standard subtractive form. Parsing is
//! case-insensitive and accepts only the canonical form, so "IIII", "IC" and
//! "VX" are rejected.

use std::fmt;

/// Out-of-range number or non-canonical numeral.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct RomanError(pub String);

impl fmt::Display for RomanError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "roman: {}", self.0)
    }
}

impl std::error::Error for RomanError {}

const PAIRS: [(i64, &str); 13] = [
    (1000, "M"),
    (900, "CM"),
    (500, "D"),
    (400, "CD"),
    (100, "C"),
    (90, "XC"),
    (50, "L"),
    (40, "XL"),
    (10, "X"),
    (9, "IX"),
    (5, "V"),
    (4, "IV"),
    (1, "I"),
];

fn value(c: char) -> Option<i64> {
    Some(match c {
        'I' => 1,
        'V' => 5,
        'X' => 10,
        'L' => 50,
        'C' => 100,
        'D' => 500,
        'M' => 1000,
        _ => return None,
    })
}

/// Returns the canonical numeral for `n` in 1..=3999.
pub fn to_roman(n: i64) -> Result<String, RomanError> {
    if !(1..=3999).contains(&n) {
        return Err(RomanError("out of range".into()));
    }
    let mut n = n;
    let mut out = String::new();
    for (v, s) in PAIRS {
        while n >= v {
            out.push_str(s);
            n -= v;
        }
    }
    Ok(out)
}

/// Parses a canonical numeral (any case) and returns its value.
pub fn from_roman(s: &str) -> Result<i64, RomanError> {
    let u: Vec<char> = s.to_uppercase().chars().collect();
    let vals: Option<Vec<i64>> = u.iter().map(|&c| value(c)).collect();
    let vals = match vals {
        Some(v) if !v.is_empty() => v,
        _ => return Err(RomanError("not a roman numeral".into())),
    };
    let mut total = 0;
    for (i, &v) in vals.iter().enumerate() {
        if i + 1 < vals.len() && vals[i + 1] > v {
            total -= v;
        } else {
            total += v;
        }
    }
    let canonical = to_roman(total).ok();
    if canonical.as_deref() != Some(u.iter().collect::<String>().as_str()) {
        return Err(RomanError("not a canonical roman numeral".into()));
    }
    Ok(total)
}

#[cfg(test)]
#[allow(clippy::type_complexity, clippy::single_element_loop)] // generated vector tables
mod tests {
    // Generated from the wave 11 capability vectors; do not edit by hand.
    use super::*;

    #[test]
    fn to_roman_vectors() {
        let cases: &[(i64, &str)] = &[
            (1, "I"),
            (4, "IV"),
            (9, "IX"),
            (14, "XIV"),
            (40, "XL"),
            (90, "XC"),
            (400, "CD"),
            (1994, "MCMXCIV"),
            (2026, "MMXXVI"),
            (3888, "MMMDCCCLXXXVIII"),
            (3999, "MMMCMXCIX"),
        ];
        for &(n, want) in cases {
            assert_eq!(to_roman(n).as_deref(), Ok(want), "{n}");
        }
    }

    #[test]
    fn from_roman_vectors() {
        let cases: &[(&str, i64)] = &[
            ("I", 1),
            ("iv", 4),
            ("MCMXCIV", 1994),
            ("mmxxvi", 2026),
            ("MMMCMXCIX", 3999),
        ];
        for &(s, want) in cases {
            assert_eq!(from_roman(s), Ok(want), "{s}");
        }
    }

    #[test]
    fn invalid_vectors() {
        for n in [0, 4000, -5] {
            assert!(to_roman(n).is_err(), "{n}");
        }
        for s in ["", "IIII", "IC", "VX", "MMMM", "ABC", "IIV", "XM"] {
            assert!(from_roman(s).is_err(), "{s:?}");
        }
    }
}
