// SPDX-License-Identifier: Apache-2.0

//! Browser leg of an OAuth 2.0 authorization code flow with PKCE (RFC 7636)
//! for OpenID Connect sign-in: verifier/challenge, state/nonce tokens, the
//! authorization URL, callback parsing and the token request body.
//!
//! Scope: this module only builds and checks the browser leg. ID token and
//! access token VERIFICATION must use a vetted OIDC/JOSE library (see the
//! Tier B cookbook). Never decode a token to make an authorization decision here.

use sha2::{Digest, Sha256};
use std::fmt;

const UNRESERVED: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";
const B64URL: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

/// Errors returned by this module.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum OidcError {
    InvalidVerifierLength,
    InvalidTokenLength,
    InvalidEndpoint,
    MissingOpenIdScope,
    MissingField(&'static str),
    ReservedParam(String),
    InvalidCallback,
    /// The provider redirected back with `error` (and optional `error_description`).
    Authorization {
        error: String,
        description: Option<String>,
    },
    MissingCode,
    StateMismatch,
    Random,
}

impl fmt::Display for OidcError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            OidcError::InvalidVerifierLength => {
                f.write_str("verifier length must be between 43 and 128")
            }
            OidcError::InvalidTokenLength => {
                f.write_str("token length must be between 1 and 1024 bytes")
            }
            OidcError::InvalidEndpoint => f.write_str(
                "authorization endpoint must be https (http only for localhost/127.0.0.1)",
            ),
            OidcError::MissingOpenIdScope => f.write_str("scope must include openid"),
            OidcError::MissingField(name) => write!(f, "{name} is required"),
            OidcError::ReservedParam(name) => {
                write!(f, "extra parameter {name:?} is empty or reserved")
            }
            OidcError::InvalidCallback => f.write_str("invalid callback URL"),
            OidcError::Authorization {
                error,
                description: Some(d),
            } => write!(f, "authorization error: {error}: {d}"),
            OidcError::Authorization {
                error,
                description: None,
            } => write!(f, "authorization error: {error}"),
            OidcError::MissingCode => f.write_str("missing_code"),
            OidcError::StateMismatch => f.write_str("state_mismatch"),
            OidcError::Random => f.write_str("random source failed"),
        }
    }
}

impl std::error::Error for OidcError {}

fn base64url(data: &[u8]) -> String {
    let mut out = String::with_capacity((data.len() * 4).div_ceil(3));
    for chunk in data.chunks(3) {
        let n = chunk
            .iter()
            .enumerate()
            .fold(0u32, |acc, (i, &b)| acc | (b as u32) << (16 - 8 * i));
        for i in 0..=chunk.len() {
            out.push(B64URL[((n >> (18 - 6 * i)) & 63) as usize] as char);
        }
    }
    out
}

/// Random PKCE verifier of 43..=128 characters, drawn without modulo bias
/// from the RFC 7636 unreserved alphabet.
pub fn generate_code_verifier(length: usize) -> Result<String, OidcError> {
    if !(43..=128).contains(&length) {
        return Err(OidcError::InvalidVerifierLength);
    }
    let limit = 256 - 256 % UNRESERVED.len(); // reject bytes that would bias the modulo
    let mut out = String::with_capacity(length);
    let mut buf = vec![0u8; length];
    while out.len() < length {
        getrandom::fill(&mut buf).map_err(|_| OidcError::Random)?;
        for &b in &buf {
            if (b as usize) < limit && out.len() < length {
                out.push(UNRESERVED[b as usize % UNRESERVED.len()] as char);
            }
        }
    }
    Ok(out)
}

/// base64url(SHA-256(verifier)) without padding.
pub fn code_challenge_s256(verifier: &str) -> String {
    base64url(&Sha256::digest(verifier.as_bytes()))
}

/// `bytes` random bytes as unpadded base64url, for state and nonce values.
pub fn random_token(bytes: usize) -> Result<String, OidcError> {
    if bytes == 0 || bytes > 1024 {
        return Err(OidcError::InvalidTokenLength);
    }
    let mut buf = vec![0u8; bytes];
    getrandom::fill(&mut buf).map_err(|_| OidcError::Random)?;
    Ok(base64url(&buf))
}

/// Authorization request inputs. Each scope entry may hold several
/// space-separated scopes; `openid` must be present.
#[derive(Clone, Debug, Default)]
pub struct AuthRequest<'a> {
    pub authorization_endpoint: &'a str,
    pub client_id: &'a str,
    pub redirect_uri: &'a str,
    pub scope: &'a [&'a str],
    pub state: &'a str,
    pub nonce: &'a str,
    pub code_challenge: &'a str,
    pub extra_params: &'a [(&'a str, &'a str)],
}

const RESERVED: [&str; 8] = [
    "response_type",
    "client_id",
    "redirect_uri",
    "scope",
    "state",
    "nonce",
    "code_challenge",
    "code_challenge_method",
];

