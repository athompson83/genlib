// SPDX-License-Identifier: Apache-2.0

//! RFC 3492 Punycode (Bootstring with base 36, tmin 1, tmax 26, skew 38,
//! damp 700, initial bias 72, initial n 128 and '-' as the delimiter) with
//! 31-bit overflow checks, plus a simplified IDNA-style domain conversion.
//! The domain functions only lowercase ASCII letters: they apply no Unicode
//! normalization and no IDNA (UTS #46) mapping, so normalize (NFC, case-fold)
//! first when that matters.

use std::fmt;

/// Invalid Punycode input or domain name.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct PunycodeError(pub String);

impl fmt::Display for PunycodeError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "punycode: {}", self.0)
    }
}

impl std::error::Error for PunycodeError {}

fn err<T>(m: &str) -> Result<T, PunycodeError> {
    Err(PunycodeError(m.to_string()))
}

const BASE: i64 = 36;
const TMIN: i64 = 1;
const TMAX: i64 = 26;
const SKEW: i64 = 38;
const DAMP: i64 = 700;
const INITIAL_BIAS: i64 = 72;
const INITIAL_N: i64 = 128;
const MAX_INT: i64 = (1 << 31) - 1;

fn adapt(delta: i64, num: i64, first: bool) -> i64 {
    let mut delta = if first { delta / DAMP } else { delta / 2 };
    delta += delta / num;
    let mut k = 0;
    while delta > ((BASE - TMIN) * TMAX) / 2 {
        delta /= BASE - TMIN;
        k += BASE;
    }
    k + (BASE - TMIN + 1) * delta / (delta + SKEW)
}

fn digit(d: i64) -> char {
    if d < 26 {
        (b'a' + d as u8) as char
    } else {
        (b'0' + (d - 26) as u8) as char
    }
}

fn threshold(k: i64, bias: i64) -> i64 {
    if k <= bias {
        TMIN
    } else if k >= bias + TMAX {
        TMAX
    } else {
        k - bias
    }
}

/// Converts a Unicode string to its Punycode form (no "xn--" prefix).
pub fn punycode_encode(s: &str) -> Result<String, PunycodeError> {
    let cps: Vec<i64> = s.chars().map(|c| c as i64).collect();
    let mut out: String = s.chars().filter(|c| c.is_ascii()).collect();
    let b = out.len() as i64;
    let mut h = b;
    if b > 0 {
        out.push('-');
    }
    let (mut n, mut delta, mut bias) = (INITIAL_N, 0i64, INITIAL_BIAS);
    while h < cps.len() as i64 {
        let m = cps.iter().copied().filter(|&c| c >= n).min().unwrap_or(n);
        if (m - n) * (h + 1) > MAX_INT - delta {
            return err("overflow");
        }
        delta += (m - n) * (h + 1);
        n = m;
        for &c in &cps {
            if c < n {
                delta += 1;
                if delta > MAX_INT {
                    return err("overflow");
                }
            }
            if c == n {
                let mut q = delta;
                let mut k = BASE;
                loop {
                    let t = threshold(k, bias);
                    if q < t {
                        break;
                    }
                    out.push(digit(t + (q - t) % (BASE - t)));
                    q = (q - t) / (BASE - t);
                    k += BASE;
                }
                out.push(digit(q));
                bias = adapt(delta, h + 1, h == b);
                delta = 0;
                h += 1;
            }
        }
        delta += 1;
        n += 1;
    }
    Ok(out)
}

fn value(c: char) -> Result<i64, PunycodeError> {
    match c {
        '0'..='9' => Ok(c as i64 - 22),
        'A'..='Z' => Ok(c as i64 - 'A' as i64),
        'a'..='z' => Ok(c as i64 - 'a' as i64),
        _ => err("invalid digit"),
    }
}

