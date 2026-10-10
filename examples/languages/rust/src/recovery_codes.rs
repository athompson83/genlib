// SPDX-License-Identifier: Apache-2.0

//! MFA backup (recovery) codes: generation, normalization, keyed hashing
//! (HMAC-SHA256) and constant-time lookup. Codes use Crockford base32
//! without I, L, O and U; store only the keyed hashes.

use hmac::{Hmac, Mac};
use sha2::Sha256;
use std::collections::HashSet;
use std::fmt;

/// Crockford base32 without I, L, O and U.
pub const ALPHABET: &[u8; 32] = b"0123456789ABCDEFGHJKMNPQRSTVWXYZ";

/// Code shape, e.g. 2 groups of 5 characters ("7K3QX-9MNP2").
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Format {
    pub groups: usize,
    pub group_length: usize,
}

impl Default for Format {
    fn default() -> Self {
        Format {
            groups: 2,
            group_length: 5,
        }
    }
}

impl Format {
    fn length(&self) -> Result<usize, RecoveryCodeError> {
        let n = self.groups.checked_mul(self.group_length).unwrap_or(0);
        if self.groups == 0 || self.group_length == 0 || n > 64 {
            return Err(RecoveryCodeError::InvalidFormat);
        }
        Ok(n)
    }
}

/// Errors returned by this module.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum RecoveryCodeError {
    InvalidFormat,
    InvalidCount,
    InvalidCode,
    EmptyKey,
    Random,
}

impl fmt::Display for RecoveryCodeError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(match self {
            RecoveryCodeError::InvalidFormat => "invalid recovery code format",
            RecoveryCodeError::InvalidCount => "count must be between 1 and 1000",
            RecoveryCodeError::InvalidCode => "invalid recovery code",
            RecoveryCodeError::EmptyKey => "key must not be empty",
            RecoveryCodeError::Random => "random source failed",
        })
    }
}

impl std::error::Error for RecoveryCodeError {}

/// `count` unique random codes. Each symbol uses the low five bits of a
/// random byte, so selection from the 32-symbol alphabet is unbiased.
pub fn generate_recovery_codes(
    count: usize,
    format: Format,
) -> Result<Vec<String>, RecoveryCodeError> {
    let n = format.length()?;
    if count == 0 || count > 1000 {
        return Err(RecoveryCodeError::InvalidCount);
    }
    let mut seen = HashSet::with_capacity(count);
    let mut codes = Vec::with_capacity(count);
    let mut buf = vec![0u8; n];
    let mut attempts = 0;
    while codes.len() < count {
        attempts += 1;
        if attempts > count * 100 {
            return Err(RecoveryCodeError::Random);
        }
        getrandom::fill(&mut buf).map_err(|_| RecoveryCodeError::Random)?;
        let mut code = String::with_capacity(n + format.groups);
        for (i, b) in buf.iter().enumerate() {
            if i > 0 && i % format.group_length == 0 {
                code.push('-');
            }
            code.push(ALPHABET[(b & 31) as usize] as char);
        }
        if seen.insert(code.clone()) {
            codes.push(code);
        }
    }
    Ok(codes)
}

/// Uppercases, removes spaces and hyphens, maps O→0 and I/L→1, then checks
/// the alphabet and the expected length.
pub fn normalize_recovery_code(input: &str, format: Format) -> Result<String, RecoveryCodeError> {
    let n = format.length()?;
    let mut out = String::with_capacity(n);
    for c in input.chars() {
        let c = match c.to_ascii_uppercase() {
            ' ' | '-' => continue,
            'O' => '0',
            'I' | 'L' => '1',
            other => other,
        };
        if !c.is_ascii() || !ALPHABET.contains(&(c as u8)) {
            return Err(RecoveryCodeError::InvalidCode);
        }
        out.push(c);
    }
    if out.len() != n {
        return Err(RecoveryCodeError::InvalidCode);
    }
    Ok(out)
}

