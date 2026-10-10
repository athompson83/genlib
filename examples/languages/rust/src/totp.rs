// SPDX-License-Identifier: Apache-2.0

//! HOTP (RFC 4226) and TOTP (RFC 6238) one-time passwords, RFC 4648 base32
//! secrets and `otpauth://` provisioning URIs. HMAC and SHA come from the
//! RustCrypto `hmac`, `sha1` and `sha2` crates; randomness from `getrandom`.

use hmac::{Hmac, Mac};
use std::fmt;

/// HMAC hash used to derive codes.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Algorithm {
    Sha1,
    Sha256,
    Sha512,
}

impl Algorithm {
    pub fn name(self) -> &'static str {
        match self {
            Algorithm::Sha1 => "SHA1",
            Algorithm::Sha256 => "SHA256",
            Algorithm::Sha512 => "SHA512",
        }
    }
}

/// Errors returned by this module.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum TotpError {
    InvalidDigits,
    InvalidStep,
    TimeBeforeT0,
    EmptySecret,
    InvalidBase32,
    InvalidLabel,
    InvalidLength,
    Random,
}

impl fmt::Display for TotpError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(match self {
            TotpError::InvalidDigits => "digits must be between 6 and 8",
            TotpError::InvalidStep => "step must be positive",
            TotpError::TimeBeforeT0 => "time is before T0",
            TotpError::EmptySecret => "secret must not be empty",
            TotpError::InvalidBase32 => "invalid base32 input",
            TotpError::InvalidLabel => {
                "issuer and account must be non-empty and must not contain ':'"
            }
            TotpError::InvalidLength => "secret length must be between 1 and 1024 bytes",
            TotpError::Random => "random source failed",
        })
    }
}

impl std::error::Error for TotpError {}

/// TOTP parameters. `Options::default()` is 6 digits, 30 s step, SHA1, T0 = 0.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Options {
    pub digits: u32,
    pub step: u64,
    pub algorithm: Algorithm,
    pub t0: u64,
}

impl Default for Options {
    fn default() -> Self {
        Options {
            digits: 6,
            step: 30,
            algorithm: Algorithm::Sha1,
            t0: 0,
        }
    }
}

fn hmac_digest(algorithm: Algorithm, key: &[u8], msg: &[u8]) -> Vec<u8> {
    // HMAC accepts keys of any length, so new_from_slice cannot fail here.
    match algorithm {
        Algorithm::Sha1 => {
            let mut m =
                Hmac::<sha1::Sha1>::new_from_slice(key).expect("HMAC accepts any key length");
            m.update(msg);
            m.finalize().into_bytes().to_vec()
        }
        Algorithm::Sha256 => {
            let mut m =
                Hmac::<sha2::Sha256>::new_from_slice(key).expect("HMAC accepts any key length");
            m.update(msg);
            m.finalize().into_bytes().to_vec()
        }
        Algorithm::Sha512 => {
            let mut m =
                Hmac::<sha2::Sha512>::new_from_slice(key).expect("HMAC accepts any key length");
            m.update(msg);
            m.finalize().into_bytes().to_vec()
        }
    }
}

/// RFC 4226 HOTP code for `counter`, zero-padded to `digits` (6..=8).
pub fn hotp(
    secret: &[u8],
    counter: u64,
    digits: u32,
    algorithm: Algorithm,
) -> Result<String, TotpError> {
    if secret.is_empty() {
        return Err(TotpError::EmptySecret);
    }
    if !(6..=8).contains(&digits) {
        return Err(TotpError::InvalidDigits);
    }
    let sum = hmac_digest(algorithm, secret, &counter.to_be_bytes());
    let offset = (sum[sum.len() - 1] & 0x0f) as usize;
    let bin = u32::from_be_bytes([
        sum[offset],
        sum[offset + 1],
        sum[offset + 2],
        sum[offset + 3],
    ]) & 0x7fff_ffff;
    let code = bin % 10u32.pow(digits);
    Ok(format!("{:0width$}", code, width = digits as usize))
}

fn counter_at(unix_seconds: u64, opts: &Options) -> Result<u64, TotpError> {
    if opts.step == 0 {
        return Err(TotpError::InvalidStep);
    }
    if unix_seconds < opts.t0 {
        return Err(TotpError::TimeBeforeT0);
    }
    Ok((unix_seconds - opts.t0) / opts.step)
}