/// Converts a Punycode string (either case, no "xn--" prefix) to Unicode.
pub fn punycode_decode(s: &str) -> Result<String, PunycodeError> {
    let input: Vec<char> = s.chars().collect();
    let delim = input.iter().rposition(|&c| c == '-');
    let mut out: Vec<char> = Vec::new();
    if let Some(i) = delim {
        for &c in &input[..i] {
            if !c.is_ascii() {
                return err("non-basic code point");
            }
            out.push(c);
        }
    }
    let mut pos = delim.map_or(0, |i| i + 1);
    let (mut n, mut idx, mut bias) = (INITIAL_N, 0i64, INITIAL_BIAS);
    while pos < input.len() {
        let (old, mut w) = (idx, 1i64);
        let mut k = BASE;
        loop {
            if pos >= input.len() {
                return err("truncated input");
            }
            let d = value(input[pos])?;
            pos += 1;
            if d > (MAX_INT - idx) / w {
                return err("overflow");
            }
            idx += d * w;
            let t = threshold(k, bias);
            if d < t {
                break;
            }
            if w > MAX_INT / (BASE - t) {
                return err("overflow");
            }
            w *= BASE - t;
            k += BASE;
        }
        let size = out.len() as i64 + 1;
        bias = adapt(idx - old, size, old == 0);
        if idx / size > MAX_INT - n {
            return err("overflow");
        }
        n += idx / size;
        idx %= size;
        let c = match u32::try_from(n).ok().and_then(char::from_u32) {
            Some(c) => c,
            None => return err("invalid code point"),
        };
        out.insert(idx as usize, c);
        idx += 1;
    }
    Ok(out.into_iter().collect())
}

/// Lowercases ASCII letters and encodes each non-ASCII label as "xn--" + Punycode (no normalization or IDNA mapping).
pub fn domain_to_ascii(domain: &str) -> Result<String, PunycodeError> {
    let trailing = domain.ends_with('.') && domain.chars().count() > 1;
    let body = if trailing {
        &domain[..domain.len() - 1]
    } else {
        domain
    };
    let mut res = Vec::new();
    for label in body.split('.') {
        if label.is_empty() {
            return err("empty label");
        }
        let mut a = label.to_ascii_lowercase();
        if !a.is_ascii() {
            a = format!("xn--{}", punycode_encode(&a)?);
        }
        if a.len() > 63 {
            return err("label too long");
        }
        res.push(a);
    }
    let mut out = res.join(".");
    if out.len() > 253 {
        return err("name too long");
    }
    if trailing {
        out.push('.');
    }
    Ok(out)
}

/// Decodes each label that starts with "xn--" (any case); other labels are kept as is.
pub fn domain_to_unicode(domain: &str) -> Result<String, PunycodeError> {
    let mut labels = Vec::new();
    for label in domain.split('.') {
        let prefix: String = label.chars().take(4).collect();
        if prefix.len() == 4 && prefix.eq_ignore_ascii_case("xn--") {
            labels.push(punycode_decode(&label[4..])?);
        } else {
            labels.push(label.to_string());
        }
    }
    Ok(labels.join("."))
}

#[cfg(test)]
#[allow(clippy::type_complexity, clippy::single_element_loop)] // generated vector tables
mod tests {
    // Generated from the wave 11 capability vectors; do not edit by hand.
    use super::*;

    #[test]
    fn encode_vectors() {
        let cases: &[(&str, &str)] = &[
            ("b\u{fc}cher", "bcher-kva"),
            ("m\u{fc}nchen", "mnchen-3ya"),
            ("\u{65e5}\u{672c}\u{8a9e}", "wgv71a119e"),
            ("\u{fc}", "tda"),
            ("abc", "abc-"),
            ("Ma\u{f1}ana", "Maana-pta"),
            (
                "\u{3b5}\u{3bb}\u{3bb}\u{3b7}\u{3bd}\u{3b9}\u{3ba}\u{3ac}",
                "hxargifdar",
            ),
            ("\u{43f}\u{440}\u{430}\u{432}\u{434}\u{430}", "80aafi6cg"),
            ("\u{1f600}", "e28h"),
            ("a-b", "a-b-"),
            ("-", "--"),
            ("\u{627}\u{644}\u{62d}\u{631}\u{64a}\u{647}", "mgbmm8erar"),
            (
                "Hello-Another-Way-\u{305d}\u{308c}\u{305e}\u{308c}\u{306e}\u{5834}\u{6240}",
                "Hello-Another-Way--fc4qua05auwb3674vfr0b",
            ),
            ("\u{dc}BER", "BER-ska"),
            ("x\u{e9}\u{301}", "x-bga22n"),
        ];
        for &(input, want) in cases {
            assert_eq!(punycode_encode(input).as_deref(), Ok(want), "{input:?}");
        }
    }

