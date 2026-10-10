// SPDX-License-Identifier: Apache-2.0

//! Expiring HMAC-SHA256 signed URLs:
//! `<path>?<query>&expires=<unix seconds>&signature=<base64url, no padding>`.
//! The signature covers everything before `&signature=` and is compared in
//! constant time. HMAC comes from the `hmac`/`sha2` crates already pinned here.

use hmac::{Hmac, Mac};
use sha2::Sha256;
use std::fmt;

/// Caller mistakes versus the three verification failure kinds.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum SignedUrlError {
    InvalidArgument(String),
    Malformed(String),
    BadSignature,
    Expired,
}

impl fmt::Display for SignedUrlError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            SignedUrlError::InvalidArgument(m) => write!(f, "invalid argument: {m}"),
            SignedUrlError::Malformed(m) => write!(f, "malformed: {m}"),
            SignedUrlError::BadSignature => f.write_str("bad signature"),
            SignedUrlError::Expired => f.write_str("expired"),
        }
    }
}

impl std::error::Error for SignedUrlError {}

const SIG_SEP: &str = "&signature=";
const B64URL: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

fn invalid<T>(m: &str) -> Result<T, SignedUrlError> {
    Err(SignedUrlError::InvalidArgument(m.into()))
}

fn malformed<T>(m: &str) -> Result<T, SignedUrlError> {
    Err(SignedUrlError::Malformed(m.into()))
}

fn base64url(bytes: &[u8]) -> String {
    let mut out = String::with_capacity(bytes.len() * 4 / 3 + 2);
    for chunk in bytes.chunks(3) {
        let n = chunk.iter().enumerate().fold(0u32, |acc, (i, &b)| acc | u32::from(b) << (16 - 8 * i));
        for i in 0..=chunk.len() {
            out.push(B64URL[(n >> (18 - 6 * i) & 63) as usize] as char);
        }
    }
    out
}

fn mac(secret: &str, message: &str) -> String {
    let mut m = Hmac::<Sha256>::new_from_slice(secret.as_bytes()).expect("HMAC accepts any key length");
    m.update(message.as_bytes());
    base64url(&m.finalize().into_bytes())
}

fn ct_eq(a: &[u8], b: &[u8]) -> bool {
    if a.len() != b.len() {
        return false;
    }
    let diff = a.iter().zip(b).fold(0u8, |d, (x, y)| d | (x ^ y));
    std::hint::black_box(diff) == 0
}

/// Appends `expires` and `signature` to `target` (a path starting with `/`,
/// optional query, no fragment, no existing `expires`/`signature` parameter).
pub fn sign_url(target: &str, secret: &str, expires_unix_seconds: u64) -> Result<String, SignedUrlError> {
    if secret.is_empty() {
        return invalid("secret must not be empty");
    }
    if !target.starts_with('/') || target.contains('#') {
        return invalid("target must start with / and have no fragment");
    }
    if let Some((_, query)) = target.split_once('?') {
        let taken = query.split('&').filter(|p| !p.is_empty()).any(|p| {
            let name = p.split_once('=').map_or(p, |(n, _)| n);
            name == "expires" || name == "signature"
        });
        if taken {
            return invalid("target already has an expires or signature parameter");
        }
    }
    let sep = if target.contains('?') { '&' } else { '?' };
    let message = format!("{target}{sep}expires={expires_unix_seconds}");
    let sig = mac(secret, &message);
    Ok(format!("{message}{SIG_SEP}{sig}"))
}