/// Lowercase hex HMAC-SHA256(key, normalized code).
pub fn hash_recovery_code(
    code: &str,
    key: &[u8],
    format: Format,
) -> Result<String, RecoveryCodeError> {
    if key.is_empty() {
        return Err(RecoveryCodeError::EmptyKey);
    }
    let normalized = normalize_recovery_code(code, format)?;
    let mut mac = Hmac::<Sha256>::new_from_slice(key).expect("HMAC accepts any key length");
    mac.update(normalized.as_bytes());
    Ok(mac
        .finalize()
        .into_bytes()
        .iter()
        .map(|b| format!("{b:02x}"))
        .collect())
}

fn ct_eq(a: &[u8], b: &[u8]) -> bool {
    if a.len() != b.len() {
        return false;
    }
    let mut diff = 0u8;
    for (x, y) in a.iter().zip(b) {
        diff |= x ^ y;
    }
    std::hint::black_box(diff) == 0
}

/// Index of the stored hash matching `input`, or `None`. Every stored hash is
/// compared in constant time and the loop never exits early.
pub fn find_recovery_code(
    input: &str,
    stored_hashes: &[&str],
    key: &[u8],
    format: Format,
) -> Option<usize> {
    let hash = hash_recovery_code(input, key, format).ok()?;
    let mut found = usize::MAX;
    for (i, stored) in stored_hashes.iter().enumerate() {
        let mask = 0usize
            .wrapping_sub(ct_eq(hash.as_bytes(), stored.to_ascii_lowercase().as_bytes()) as usize);
        found = (i & mask) | (found & !mask);
    }
    (found != usize::MAX).then_some(found)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn is_code(s: &str) -> bool {
        regex::Regex::new(r"^[0-9A-HJKMNP-TV-Z]{5}-[0-9A-HJKMNP-TV-Z]{5}$")
            .unwrap()
            .is_match(s)
    }

    #[test]
    fn normalize() {
        let f = Format::default();
        assert_eq!(
            normalize_recovery_code(" 7k3qx-9mnp2 ", f).unwrap(),
            "7K3QX9MNP2"
        );
        assert_eq!(
            normalize_recovery_code("ABCDE-FGHIO", f).unwrap(),
            "ABCDEFGH10"
        );
        assert_eq!(
            normalize_recovery_code("ABCDE-FGHIU", f),
            Err(RecoveryCodeError::InvalidCode)
        );
        assert_eq!(
            normalize_recovery_code("ABC", f),
            Err(RecoveryCodeError::InvalidCode)
        );
        assert_eq!(
            normalize_recovery_code("ABCDE-FGHÉ1", f),
            Err(RecoveryCodeError::InvalidCode)
        );
    }

    #[test]
    fn hash_vector() {
        // Cross-checked with Python hmac.new(b'pepper', b'7K3QX9MNP2', hashlib.sha256).hexdigest().
        assert_eq!(
            hash_recovery_code("7K3QX-9MNP2", b"pepper", Format::default()).unwrap(),
            "b6a0f9ca8ffdc4e8e3268b490bb8beeda45f367550751b8cb151636dad869138"
        );
        assert_eq!(
            hash_recovery_code("7K3QX-9MNP2", b"", Format::default()),
            Err(RecoveryCodeError::EmptyKey)
        );
    }

    #[test]
    fn generate_and_find() {
        let f = Format::default();
        let codes = generate_recovery_codes(10, f).unwrap();
        assert_eq!(codes.len(), 10);
        assert!(codes.iter().all(|c| is_code(c)), "{codes:?}");
        assert_eq!(codes.iter().collect::<HashSet<_>>().len(), 10);
        let hashes: Vec<String> = codes[..3]
            .iter()
            .map(|c| hash_recovery_code(c, b"pepper", f).unwrap())
            .collect();
        let refs: Vec<&str> = hashes.iter().map(String::as_str).collect();
        assert_eq!(find_recovery_code(&codes[2], &refs, b"pepper", f), Some(2));
        assert_eq!(find_recovery_code(&codes[5], &refs, b"pepper", f), None);
        assert_eq!(find_recovery_code("bad", &refs, b"pepper", f), None);
    }
}
