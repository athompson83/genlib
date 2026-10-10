// SPDX-License-Identifier: Apache-2.0

//! Stripe-style webhook signatures: header `t=<unix seconds>,v1=<hex HMAC-SHA256>`
//! over `"<t>.<body>"`. Verification accepts any matching `v1` (key rotation),
//! compares in constant time and enforces a timestamp tolerance. HMAC-SHA256
//! comes from the RustCrypto `hmac` and `sha2` crates already used by `totp`.

use hmac::{Hmac, Mac};
use sha2::Sha256;
use std::fmt;

pub const DEFAULT_TOLERANCE_SECONDS: u64 = 300;

/// Distinguishes caller mistakes from the three verification failure kinds.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum WebhookError {
    InvalidArgument(String),
    Malformed(String),
    BadSignature,
    Expired,
}

impl fmt::Display for WebhookError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            WebhookError::InvalidArgument(m) => write!(f, "invalid argument: {m}"),
            WebhookError::Malformed(m) => write!(f, "malformed: {m}"),
            WebhookError::BadSignature => f.write_str("bad signature"),
            WebhookError::Expired => f.write_str("expired"),
        }
    }
}

impl std::error::Error for WebhookError {}

fn malformed<T>(m: &str) -> Result<T, WebhookError> {
    Err(WebhookError::Malformed(m.into()))
}

fn mac_hex(secret: &[u8], timestamp: u64, body: &[u8]) -> Result<String, WebhookError> {
    if secret.is_empty() {
        return Err(WebhookError::InvalidArgument("secret must not be empty".into()));
    }
    let mut m = Hmac::<Sha256>::new_from_slice(secret).expect("HMAC accepts any key length");
    m.update(timestamp.to_string().as_bytes());
    m.update(b".");
    m.update(body);
    Ok(m.finalize().into_bytes().iter().map(|b| format!("{b:02x}")).collect())
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

/// Signature header for `body` at `timestamp_seconds`.
pub fn sign_webhook(secret: &[u8], timestamp_seconds: u64, body: &[u8]) -> Result<String, WebhookError> {
    Ok(format!("t={timestamp_seconds},v1={}", mac_hex(secret, timestamp_seconds, body)?))
}

/// Verifies `header` for `body`: exactly one decimal `t`, at least one `v1`
/// (64 lowercase hex; other schemes ignored), any `v1` matching in constant
/// time, and `|now - t| <= tolerance_seconds`. The signature is checked before
/// the timestamp, so a tampered request is reported as `BadSignature`.
pub fn verify_webhook(header: &str, body: &[u8], secret: &[u8], now_seconds: u64, tolerance_seconds: u64) -> Result<(), WebhookError> {
    if secret.is_empty() {
        return Err(WebhookError::InvalidArgument("secret must not be empty".into()));
    }
    let mut timestamp: Option<u64> = None;
    let mut signatures: Vec<&str> = Vec::new();
    for item in header.split(',') {
        let Some((k, v)) = item.split_once('=') else { return malformed("each item must be key=value") };
        let (k, v) = (k.trim(), v.trim());
        match k {
            "t" => {
                if timestamp.is_some() {
                    return malformed("more than one t");
                }
                if v.is_empty() || v.len() > 19 || !v.bytes().all(|b| b.is_ascii_digit()) {
                    return malformed("t must be decimal seconds");
                }
                timestamp = Some(v.parse().map_err(|_| WebhookError::Malformed("t out of range".into()))?);
            }
            "v1" => {
                if v.len() != 64 || !v.bytes().all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b)) {
                    return malformed("v1 must be 64 lowercase hex characters");
                }
                signatures.push(v);
            }
            _ => {}
        }
    }
    let Some(t) = timestamp else { return malformed("missing t") };
    if signatures.is_empty() {
        return malformed("missing v1");
    }
    let expected = mac_hex(secret, t, body)?;
    let mut matched = false;
    for sig in &signatures {
        matched |= ct_eq(expected.as_bytes(), sig.as_bytes());
    }
    if !matched {
        return Err(WebhookError::BadSignature);
    }
    if now_seconds.abs_diff(t) > tolerance_seconds {
        return Err(WebhookError::Expired);
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    const SECRET: &[u8] = b"whsec_test_secret_0123456789abcd";
    const BODY: &[u8] = b"{\"id\":\"evt_1\",\"amount\":1999}";
    const T: u64 = 1790000000;
    const HEADER: &str = "t=1790000000,v1=ad4e559e93bea390aff65b8c1eaec615bbdf3df1ef1d1c908b03299c20cf44a6";

    fn verify(h: &str, body: &[u8], secret: &[u8], now: u64) -> Result<(), WebhookError> {
        verify_webhook(h, body, secret, now, DEFAULT_TOLERANCE_SECONDS)
    }

    #[test]
    fn sign_vector_and_window() {
        assert_eq!(sign_webhook(SECRET, T, BODY).unwrap(), HEADER);
        assert_eq!(verify(HEADER, BODY, SECRET, T), Ok(()));
        assert_eq!(verify(HEADER, BODY, SECRET, T + 300), Ok(()));
        assert_eq!(verify(HEADER, BODY, SECRET, T - 300), Ok(()));
        assert_eq!(verify(HEADER, BODY, SECRET, T + 301), Err(WebhookError::Expired));
        assert_eq!(verify(HEADER, BODY, SECRET, T - 301), Err(WebhookError::Expired));
    }

    #[test]
    fn bad_signatures() {
        let mut body = BODY.to_vec();
        body[7] ^= 1;
        assert_eq!(verify(HEADER, &body, SECRET, T), Err(WebhookError::BadSignature));
        assert_eq!(verify(HEADER, BODY, b"whsec_other", T), Err(WebhookError::BadSignature));
        let flipped = format!("{}7", &HEADER[..HEADER.len() - 1]);
        assert_eq!(verify(&flipped, BODY, SECRET, T), Err(WebhookError::BadSignature));
        assert_eq!(verify(&flipped, BODY, SECRET, T + 301), Err(WebhookError::BadSignature));
    }

    #[test]
    fn rotation_and_whitespace() {
        let zeros = "0".repeat(64);
        let rotated = format!("t=1790000000, v1={zeros} , v1={}", &HEADER[16..]);
        assert_eq!(verify(&rotated, BODY, SECRET, T), Ok(()));
        let with_v0 = format!("{HEADER},v0=whatever");
        assert_eq!(verify(&with_v0, BODY, SECRET, T), Ok(()));
    }

    #[test]
    fn malformed_headers() {
        let sig = &HEADER[13..];
        for bad in [
            sig.to_string(),
            format!("t=1790000000,t=1790000000,{sig}"),
            "t=1790000000,v1=zz4e559e93bea390aff65b8c1eaec615bbdf3df1ef1d1c908b03299c20cf44a6".to_string(),
            "t=1790000000,v1=AD4E559E93BEA390AFF65B8C1EAEC615BBDF3DF1EF1D1C908B03299C20CF44A6".to_string(),
            "t=1790000000".to_string(),
            format!("t=-5,{sig}"),
            format!("t=1.5,{sig}"),
            format!("garbage,{HEADER}"),
            String::new(),
        ] {
            assert!(matches!(verify(&bad, BODY, SECRET, T), Err(WebhookError::Malformed(_))), "{bad}");
        }
        assert!(matches!(sign_webhook(b"", T, BODY), Err(WebhookError::InvalidArgument(_))));
        assert!(matches!(verify(HEADER, BODY, b"", T), Err(WebhookError::InvalidArgument(_))));
    }
}