fn valid_endpoint(raw: &str) -> bool {
    if raw.len() > 2048
        || raw
            .chars()
            .any(|c| c.is_whitespace() || c.is_control() || c == '#')
    {
        return false;
    }
    let rest = if let Some(r) = raw.strip_prefix("https://") {
        r
    } else if let Some(r) = raw.strip_prefix("http://") {
        let host_end = r.find([':', '/', '?']).unwrap_or(r.len());
        if !matches!(&r[..host_end], "localhost" | "127.0.0.1") {
            return false;
        }
        r
    } else {
        return false;
    };
    let authority = &rest[..rest.find(['/', '?']).unwrap_or(rest.len())];
    let host = &authority[..authority.find(':').unwrap_or(authority.len())];
    !host.is_empty() && !authority.contains('@')
}

/// Builds the authorization URL with parameters in a fixed order, appending
/// to any query already present on the endpoint.
pub fn build_authorization_url(r: &AuthRequest<'_>) -> Result<String, OidcError> {
    if !valid_endpoint(r.authorization_endpoint) {
        return Err(OidcError::InvalidEndpoint);
    }
    let scopes: Vec<&str> = r.scope.iter().flat_map(|s| s.split_whitespace()).collect();
    if !scopes.contains(&"openid") {
        return Err(OidcError::MissingOpenIdScope);
    }
    for (name, value) in [
        ("client_id", r.client_id),
        ("redirect_uri", r.redirect_uri),
        ("state", r.state),
        ("nonce", r.nonce),
        ("code_challenge", r.code_challenge),
    ] {
        if value.is_empty() {
            return Err(OidcError::MissingField(name));
        }
    }
    let scope = scopes.join(" ");
    let mut params: Vec<(&str, &str)> = vec![
        ("response_type", "code"),
        ("client_id", r.client_id),
        ("redirect_uri", r.redirect_uri),
        ("scope", &scope),
        ("state", r.state),
        ("nonce", r.nonce),
        ("code_challenge", r.code_challenge),
        ("code_challenge_method", "S256"),
    ];
    for &(name, value) in r.extra_params {
        if name.is_empty() || RESERVED.contains(&name) {
            return Err(OidcError::ReservedParam(name.to_string()));
        }
        params.push((name, value));
    }
    let endpoint = r.authorization_endpoint;
    let mut url = String::from(endpoint);
    if !endpoint.contains('?') {
        url.push('?');
    } else if !endpoint.ends_with('?') && !endpoint.ends_with('&') {
        url.push('&');
    }
    let query: Vec<String> = params
        .iter()
        .map(|(k, v)| format!("{}={}", encode(k, false), encode(v, false)))
        .collect();
    url.push_str(&query.join("&"));
    Ok(url)
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

fn hex_val(c: u8) -> Option<u8> {
    (c as char).to_digit(16).map(|d| d as u8)
}

fn form_decode(s: &str) -> Result<String, OidcError> {
    let bytes = s.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        match bytes[i] {
            b'+' => out.push(b' '),
            b'%' => {
                let hi = bytes.get(i + 1).copied().and_then(hex_val);
                let lo = bytes.get(i + 2).copied().and_then(hex_val);
                match (hi, lo) {
                    (Some(h), Some(l)) => out.push(h << 4 | l),
                    _ => return Err(OidcError::InvalidCallback),
                }
                i += 2;
            }
            b => out.push(b),
        }
        i += 1;
    }
    String::from_utf8(out).map_err(|_| OidcError::InvalidCallback)
}

/// Returns the authorization code from the redirect URL. Provider errors map
/// to `OidcError::Authorization`; a missing code to `MissingCode`; a state
/// differing from `expected_state` (constant-time compare) to `StateMismatch`.
pub fn parse_callback(callback_url: &str, expected_state: &str) -> Result<String, OidcError> {
    let without_fragment = callback_url.split('#').next().unwrap_or("");
    let query = match without_fragment.split_once('?') {
        Some((_, q)) => q,
        None => "",
    };
    let mut pairs: Vec<(String, String)> = Vec::new();
    for part in query.split('&').filter(|p| !p.is_empty()) {
        let (k, v) = part.split_once('=').unwrap_or((part, ""));
        pairs.push((form_decode(k)?, form_decode(v)?));
    }
    let get = |name: &str| {
        pairs
            .iter()
            .find(|(k, _)| k == name)
            .map(|(_, v)| v.clone())
    };
    if let Some(error) = get("error") {
        return Err(OidcError::Authorization {
            error,
            description: get("error_description"),
        });
    }
    let code = get("code")
        .filter(|c| !c.is_empty())
        .ok_or(OidcError::MissingCode)?;
    let state = get("state").unwrap_or_default();
    if expected_state.is_empty() || !ct_eq(state.as_bytes(), expected_state.as_bytes()) {
        return Err(OidcError::StateMismatch);
    }
    Ok(code)
}

/// Token exchange inputs.
#[derive(Clone, Debug, Default)]
pub struct TokenRequest<'a> {
    pub code: &'a str,
    pub redirect_uri: &'a str,
    pub client_id: &'a str,
    pub code_verifier: &'a str,
}

