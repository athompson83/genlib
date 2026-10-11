// SPDX-License-Identifier: Apache-2.0

//! Password and passphrase generation from an injected byte source, so tests
//! are deterministic; [`password`] and [`passphrase`] use the operating
//! system CSPRNG through the `getrandom` crate already pinned here. Indexes
//! are unbiased (rejection sampling), one character is drawn from each
//! requested class in order, the rest from the union of the classes, and the
//! result is Fisher-Yates shuffled.

use std::cell::Cell;
use std::collections::HashSet;
use std::fmt;

/// Invalid arguments or an unavailable random source.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct PassGenError(pub String);

impl fmt::Display for PassGenError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "password: {}", self.0)
    }
}

impl std::error::Error for PassGenError {}

fn err<T>(m: &str) -> Result<T, PassGenError> {
    Err(PassGenError(m.to_string()))
}

/// Every character class in canonical order.
pub const DEFAULT_CLASSES: [&str; 4] = ["lower", "upper", "digits", "symbols"];

fn class_set(name: &str) -> Option<&'static str> {
    Some(match name {
        "lower" => "abcdefghijklmnopqrstuvwxyz",
        "upper" => "ABCDEFGHIJKLMNOPQRSTUVWXYZ",
        "digits" => "0123456789",
        "symbols" => "!#$%&*+-=?@^_~",
        _ => return None,
    })
}

/// Returns an unbiased index in `0..n` built from big-endian bytes of `next_byte`.
pub fn random_index<F: FnMut() -> u8>(n: usize, next_byte: &mut F) -> Result<usize, PassGenError> {
    if n < 1 {
        return err("n must be positive");
    }
    if n == 1 {
        return Ok(0);
    }
    let n = n as u128;
    let mut k = 1u32;
    while 256u128.pow(k) < n {
        k += 1;
    }
    let limit = (256u128.pow(k) / n) * n;
    loop {
        let mut x = 0u128;
        for _ in 0..k {
            x = x * 256 + next_byte() as u128;
        }
        if x < limit {
            return Ok((x % n) as usize);
        }
    }
}

/// Builds a password of `length` (classes..=1024) with at least one character from each class.
pub fn generate_password<F: FnMut() -> u8>(
    length: usize,
    classes: &[&str],
    next_byte: &mut F,
    exclude_ambiguous: bool,
) -> Result<String, PassGenError> {
    let unique: HashSet<&&str> = classes.iter().collect();
    if classes.is_empty()
        || unique.len() != classes.len()
        || classes.iter().any(|c| class_set(c).is_none())
    {
        return err("bad classes");
    }
    if length < classes.len() || length > 1024 {
        return err("bad length");
    }
    let alph: Vec<Vec<u8>> = classes
        .iter()
        .map(|c| {
            class_set(c)
                .unwrap()
                .bytes()
                .filter(|ch| !(exclude_ambiguous && b"Il1O0o".contains(ch)))
                .collect()
        })
        .collect();
    let mut out = Vec::with_capacity(length);
    for a in &alph {
        out.push(a[random_index(a.len(), next_byte)?]);
    }
    let union: Vec<u8> = alph.concat();
    while out.len() < length {
        out.push(union[random_index(union.len(), next_byte)?]);
    }
    for i in (1..out.len()).rev() {
        let j = random_index(i + 1, next_byte)?;
        out.swap(i, j);
    }
    Ok(String::from_utf8(out).expect("ASCII alphabets"))
}

/// Joins `count` (1..=64) words drawn from at least 2 distinct non-empty words.
pub fn generate_passphrase<F: FnMut() -> u8>(
    words: &[&str],
    count: usize,
    separator: &str,
    next_byte: &mut F,
) -> Result<String, PassGenError> {
    let distinct: HashSet<&&str> = words.iter().collect();
    if !(1..=64).contains(&count) || distinct.len() < 2 || words.iter().any(|w| w.is_empty()) {
        return err("bad arguments");
    }
    let mut parts = Vec::with_capacity(count);
    for _ in 0..count {
        parts.push(words[random_index(words.len(), next_byte)?]);
    }
    Ok(parts.join(separator))
}

/// Returns `length * log2(alphabet_size)` rounded to 2 decimals.
pub fn entropy_bits(alphabet_size: usize, length: usize) -> Result<f64, PassGenError> {
    if alphabet_size < 1 {
        return err("alphabet size must be positive");
    }
    Ok((length as f64 * (alphabet_size as f64).log2() * 100.0).round() / 100.0)
}

/// Runs `f` with a byte source backed by the OS CSPRNG, failing if it was unavailable.
fn with_os_random<T>(
    f: impl FnOnce(&mut dyn FnMut() -> u8) -> Result<T, PassGenError>,
) -> Result<T, PassGenError> {
    let failed = Cell::new(false);
    let mut next = || {
        let mut b = [0u8; 1];
        if getrandom::fill(&mut b).is_err() {
            failed.set(true);
        }
        b[0]
    };
    let result = f(&mut next)?;
    if failed.get() {
        return err("random source unavailable");
    }
    Ok(result)
}

