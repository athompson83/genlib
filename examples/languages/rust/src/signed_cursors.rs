// SPDX-License-Identifier: Apache-2.0

//! HMAC-SHA256 signed, expiring pagination cursors. Token format:
//! `base64url(body) "." base64url(mac)` (no padding), where body is
//! `"v1\n" + expiresAt + "\n" + values.join("\n")`. HMAC-SHA256 comes from the
//! RustCrypto `hmac` and `sha2` crates already used by `totp`.

use hmac::{Hmac, Mac};
use sha2::Sha256;
use std::fmt;

const B64URL: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
pub const MIN_SECRET_BYTES: usize = 32;
pub const MAX_VALUES: usize = 16;

/// Distinguishes caller mistakes from the three token failure kinds.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum CursorError {
    InvalidArgument(String),
    Malformed(String),
    BadSignature,
    Expired,
}

impl fmt::Display for CursorError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            CursorError::InvalidArgument(m) => write!(f, "invalid argument: {m}"),
            CursorError::Malformed(m) => write!(f, "malformed: {m}"),
            CursorError::BadSignature => f.write_str("bad signature"),
            CursorError::Expired => f.write_str("expired"),
        }
    }
}

impl std::error::Error for CursorError {}

fn malformed<T>(m: &str) -> Result<T, CursorError> {
    Err(CursorError::Malformed(m.into()))
}

fn check_secret(secret: &[u8]) -> Result<(), CursorError> {
    if secret.len() < MIN_SECRET_BYTES {
        return Err(CursorError::InvalidArgument(format!("secret must be at least {MIN_SECRET_BYTES} bytes")));
    }
    Ok(())
}

fn mac(secret: &[u8], body: &[u8]) -> Vec<u8> {
    let mut m = Hmac::<Sha256>::new_from_slice(secret).expect("HMAC accepts any key length");
    m.update(body);
    m.finalize().into_bytes().to_vec()
}

fn b64_encode(data: &[u8]) -> String {
    let mut out = String::with_capacity((data.len() * 4).div_ceil(3));
    for chunk in data.chunks(3) {
        let n = chunk.iter().enumerate().fold(0u32, |acc, (i, &b)| acc | (b as u32) << (16 - 8 * i));
        for i in 0..=chunk.len() {
            out.push(B64URL[((n >> (18 - 6 * i)) & 63) as usize] as char);
        }
    }
    out
}