/// RFC 6238 TOTP code at `unix_seconds`.
pub fn totp(secret: &[u8], unix_seconds: u64, opts: &Options) -> Result<String, TotpError> {
    let counter = counter_at(unix_seconds, opts)?;
    hotp(secret, counter, opts.digits, opts.algorithm)
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

/// Accepts `code` if it matches any counter within ±`window` steps. Wrong
/// length or non-digit codes are rejected; each candidate is compared in
/// constant time and all candidates are checked.
pub fn verify_totp(
    code: &str,
    secret: &[u8],
    unix_seconds: u64,
    window: u32,
    opts: &Options,
) -> bool {
    if window > 10
        || code.len() != opts.digits as usize
        || !code.bytes().all(|c| c.is_ascii_digit())
    {
        return false;
    }
    let counter = match counter_at(unix_seconds, opts) {
        Ok(c) => c,
        Err(_) => return false,
    };
    let mut matched = false;
    let low = counter.saturating_sub(window as u64);
    let high = counter.saturating_add(window as u64);
    for c in low..=high {
        match hotp(secret, c, opts.digits, opts.algorithm) {
            Ok(candidate) => matched |= ct_eq(candidate.as_bytes(), code.as_bytes()),
            Err(_) => return false,
        }
    }
    matched
}

const B32: &[u8; 32] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

/// RFC 4648 base32 without padding.
pub fn base32_encode(data: &[u8]) -> String {
    let mut out = String::with_capacity((data.len() * 8).div_ceil(5));
    let (mut buffer, mut bits) = (0u32, 0u32);
    for &b in data {
        buffer = (buffer << 8) | b as u32;
        bits += 8;
        while bits >= 5 {
            bits -= 5;
            out.push(B32[((buffer >> bits) & 31) as usize] as char);
        }
    }
    if bits > 0 {
        out.push(B32[((buffer << (5 - bits)) & 31) as usize] as char);
    }
    out
}

/// Decodes RFC 4648 base32 case-insensitively, ignoring spaces, hyphens and
/// trailing `=`. Invalid characters or impossible lengths are errors.
pub fn base32_decode(input: &str) -> Result<Vec<u8>, TotpError> {
    let cleaned: Vec<u8> = input.bytes().filter(|&c| c != b' ' && c != b'-').collect();
    let end = cleaned
        .iter()
        .rposition(|&c| c != b'=')
        .map_or(0, |i| i + 1);
    let cleaned = &cleaned[..end];
    if matches!(cleaned.len() % 8, 1 | 3 | 6) {
        return Err(TotpError::InvalidBase32);
    }
    let mut out = Vec::with_capacity(cleaned.len() * 5 / 8);
    let (mut buffer, mut bits) = (0u32, 0u32);
    for &c in cleaned {
        let v = match c.to_ascii_uppercase() {
            u @ b'A'..=b'Z' => u - b'A',
            d @ b'2'..=b'7' => d - b'2' + 26,
            _ => return Err(TotpError::InvalidBase32),
        };
        buffer = (buffer << 5) | v as u32;
        bits += 5;
        if bits >= 8 {
            bits -= 8;
            out.push((buffer >> bits) as u8);
        }
    }
    Ok(out)
}

/// Returns `n` bytes from the operating system CSPRNG (1..=1024).
pub fn generate_secret(n: usize) -> Result<Vec<u8>, TotpError> {
    if n == 0 || n > 1024 {
        return Err(TotpError::InvalidLength);
    }
    let mut buf = vec![0u8; n];
    getrandom::fill(&mut buf).map_err(|_| TotpError::Random)?;
    Ok(buf)
}

fn percent_encode(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    for b in s.bytes() {
        if b.is_ascii_alphanumeric() || matches!(b, b'-' | b'.' | b'_' | b'~') {
            out.push(b as char);
        } else {
            out.push_str(&format!("%{:02X}", b));
        }
    }
    out
}

/// Builds an `otpauth://totp/...` provisioning URI (spaces encode as %20).
pub fn otpauth_uri(
    issuer: &str,
    account: &str,
    secret_base32: &str,
    digits: u32,
    period: u64,
    algorithm: Algorithm,
) -> Result<String, TotpError> {
    if !(6..=8).contains(&digits) {
        return Err(TotpError::InvalidDigits);
    }
    if period == 0 {
        return Err(TotpError::InvalidStep);
    }
    if issuer.is_empty() || account.is_empty() || issuer.contains(':') || account.contains(':') {
        return Err(TotpError::InvalidLabel);
    }
    if secret_base32.is_empty() || base32_decode(secret_base32).is_err() {
        return Err(TotpError::InvalidBase32);
    }
    Ok(format!(
        "otpauth://totp/{}:{}?secret={}&issuer={}&algorithm={}&digits={}&period={}",
        percent_encode(issuer),
        percent_encode(account),
        secret_base32,
        percent_encode(issuer),
        algorithm.name(),
        digits,
        period
    ))
}

#[cfg(test)]
mod tests {
    use super::*;

    const S20: &[u8] = b"12345678901234567890";
    const S32: &[u8] = b"12345678901234567890123456789012";
    const S64: &[u8] = b"1234567890123456789012345678901234567890123456789012345678901234";

    #[test]
    fn hotp_rfc4226() {
        let want = [
            "755224", "287082", "359152", "969429", "338314", "254676", "287922", "162583",
            "399871", "520489",
        ];
        for (i, w) in want.iter().enumerate() {
            assert_eq!(
                hotp(S20, i as u64, 6, Algorithm::Sha1).unwrap(),
                *w,
                "counter {i}"
            );
        }
    }

    #[test]
    fn totp_rfc6238() {
        let cases: [(u64, &str, &str, &str); 6] = [
            (59, "94287082", "46119246", "90693936"),
            (1111111109, "07081804", "68084774", "25091201"),
            (1111111111, "14050471", "67062674", "99943326"),
            (1234567890, "89005924", "91819424", "93441116"),
            (2000000000, "69279037", "90698825", "38618901"),
            (20000000000, "65353130", "77737706", "47863826"),
        ];
        for (t, a, b, c) in cases {
            for (alg, secret, want) in [
                (Algorithm::Sha1, S20, a),
                (Algorithm::Sha256, S32, b),
                (Algorithm::Sha512, S64, c),
            ] {
                let opts = Options {
                    digits: 8,
                    algorithm: alg,
                    ..Options::default()
                };
                assert_eq!(totp(secret, t, &opts).unwrap(), want, "t={t} {alg:?}");
            }
        }
    }

    #[test]
    fn base32_vectors() {
        assert_eq!(base32_encode(b"foobar"), "MZXW6YTBOI");
        assert_eq!(base32_decode("mzxw 6ytb-oi==").unwrap(), b"foobar");
        assert_eq!(base32_decode("MZ1"), Err(TotpError::InvalidBase32));
        let secret = generate_secret(20).unwrap();
        assert_eq!(base32_decode(&base32_encode(&secret)).unwrap(), secret);
    }

    #[test]
    fn verify_window_and_format() {
        let opts = Options {
            digits: 8,
            ..Options::default()
        };
        let code = totp(S20, 59, &opts).unwrap();
        assert!(verify_totp(&code, S20, 59, 1, &opts));
        assert!(verify_totp(&code, S20, 89, 1, &opts));
        assert!(!verify_totp(&code, S20, 150, 1, &opts));
        assert!(!verify_totp("abc", S20, 59, 1, &opts));
        assert!(!verify_totp("1234567", S20, 59, 1, &opts));
        assert!(!verify_totp("9428708a", S20, 59, 1, &opts));
    }

    #[test]
    fn otpauth_uri_vector() {
        assert_eq!(
            otpauth_uri("Acme Co", "alice@example.com", "JBSWY3DPEHPK3PXP", 6, 30, Algorithm::Sha1).unwrap(),
            "otpauth://totp/Acme%20Co:alice%40example.com?secret=JBSWY3DPEHPK3PXP&issuer=Acme%20Co&algorithm=SHA1&digits=6&period=30"
        );
    }

    #[test]
    fn secrets_and_invalid_options() {
        let a = generate_secret(20).unwrap();
        assert_eq!(a.len(), 20);
        assert_ne!(a, generate_secret(20).unwrap());
        assert_eq!(generate_secret(0), Err(TotpError::InvalidLength));
        assert_eq!(
            hotp(S20, 0, 5, Algorithm::Sha1),
            Err(TotpError::InvalidDigits)
        );
        assert_eq!(
            totp(
                S20,
                1,
                &Options {
                    t0: 10,
                    ..Options::default()
                }
            ),
            Err(TotpError::TimeBeforeT0)
        );
    }
}