/// [`generate_password`] using the operating system CSPRNG.
pub fn password(
    length: usize,
    classes: &[&str],
    exclude_ambiguous: bool,
) -> Result<String, PassGenError> {
    with_os_random(|next| generate_password(length, classes, &mut || next(), exclude_ambiguous))
}

/// [`generate_passphrase`] using the operating system CSPRNG.
pub fn passphrase(words: &[&str], count: usize, separator: &str) -> Result<String, PassGenError> {
    with_os_random(|next| generate_passphrase(words, count, separator, &mut || next()))
}

#[cfg(test)]
#[allow(clippy::type_complexity, clippy::single_element_loop)] // generated vector tables
mod tests {
    // Generated from the wave 11 capability vectors; do not edit by hand.
    use super::*;

    fn source(h: &str) -> impl FnMut() -> u8 {
        let bytes: Vec<u8> = (0..h.len())
            .step_by(2)
            .map(|i| u8::from_str_radix(&h[i..i + 2], 16).unwrap())
            .collect();
        let mut i = 0;
        move || {
            let v = bytes[i % bytes.len()];
            i += 1;
            v
        }
    }

    #[test]
    fn random_index_vectors() {
        let cases: &[(usize, &str, [usize; 6])] = &[
            (10, "00ff10a37c55e2019b", [0, 6, 3, 4, 5, 6]),
            (300, "ffff0102a0b0", [258, 36, 258, 36, 258, 36]),
            (1, "00", [0, 0, 0, 0, 0, 0]),
            (256, "ab", [171, 171, 171, 171, 171, 171]),
            (62, "f0f8fc00", [54, 0, 54, 0, 54, 0]),
        ];
        for &(n, seed, want) in cases {
            let mut src = source(seed);
            let got: Vec<usize> = (0..6).map(|_| random_index(n, &mut src).unwrap()).collect();
            assert_eq!(got, want, "{n} {seed}");
        }
        assert!(random_index(0, &mut source("00")).is_err());
    }

    #[test]
    fn password_vectors() {
        let cases: &[(usize, &[&str], bool, &str, &str)] = &[
            (
                16,
                &["lower", "upper", "digits", "symbols"],
                false,
                "00ff10a37c55e2019b",
                "jl__j_ad3WbbdqQa",
            ),
            (
                12,
                &["lower", "digits"],
                true,
                "0102030405060708090a0b0c0d0e0f",
                "hkjibfmdnge4",
            ),
            (
                4,
                &["upper", "lower", "digits", "symbols"],
                false,
                "7f",
                "X7x#",
            ),
            (
                20,
                &["symbols"],
                false,
                "ffffffffffffffff00",
                "!!!!!!!!!!!!!!!!!!!!",
            ),
        ];
        for &(len, classes, amb, seed, want) in cases {
            assert_eq!(
                generate_password(len, classes, &mut source(seed), amb).as_deref(),
                Ok(want),
                "{seed}"
            );
        }
        let invalid: &[(usize, &[&str])] = &[
            (3, &["lower", "upper", "digits", "symbols"]),
            (8, &[]),
            (8, &["lower", "lower"]),
            (8, &["emoji"]),
            (1025, &["lower"]),
        ];
        for &(len, classes) in invalid {
            assert!(
                generate_password(len, classes, &mut source("00"), false).is_err(),
                "{len} {classes:?}"
            );
        }
    }

    #[test]
    fn passphrase_vectors() {
        let cases: &[(&[&str], usize, &str, &str, &str)] = &[
            (
                &["apple", "river", "stone", "cloud", "maple"],
                4,
                "-",
                "0102030405",
                "river-stone-cloud-maple",
            ),
            (&["a", "b"], 3, " ", "ff00", "b a b"),
        ];
        for &(words, count, sep, seed, want) in cases {
            assert_eq!(
                generate_passphrase(words, count, sep, &mut source(seed)).as_deref(),
                Ok(want),
                "{seed}"
            );
        }
        let invalid: &[(&[&str], usize)] = &[
            (&["a"], 3),
            (&["a", "b"], 0),
            (&["a", "b"], 65),
            (&["a", ""], 2),
        ];
        for &(words, count) in invalid {
            assert!(
                generate_passphrase(words, count, "-", &mut source("00")).is_err(),
                "{words:?} {count}"
            );
        }
    }

    #[test]
    fn entropy_vectors() {
        let cases: &[(usize, usize, f64)] = &[
            (76, 16, 99.97),
            (10, 6, 19.93),
            (7776, 5, 64.62),
            (2, 1, 1.0),
        ];
        for &(size, len, want) in cases {
            assert_eq!(entropy_bits(size, len), Ok(want), "{size} {len}");
        }
        assert!(entropy_bits(0, 4).is_err());
    }

    #[test]
    fn os_random() {
        let p = password(24, &DEFAULT_CLASSES, true).unwrap();
        assert_eq!(p.len(), 24);
        assert!(!p.contains(['I', 'l', '1', 'O', '0', 'o']));
        assert_eq!(passphrase(&["a", "b", "c"], 6, "-").unwrap().len(), 11);
    }
}