/// Unpadded base64url: rejects `=`, other characters and impossible lengths;
/// `strict` also rejects non-zero trailing bits.
fn b64_decode(s: &str, strict: bool) -> Option<Vec<u8>> {
    if s.is_empty() || s.len() % 4 == 1 {
        return None;
    }
    let mut out = Vec::with_capacity(s.len() * 3 / 4);
    let (mut acc, mut bits) = (0u32, 0u32);
    for b in s.bytes() {
        let v = B64URL.iter().position(|&c| c == b)? as u32;
        acc = (acc << 6) | v;
        bits += 6;
        if bits >= 8 {
            bits -= 8;
            out.push((acc >> bits) as u8);
            acc &= (1 << bits) - 1;
        }
    }
    (!strict || acc == 0).then_some(out)
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

/// Signs `values` (1..=16, none containing `\n`) with an expiry in unix seconds.
pub fn encode_cursor<S: AsRef<str>>(values: &[S], secret: &[u8], expires_at: i64) -> Result<String, CursorError> {
    check_secret(secret)?;
    if values.is_empty() || values.len() > MAX_VALUES {
        return Err(CursorError::InvalidArgument(format!("values must contain 1 to {MAX_VALUES} entries")));
    }
    if values.iter().any(|v| v.as_ref().contains('\n')) {
        return Err(CursorError::InvalidArgument("values must not contain a newline".into()));
    }
    if expires_at <= 0 {
        return Err(CursorError::InvalidArgument("expiresAt must be positive".into()));
    }
    let joined: Vec<&str> = values.iter().map(|v| v.as_ref()).collect();
    let body = format!("v1\n{expires_at}\n{}", joined.join("\n"));
    Ok(format!("{}.{}", b64_encode(body.as_bytes()), b64_encode(&mac(secret, body.as_bytes()))))
}

/// Verifies the MAC (constant time), header and expiry, returning the values.
pub fn decode_cursor(token: &str, secret: &[u8], now: i64) -> Result<Vec<String>, CursorError> {
    check_secret(secret)?;
    let Some((body_part, sig_part)) = token.rsplit_once('.') else {
        return malformed("missing '.'");
    };
    let Some(body) = b64_decode(body_part, true) else { return malformed("invalid body encoding") };
    // Trailing bits are not checked here: a non-canonical signature fails the
    // comparison below, so any change to the signature text is "bad signature".
    if b64_decode(sig_part, false).is_none() {
        return malformed("invalid signature encoding");
    }
    if !ct_eq(b64_encode(&mac(secret, &body)).as_bytes(), sig_part.as_bytes()) {
        return Err(CursorError::BadSignature);
    }
    let Ok(body) = String::from_utf8(body) else { return malformed("body is not UTF-8") };
    let mut parts = body.split('\n');
    if parts.next() != Some("v1") {
        return malformed("unsupported version");
    }
    let expiry = parts.next().unwrap_or("");
    if expiry.is_empty() || !expiry.bytes().all(|b| b.is_ascii_digit()) {
        return malformed("expiresAt is not decimal digits");
    }
    let Ok(expires_at) = expiry.parse::<i64>() else { return malformed("expiresAt out of range") };
    let values: Vec<String> = parts.map(str::to_owned).collect();
    if values.is_empty() {
        return malformed("no values");
    }
    if now >= expires_at {
        return Err(CursorError::Expired);
    }
    Ok(values)
}

#[cfg(test)]
mod tests {
    use super::*;

    const SECRET: &[u8] = b"0123456789abcdef0123456789abcdef";
    const TOKEN: &str =
        "djEKMTc5MDAwMDAwMAoyMDI2LTEwLTAxVDEyOjAwOjAwWgo0Mg.T2z74zcZhdSIFHTOhu4Wc0MNbTN2t71UXXeQpcLoUUc";
    const VALUES: [&str; 2] = ["2026-10-01T12:00:00Z", "42"];

    #[test]
    fn encode_vector_and_round_trip() {
        assert_eq!(encode_cursor(&VALUES, SECRET, 1790000000).unwrap(), TOKEN);
        assert_eq!(decode_cursor(TOKEN, SECRET, 1789999999).unwrap(), VALUES);
    }

    #[test]
    fn failure_kinds() {
        assert_eq!(decode_cursor(TOKEN, SECRET, 1790000000), Err(CursorError::Expired));
        for last in ['d', 'A', 'g', '-'] {
            let tampered = format!("{}{last}", &TOKEN[..TOKEN.len() - 1]);
            assert_eq!(decode_cursor(&tampered, SECRET, 1), Err(CursorError::BadSignature), "{last}");
        }
        assert!(matches!(decode_cursor("abc", SECRET, 1), Err(CursorError::Malformed(_))));
        assert!(matches!(decode_cursor(".abc", SECRET, 1), Err(CursorError::Malformed(_))));
        assert!(matches!(decode_cursor(&format!("{TOKEN}="), SECRET, 1), Err(CursorError::Malformed(_))));
        assert!(matches!(decode_cursor(&TOKEN.replace("Wgo0", "Wg+0"), SECRET, 1), Err(CursorError::Malformed(_))));
        let other = b"fedcba9876543210fedcba9876543210";
        assert_eq!(decode_cursor(TOKEN, other, 1), Err(CursorError::BadSignature));
    }

    #[test]
    fn argument_validation() {
        let short = &SECRET[..31];
        assert!(matches!(encode_cursor(&VALUES, short, 1), Err(CursorError::InvalidArgument(_))));
        assert!(matches!(decode_cursor(TOKEN, short, 1), Err(CursorError::InvalidArgument(_))));
        assert!(encode_cursor::<&str>(&[], SECRET, 1).is_err());
        assert!(encode_cursor(&["a"; 17], SECRET, 1).is_err());
        assert!(encode_cursor(&["a\nb"], SECRET, 1).is_err());
        assert!(encode_cursor(&["a"], SECRET, 0).is_err());
    }

    #[test]
    fn header_checked_after_signature() {
        let body = "v2\n10\nx";
        let token = format!("{}.{}", b64_encode(body.as_bytes()), b64_encode(&mac(SECRET, body.as_bytes())));
        assert!(matches!(decode_cursor(&token, SECRET, 1), Err(CursorError::Malformed(_))));
        let body = "v1\n1e9\nx";
        let token = format!("{}.{}", b64_encode(body.as_bytes()), b64_encode(&mac(SECRET, body.as_bytes())));
        assert!(matches!(decode_cursor(&token, SECRET, 1), Err(CursorError::Malformed(_))));
    }
}