/// Verifies `signed` at `now_unix_seconds` and returns its expiry. The URL is
/// still valid when now equals expires.
pub fn verify_url(signed: &str, secret: &str, now_unix_seconds: u64) -> Result<u64, SignedUrlError> {
    if secret.is_empty() {
        return invalid("secret must not be empty");
    }
    let Some(i) = signed.rfind(SIG_SEP) else { return malformed("missing signature") };
    let (message, sig) = (&signed[..i], &signed[i + SIG_SEP.len()..]);
    if sig.len() != 43 || !sig.bytes().all(|b| B64URL.contains(&b)) {
        return malformed("signature must be 43 base64url characters at the end");
    }
    let Some((_, query)) = message.split_once('?') else { return malformed("missing query") };
    let expires: Vec<&str> = query
        .split('&')
        .filter_map(|p| match p.split_once('=') {
            Some(("expires", v)) => Some(v),
            None if p == "expires" => Some(""),
            _ => None,
        })
        .collect();
    if expires.len() != 1 {
        return malformed("need exactly one expires parameter");
    }
    let e = expires[0];
    if e.is_empty() || e.len() > 19 || !e.bytes().all(|b| b.is_ascii_digit()) {
        return malformed("expires must be decimal seconds");
    }
    let exp: u64 = e.parse().map_err(|_| SignedUrlError::Malformed("expires out of range".into()))?;
    if !ct_eq(mac(secret, message).as_bytes(), sig.as_bytes()) {
        return Err(SignedUrlError::BadSignature);
    }
    if now_unix_seconds > exp {
        return Err(SignedUrlError::Expired);
    }
    Ok(exp)
}

#[cfg(test)]
mod tests {
    use super::*;

    const SECRET: &str = "url-signing-secret";
    const CASES: [(&str, u64, &str); 2] = [
        ("/files/report.pdf?user=42", 1790000000, "/files/report.pdf?user=42&expires=1790000000&signature=OBOJTlNq3AuDbND_6J4njKkDIXDMxhx0l0PmWaRbfaU"),
        ("/download/a%20b.zip", 1790003600, "/download/a%20b.zip?expires=1790003600&signature=SafK5ZH-apLeaJ-c1dhzp-kyiS3doOR7ywgvr8WDJOo"),
    ];

    #[test]
    fn vectors() {
        for (target, expires, signed) in CASES {
            assert_eq!(sign_url(target, SECRET, expires).unwrap(), signed);
            assert_eq!(verify_url(signed, SECRET, expires), Ok(expires));
            assert_eq!(verify_url(signed, SECRET, expires + 1), Err(SignedUrlError::Expired));
        }
    }

    #[test]
    fn tampering() {
        let (_, now, s) = CASES[0];
        let i = s.rfind(SIG_SEP).unwrap() + SIG_SEP.len();
        let flip = if &s[i..i + 1] == "A" { "B" } else { "A" };
        let flipped = format!("{}{}{}", &s[..i], flip, &s[i + 1..]);
        assert_eq!(verify_url(&s.replace("report", "rep0rt"), SECRET, now), Err(SignedUrlError::BadSignature));
        assert_eq!(verify_url(s, "url-signing-secreT", now), Err(SignedUrlError::BadSignature));
        assert_eq!(verify_url(&flipped, SECRET, now), Err(SignedUrlError::BadSignature));
        let malformed_cases = [
            s[..i - SIG_SEP.len()].to_string(),
            s.replace("&expires=", "&expires=1790000000&expires="),
            s.replace("expires=1790000000", "expires=17900000x0"),
            format!("{s}x"),
            format!("/no-query{}", &s[i - SIG_SEP.len()..]),
        ];
        for m in malformed_cases {
            assert!(matches!(verify_url(&m, SECRET, now), Err(SignedUrlError::Malformed(_))), "{m}");
        }
    }

    #[test]
    fn sign_rejects() {
        for (target, secret) in [("/a", ""), ("a", SECRET), ("/a#f", SECRET), ("/a?expires=1", SECRET), ("/a?x=1&signature=z", SECRET)] {
            assert!(matches!(sign_url(target, secret, 1), Err(SignedUrlError::InvalidArgument(_))), "{target}");
        }
        assert!(matches!(verify_url(CASES[0].2, "", 0), Err(SignedUrlError::InvalidArgument(_))));
    }
}