/// application/x-www-form-urlencoded token request body in a fixed order.
pub fn token_request_body(r: &TokenRequest<'_>) -> Result<String, OidcError> {
    for (name, value) in [
        ("code", r.code),
        ("redirect_uri", r.redirect_uri),
        ("client_id", r.client_id),
        ("code_verifier", r.code_verifier),
    ] {
        if value.is_empty() {
            return Err(OidcError::MissingField(name));
        }
    }
    Ok(format!(
        "grant_type=authorization_code&code={}&redirect_uri={}&client_id={}&code_verifier={}",
        encode(r.code, true),
        encode(r.redirect_uri, true),
        encode(r.client_id, true),
        encode(r.code_verifier, true)
    ))
}

/// Percent-encodes everything outside the RFC 3986 unreserved set. With
/// `form` true, spaces become `+` (form encoding); otherwise `%20`.
fn encode(s: &str, form: bool) -> String {
    let mut out = String::with_capacity(s.len());
    for b in s.bytes() {
        if UNRESERVED.contains(&b) {
            out.push(b as char);
        } else if form && b == b' ' {
            out.push('+');
        } else {
            out.push_str(&format!("%{:02X}", b));
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    const CHALLENGE: &str = "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM";

    fn request(endpoint: &str) -> AuthRequest<'_> {
        AuthRequest {
            authorization_endpoint: endpoint,
            client_id: "app 1",
            redirect_uri: "https://app.example.com/cb",
            scope: &["openid", "email"],
            state: "s1",
            nonce: "n1",
            code_challenge: CHALLENGE,
            extra_params: &[],
        }
    }

    #[test]
    fn challenge_rfc7636() {
        assert_eq!(
            code_challenge_s256("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"),
            CHALLENGE
        );
    }

    #[test]
    fn authorization_url() {
        assert_eq!(
            build_authorization_url(&request("https://id.example.com/authorize")).unwrap(),
            "https://id.example.com/authorize?response_type=code&client_id=app%201&redirect_uri=https%3A%2F%2Fapp.example.com%2Fcb&scope=openid%20email&state=s1&nonce=n1&code_challenge=E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM&code_challenge_method=S256"
        );
        assert_eq!(
            build_authorization_url(&request("http://id.example.com/authorize")),
            Err(OidcError::InvalidEndpoint)
        );
        assert!(build_authorization_url(&request("http://localhost:8080/authorize")).is_ok());
        assert_eq!(
            build_authorization_url(&request("https://user@id.example.com/a")),
            Err(OidcError::InvalidEndpoint)
        );
        let extra = [("prompt", "login")];
        let r = AuthRequest {
            scope: &["openid email"],
            extra_params: &extra,
            ..request("https://id.example.com/authorize?tenant=a")
        };
        let url = build_authorization_url(&r).unwrap();
        assert!(
            url.starts_with("https://id.example.com/authorize?tenant=a&response_type=code&"),
            "{url}"
        );
        assert!(
            url.ends_with("&code_challenge_method=S256&prompt=login")
                && url.contains("scope=openid%20email"),
            "{url}"
        );
        let r = AuthRequest {
            scope: &["email"],
            ..request("https://id.example.com/authorize")
        };
        assert_eq!(
            build_authorization_url(&r),
            Err(OidcError::MissingOpenIdScope)
        );
    }

    #[test]
    fn callback() {
        assert_eq!(
            parse_callback("https://app.example.com/cb?code=abc&state=s1", "s1").unwrap(),
            "abc"
        );
        let err = parse_callback("https://app.example.com/cb?code=abc&state=s1", "s2").unwrap_err();
        assert_eq!(err, OidcError::StateMismatch);
        assert_eq!(err.to_string(), "state_mismatch");
        assert_eq!(
            parse_callback("https://app.example.com/cb?error=access_denied&error_description=User%20denied&state=s1", "s1"),
            Err(OidcError::Authorization { error: "access_denied".into(), description: Some("User denied".into()) })
        );
        assert_eq!(
            parse_callback("https://app.example.com/cb?state=s1", "s1"),
            Err(OidcError::MissingCode)
        );
    }

    #[test]
    fn token_body() {
        let r = TokenRequest {
            code: "c d",
            redirect_uri: "https://app.example.com/cb",
            client_id: "app",
            code_verifier: "v",
        };
        assert_eq!(
            token_request_body(&r).unwrap(),
            "grant_type=authorization_code&code=c+d&redirect_uri=https%3A%2F%2Fapp.example.com%2Fcb&client_id=app&code_verifier=v"
        );
    }

    #[test]
    fn verifier_and_tokens() {
        let v = generate_code_verifier(64).unwrap();
        assert_eq!(v.len(), 64);
        assert!(v.bytes().all(|c| UNRESERVED.contains(&c)));
        assert_eq!(
            generate_code_verifier(42),
            Err(OidcError::InvalidVerifierLength)
        );
        assert_eq!(
            generate_code_verifier(129),
            Err(OidcError::InvalidVerifierLength)
        );
        let t = random_token(32).unwrap();
        assert_eq!(t.len(), 43);
        assert!(!t.contains(['+', '/', '=']));
        assert_eq!(base64url(b"f"), "Zg");
        assert_eq!(base64url(b"foobar"), "Zm9vYmFy");
    }
}
