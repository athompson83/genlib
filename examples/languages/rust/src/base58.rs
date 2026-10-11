// SPDX-License-Identifier: Apache-2.0

//! Base58 with the Bitcoin alphabet and Base58Check (payload plus the first 4
//! bytes of SHA-256(SHA-256(payload))). The number conversion works directly
//! on byte vectors, so no big-integer type is needed; SHA-256 comes from the
//! `sha2` crate already pinned in this package. Leading zero bytes map to
//! leading '1' characters and back.

use sha2::{Digest, Sha256};
use std::fmt;

const ALPHABET: &[u8; 58] = b"123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

/// Invalid Base58 text or a Base58Check checksum failure.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Base58Error(pub String);

impl fmt::Display for Base58Error {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "base58: {}", self.0)
    }
}

impl std::error::Error for Base58Error {}

/// Returns the Base58 text for `bytes`; an empty slice encodes to "".
pub fn base58_encode(bytes: &[u8]) -> String {
    let zeros = bytes.iter().take_while(|&&b| b == 0).count();
    let mut digits: Vec<u8> = Vec::new(); // base 58, little-endian
    for &v in &bytes[zeros..] {
        let mut carry = v as u32;
        for d in digits.iter_mut() {
            carry += (*d as u32) << 8;
            *d = (carry % 58) as u8;
            carry /= 58;
        }
        while carry > 0 {
            digits.push((carry % 58) as u8);
            carry /= 58;
        }
    }
    let mut out = "1".repeat(zeros);
    out.extend(digits.iter().rev().map(|&d| ALPHABET[d as usize] as char));
    out
}

/// Parses Base58 text; any character outside the alphabet is an error and "" decodes to an empty vector.
pub fn base58_decode(s: &str) -> Result<Vec<u8>, Base58Error> {
    let zeros = s.bytes().take_while(|&b| b == b'1').count();
    let mut body: Vec<u8> = Vec::new(); // base 256, little-endian
    for c in s.chars() {
        let idx = if c.is_ascii() {
            ALPHABET.iter().position(|&a| a == c as u8)
        } else {
            None
        };
        let mut carry = match idx {
            Some(i) => i as u32,
            None => return Err(Base58Error("invalid base58 character".into())),
        };
        for b in body.iter_mut() {
            carry += (*b as u32) * 58;
            *b = (carry & 0xff) as u8;
            carry >>= 8;
        }
        while carry > 0 {
            body.push((carry & 0xff) as u8);
            carry >>= 8;
        }
    }
    let mut out = vec![0u8; zeros];
    out.extend(body.iter().rev());
    Ok(out)
}

fn checksum(p: &[u8]) -> [u8; 4] {
    let second = Sha256::digest(Sha256::digest(p));
    [second[0], second[1], second[2], second[3]]
}

/// Returns Base58(payload + 4-byte double SHA-256 checksum).
pub fn base58_check_encode(payload: &[u8]) -> String {
    let mut buf = payload.to_vec();
    buf.extend_from_slice(&checksum(payload));
    base58_encode(&buf)
}

/// Decodes Base58Check text, verifies the checksum and returns the payload.
pub fn base58_check_decode(s: &str) -> Result<Vec<u8>, Base58Error> {
    let b = base58_decode(s)?;
    if b.len() < 4 {
        return Err(Base58Error("too short for a checksum".into()));
    }
    let (p, c) = b.split_at(b.len() - 4);
    if checksum(p) != c {
        return Err(Base58Error("checksum mismatch".into()));
    }
    Ok(p.to_vec())
}

#[cfg(test)]
#[allow(clippy::type_complexity, clippy::single_element_loop)] // generated vector tables
mod tests {
    // Generated from the wave 11 capability vectors; do not edit by hand.
    use super::*;

    fn hex(s: &str) -> Vec<u8> {
        (0..s.len())
            .step_by(2)
            .map(|i| u8::from_str_radix(&s[i..i + 2], 16).unwrap())
            .collect()
    }

    #[test]
    fn encode_vectors() {
        let cases: &[(&str, &str)] = &[
            ("", ""),
            ("00", "1"),
            ("000001", "112"),
            ("68656c6c6f20776f726c64", "StV1DL6CwTryKyV"),
            ("00010203040506070809", "1kA3B2yGe2z4"),
            ("ffffffffffffffff", "jpXCZedGfVQ"),
            ("000068656c6c6f", "11Cn8eVZg"),
        ];
        for &(h, text) in cases {
            assert_eq!(base58_encode(&hex(h)), text, "{h}");
            assert_eq!(base58_decode(text), Ok(hex(h)), "{text}");
        }
    }

    #[test]
    fn check_vectors() {
        let cases: &[(&str, &str)] = &[
            (
                "00f54a5851e9372b87810a8e60cdd2e7cfd80b6e31",
                "1PMycacnJaSqwwJqjawXBErnLsZ7RkXUAs",
            ),
            (
                "801111111111111111111111111111111111111111111111111111111111111111",
                "5HwoXVkHoRM8sL2KmNRS217n1g8mPPBomrY7yehCuXC1115WWsh",
            ),
            ("", "3QJmnh"),
        ];
        for &(h, text) in cases {
            assert_eq!(base58_check_encode(&hex(h)), text, "{h}");
            assert_eq!(base58_check_decode(text), Ok(hex(h)), "{text}");
        }
    }

    #[test]
    fn invalid_vectors() {
        for s in ["0OIl", "abc+"] {
            assert!(base58_decode(s).is_err(), "{s:?}");
        }
        for s in ["1PMycacnJaSqwwJqjawXBErnLsZ7RkXUAt", "1", ""] {
            assert!(base58_check_decode(s).is_err(), "{s:?}");
        }
    }
}