    #[test]
    fn decode_vectors() {
        let cases: &[(&str, &str)] = &[
            ("bcher-kva", "b\u{fc}cher"),
            ("mnchen-3ya", "m\u{fc}nchen"),
            ("wgv71a119e", "\u{65e5}\u{672c}\u{8a9e}"),
            ("tda", "\u{fc}"),
            ("abc-", "abc"),
            ("Maana-pta", "Ma\u{f1}ana"),
            (
                "hxargifdar",
                "\u{3b5}\u{3bb}\u{3bb}\u{3b7}\u{3bd}\u{3b9}\u{3ba}\u{3ac}",
            ),
            ("80aafi6cg", "\u{43f}\u{440}\u{430}\u{432}\u{434}\u{430}"),
            ("e28h", "\u{1f600}"),
            ("a-b-", "a-b"),
            ("--", "-"),
            ("mgbmm8erar", "\u{627}\u{644}\u{62d}\u{631}\u{64a}\u{647}"),
            (
                "Hello-Another-Way--fc4qua05auwb3674vfr0b",
                "Hello-Another-Way-\u{305d}\u{308c}\u{305e}\u{308c}\u{306e}\u{5834}\u{6240}",
            ),
            ("BER-ska", "\u{dc}BER"),
            ("x-bga22n", "x\u{e9}\u{301}"),
            ("bcher-kva", "b\u{fc}cher"),
        ];
        for &(input, want) in cases {
            assert_eq!(punycode_decode(input).as_deref(), Ok(want), "{input:?}");
        }
    }

    #[test]
    fn to_ascii_vectors() {
        let cases: &[(&str, &str)] = &[
            ("B\u{fc}cher.Example", "xn--bcher-kva.example"),
            ("EXAMPLE.com", "example.com"),
            ("\u{65e5}\u{672c}\u{8a9e}.jp.", "xn--wgv71a119e.jp."),
            ("m\u{fc}nchen.de", "xn--mnchen-3ya.de"),
            ("a.b.c", "a.b.c"),
        ];
        for &(input, want) in cases {
            assert_eq!(domain_to_ascii(input).as_deref(), Ok(want), "{input:?}");
        }
    }

    #[test]
    fn to_unicode_vectors() {
        let cases: &[(&str, &str)] = &[
            ("xn--bcher-kva.example", "b\u{fc}cher.example"),
            ("XN--wgv71a119e.jp", "\u{65e5}\u{672c}\u{8a9e}.jp"),
            ("plain.com", "plain.com"),
        ];
        for &(input, want) in cases {
            assert_eq!(domain_to_unicode(input).as_deref(), Ok(want), "{input:?}");
        }
    }

    #[test]
    fn invalid_vectors() {
        for s in [
            "bcher-kv!",
            "a-99999999999999999999",
            "\u{fc}-abc",
            "xyzzy123456789zzzz",
        ] {
            assert!(punycode_decode(s).is_err(), "{s:?}");
        }
        for s in ["a..b", ".x", "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx.com", "\u{fc}\u{fc}\u{fc}\u{fc}\u{fc}\u{fc}\u{fc}\u{fc}\u{fc}\u{fc}\u{fc}\u{fc}\u{fc}\u{fc}\u{fc}\u{fc}\u{fc}\u{fc}\u{fc}\u{fc}\u{fc}\u{fc}\u{fc}\u{fc}\u{fc}\u{fc}\u{fc}\u{fc}\u{fc}\u{fc}\u{fc}\u{fc}\u{fc}\u{fc}\u{fc}\u{fc}\u{fc}\u{fc}\u{fc}\u{fc}\u{fc}\u{fc}\u{fc}\u{fc}\u{fc}\u{fc}\u{fc}\u{fc}\u{fc}\u{fc}\u{fc}\u{fc}\u{fc}\u{fc}\u{fc}\u{fc}\u{fc}\u{fc}\u{fc}\u{fc}.com"] {
            assert!(domain_to_ascii(s).is_err(), "{s:?}");
        }
    }
}
