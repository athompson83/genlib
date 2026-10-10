// SPDX-License-Identifier: Apache-2.0

//! Time-ordered identifiers: UUIDv7 (RFC 9562) and ULID (Crockford base32).
//! The pure functions take the timestamp and 10 random bytes so output is
//! deterministic; `new_uuid_v7`/`new_ulid` use the OS CSPRNG and system clock.

use std::fmt;
use std::time::{SystemTime, UNIX_EPOCH};

/// Largest timestamp that fits in 48 bits.
pub const MAX_UNIX_MS: u64 = (1 << 48) - 1;
const CROCKFORD: &[u8; 32] = b"0123456789ABCDEFGHJKMNPQRSTVWXYZ";

/// Validation, parse or randomness error with a human-readable message.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct IdError(pub String);

impl fmt::Display for IdError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(&self.0)
    }
}

impl std::error::Error for IdError {}

fn err<T>(m: impl Into<String>) -> Result<T, IdError> {
    Err(IdError(m.into()))
}

fn check(unix_ms: u64, random: &[u8]) -> Result<(), IdError> {
    if unix_ms > MAX_UNIX_MS {
        return err("unixMs must be between 0 and 2^48-1");
    }
    if random.len() != 10 {
        return err("random must be exactly 10 bytes");
    }
    Ok(())
}

/// UUIDv7: 48-bit big-endian unix milliseconds, then the random bytes with the
/// version (7) and RFC variant (0b10) bits set. Lowercase, dashed.
pub fn uuid_v7(unix_ms: u64, random: &[u8]) -> Result<String, IdError> {
    check(unix_ms, random)?;
    let mut b = [0u8; 16];
    b[..6].copy_from_slice(&unix_ms.to_be_bytes()[2..]);
    b[6..].copy_from_slice(random);
    b[6] = (b[6] & 0x0f) | 0x70;
    b[8] = (b[8] & 0x3f) | 0x80;
    let mut out = String::with_capacity(36);
    for (i, byte) in b.iter().enumerate() {
        if matches!(i, 4 | 6 | 8 | 10) {
            out.push('-');
        }
        out.push_str(&format!("{byte:02x}"));
    }
    Ok(out)
}

/// ULID: (unixMs << 80) | random as a 128-bit big-endian integer, 26 Crockford base32 characters.
pub fn ulid(unix_ms: u64, random: &[u8]) -> Result<String, IdError> {
    check(unix_ms, random)?;
    let mut value = (unix_ms as u128) << 80;
    for (i, &byte) in random.iter().enumerate() {
        value |= (byte as u128) << (72 - 8 * i);
    }
    Ok((0..26).map(|i| CROCKFORD[((value >> (125 - 5 * i)) & 31) as usize] as char).collect())
}

/// Returns the unix milliseconds of a UUIDv7 (case-insensitive); rejects other versions and variants.
pub fn uuid_v7_time(text: &str) -> Result<u64, IdError> {
    let bytes = text.as_bytes();
    if bytes.len() != 36 {
        return err("UUID must be 36 characters");
    }
    let mut hex = Vec::with_capacity(32);
    for (i, &c) in bytes.iter().enumerate() {
        if matches!(i, 8 | 13 | 18 | 23) {
            if c != b'-' {
                return err("UUID dashes must be at positions 8, 13, 18 and 23");
            }
        } else {
            match (c as char).to_digit(16) {
                Some(d) => hex.push(d as u64),
                None => return err("UUID contains a non-hex character"),
            }
        }
    }
    if hex[12] != 7 {
        return err("not a version 7 UUID");
    }
    if hex[16] & 0b1100 != 0b1000 {
        return err("UUID variant is not RFC 9562");
    }
    Ok(hex[..12].iter().fold(0u64, |acc, d| (acc << 4) | d))
}

/// Returns the unix milliseconds of a ULID (case-insensitive Crockford base32).
pub fn ulid_time(text: &str) -> Result<u64, IdError> {
    let bytes = text.as_bytes();
    if bytes.len() != 26 {
        return err("ULID must be 26 characters");
    }
    if bytes[0] > b'7' {
        return err("ULID first character must be 0-7");
    }
    let mut value: u128 = 0;
    for &c in bytes {
        let Some(d) = CROCKFORD.iter().position(|&a| a == c.to_ascii_uppercase()) else {
            return err("ULID contains a non-Crockford character");
        };
        value = (value << 5) | d as u128;
    }
    Ok((value >> 80) as u64)
}

