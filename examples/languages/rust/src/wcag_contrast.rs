// SPDX-License-Identifier: Apache-2.0

//! WCAG 2.x relative luminance and contrast ratio for `#rgb`/`#rrggbb` colors,
//! with AA/AAA pass checks for normal and large text.

use std::fmt;

/// Invalid color error with a human-readable message.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ContrastError(pub String);

impl fmt::Display for ContrastError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(&self.0)
    }
}

impl std::error::Error for ContrastError {}

/// WCAG conformance level.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Level {
    AA,
    AAA,
}

fn parse_hex(hex: &str) -> Result<[u8; 3], ContrastError> {
    let bad = || ContrastError(format!("color must be #rgb or #rrggbb: {hex:?}"));
    let digits = hex.strip_prefix('#').ok_or_else(bad)?;
    let nibbles: Vec<u8> = digits.chars().map(|c| c.to_digit(16).map(|d| d as u8)).collect::<Option<_>>().ok_or_else(bad)?;
    match nibbles.len() {
        3 => Ok([nibbles[0] * 17, nibbles[1] * 17, nibbles[2] * 17]),
        6 => Ok([nibbles[0] * 16 + nibbles[1], nibbles[2] * 16 + nibbles[3], nibbles[4] * 16 + nibbles[5]]),
        _ => Err(bad()),
    }
}

fn linear(channel: u8) -> f64 {
    let c = channel as f64 / 255.0;
    if c <= 0.04045 {
        c / 12.92
    } else {
        ((c + 0.055) / 1.055).powf(2.4)
    }
}

/// Relative luminance in [0, 1].
pub fn relative_luminance(hex: &str) -> Result<f64, ContrastError> {
    let [r, g, b] = parse_hex(hex)?;
    Ok(0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b))
}

/// Contrast ratio in [1, 21], unrounded.
pub fn contrast_ratio(a: &str, b: &str) -> Result<f64, ContrastError> {
    let (la, lb) = (relative_luminance(a)?, relative_luminance(b)?);
    Ok((la.max(lb) + 0.05) / (la.min(lb) + 0.05))
}

/// Contrast ratio rounded to 2 decimals, half away from zero (for display).
pub fn contrast_ratio2(a: &str, b: &str) -> Result<f64, ContrastError> {
    Ok((contrast_ratio(a, b)? * 100.0).round() / 100.0)
}

/// Whether an unrounded `ratio` meets `level` (AA 4.5/3.0 large, AAA 7.0/4.5 large).
pub fn passes(ratio: f64, level: Level, large_text: bool) -> bool {
    let min = match (level, large_text) {
        (Level::AA, false) => 4.5,
        (Level::AA, true) => 3.0,
        (Level::AAA, false) => 7.0,
        (Level::AAA, true) => 4.5,
    };
    ratio >= min
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn vectors() {
        assert_eq!(contrast_ratio2("#000", "#fff").unwrap(), 21.0);
        assert_eq!(contrast_ratio2("#767676", "#ffffff").unwrap(), 4.54);
        assert_eq!(contrast_ratio2("#1a73e8", "#ffffff").unwrap(), 4.51);
        assert_eq!(contrast_ratio2("#abc", "#aabbcc").unwrap(), 1.0);
        assert_eq!(contrast_ratio2("#ffff00", "#ffffff").unwrap(), 1.07);
        assert!(passes(contrast_ratio("#767676", "#ffffff").unwrap(), Level::AA, false));
        assert!(!passes(contrast_ratio("#ffff00", "#ffffff").unwrap(), Level::AA, true));
    }

    #[test]
    fn levels_and_inputs() {
        assert_eq!(relative_luminance("#FFF").unwrap(), 1.0);
        assert_eq!(relative_luminance("#000000").unwrap(), 0.0);
        assert_eq!(contrast_ratio("#fff", "#000").unwrap(), contrast_ratio("#000", "#fff").unwrap());
        assert!(passes(3.0, Level::AA, true) && !passes(2.99, Level::AA, true));
        assert!(passes(7.0, Level::AAA, false) && !passes(6.99, Level::AAA, false));
        assert!(passes(4.5, Level::AAA, true) && !passes(4.49, Level::AAA, true));
        assert!(!passes(4.499, Level::AA, false));
        for bad in ["fff", "#ffff", "#gggggg", "#fffffff", "", "#", "#ff ff ff"] {
            assert!(relative_luminance(bad).is_err(), "{bad}");
        }
    }
}