fn now_and_random() -> Result<(u64, [u8; 10]), IdError> {
    let ms = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|_| IdError("system clock is before 1970".into()))?
        .as_millis();
    let ms = u64::try_from(ms).map_err(|_| IdError("system clock out of range".into()))?;
    let mut random = [0u8; 10];
    getrandom::fill(&mut random).map_err(|_| IdError("random source unavailable".into()))?;
    Ok((ms, random))
}

/// New UUIDv7 from the system clock and the OS CSPRNG.
pub fn new_uuid_v7() -> Result<String, IdError> {
    let (ms, random) = now_and_random()?;
    uuid_v7(ms, &random)
}

/// New ULID from the system clock and the OS CSPRNG.
pub fn new_ulid() -> Result<String, IdError> {
    let (ms, random) = now_and_random()?;
    ulid(ms, &random)
}

#[cfg(test)]
mod tests {
    use super::*;

    const R: [u8; 10] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

    #[test]
    fn vectors() {
        assert_eq!(uuid_v7(1790000000123, &R).unwrap(), "01a0c450-6c7b-7102-8304-05060708090a");
        assert_eq!(ulid(1790000000123, &R).unwrap(), "01M3250V3V041061050R3GG28A");
        assert_eq!(uuid_v7(0, &[0; 10]).unwrap(), "00000000-0000-7000-8000-000000000000");
        assert_eq!(ulid(MAX_UNIX_MS, &[0xff; 10]).unwrap(), "7ZZZZZZZZZZZZZZZZZZZZZZZZZ");
    }

    #[test]
    fn round_trip_times() {
        assert_eq!(uuid_v7_time("01a0c450-6c7b-7102-8304-05060708090a").unwrap(), 1790000000123);
        assert_eq!(uuid_v7_time("01A0C450-6C7B-7102-8304-05060708090A").unwrap(), 1790000000123);
        assert_eq!(uuid_v7_time("00000000-0000-7000-8000-000000000000").unwrap(), 0);
        assert_eq!(ulid_time("01M3250V3V041061050R3GG28A").unwrap(), 1790000000123);
        assert_eq!(ulid_time("01m3250v3v041061050r3gg28a").unwrap(), 1790000000123);
        assert_eq!(ulid_time("7ZZZZZZZZZZZZZZZZZZZZZZZZZ").unwrap(), MAX_UNIX_MS);
    }

    #[test]
    fn rejections() {
        assert!(uuid_v7(MAX_UNIX_MS + 1, &R).is_err());
        assert!(uuid_v7(0, &[0; 9]).is_err());
        assert!(ulid(0, &[0; 11]).is_err());
        assert!(uuid_v7_time("01a0c450-6c7b-4102-8304-05060708090a").is_err());
        assert!(uuid_v7_time("01a0c450-6c7b-7102-c304-05060708090a").is_err());
        assert!(uuid_v7_time("01a0c450-6c7b-7102-8304-05060708090").is_err());
        assert!(uuid_v7_time("01a0c450x6c7b-7102-8304-05060708090a").is_err());
        assert!(uuid_v7_time("01a0c450-6c7b-7102-8304-05060708090g").is_err());
        assert!(ulid_time("8ZZZZZZZZZZZZZZZZZZZZZZZZZ").is_err());
        assert!(ulid_time("01M3250V3V041061050R3GG28").is_err());
        assert!(ulid_time("01M3250V3V041061050R3GG28U").is_err());
    }

    #[test]
    fn generated() {
        let (a, b) = (new_uuid_v7().unwrap(), new_uuid_v7().unwrap());
        assert_ne!(a, b);
        assert!(uuid_v7_time(&a).is_ok());
        let (u, v) = (new_ulid().unwrap(), new_ulid().unwrap());
        assert_ne!(u, v);
        assert_eq!(u.len(), 26);
        assert!(ulid_time(&u).unwrap() > 1_700_000_000_000);
    }
}
