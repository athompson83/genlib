// SPDX-License-Identifier: Apache-2.0
//! Thin wrapper around `jsonwebtoken` for verifying OIDC ID tokens / JWT access tokens.
//!
//! `jsonwebtoken` performs signature verification, the alg allow-list and the
//! iss/aud/exp/nbf checks (with leeway). It does not fetch JWKS, so this module adds
//! a small cache keyed by `kid` that refetches the JWKS (HTTP via `ureq`) when it is
//! stale or a token names an unknown `kid`, rate-limited by a cooldown.

use std::collections::HashMap;
use std::sync::Mutex;
use std::time::{Duration, Instant};

use jsonwebtoken::jwk::Jwk;
use jsonwebtoken::{Algorithm, DecodingKey, Validation, decode, decode_header};
use serde_json::{Map, Value};

#[derive(Debug)]
pub enum VerifyError {
    Jwt(jsonwebtoken::errors::Error),
    Jwks(String),
    AlgorithmNotAllowed(Algorithm),
    MissingKid,
    UnknownKid(String),
    NonceMismatch,
}

impl std::fmt::Display for VerifyError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{self:?}")
    }
}
impl std::error::Error for VerifyError {}

pub struct Config {
    pub issuer: String,
    pub audience: Vec<String>,
    pub jwks_uri: String, // https in production
    pub algorithms: Vec<Algorithm>,
    pub leeway_secs: u64,
    pub cache_ttl: Duration,
    pub refetch_cooldown: Duration,
}

impl Config {
    pub fn new(issuer: &str, audience: &str, jwks_uri: &str) -> Self {
        Config {
            issuer: issuer.into(),
            audience: vec![audience.into()],
            jwks_uri: jwks_uri.into(),
            algorithms: vec![Algorithm::RS256, Algorithm::ES256],
            leeway_secs: 60,
            cache_ttl: Duration::from_secs(600),
            refetch_cooldown: Duration::from_secs(30),
        }
    }
}

struct Cache {
    keys: HashMap<String, DecodingKey>,
    fetched: Option<Instant>,
}

pub struct OidcVerifier {
    cfg: Config,
    agent: ureq::Agent,
    cache: Mutex<Cache>,
}

impl OidcVerifier {
    pub fn new(cfg: Config) -> Result<Self, VerifyError> {
        for a in &cfg.algorithms {
            if matches!(a, Algorithm::HS256 | Algorithm::HS384 | Algorithm::HS512) {
                return Err(VerifyError::AlgorithmNotAllowed(*a));
            }
        }
        let agent = ureq::Agent::config_builder()
            .timeout_global(Some(Duration::from_secs(5)))
            .build()
            .into();
        Ok(Self {
            cfg,
            agent,
            cache: Mutex::new(Cache {
                keys: HashMap::new(),
                fetched: None,
            }),
        })
    }

    /// Verify `token`; pass the nonce stored with the authorization request, if any.
    pub fn verify(
        &self,
        token: &str,
        nonce: Option<&str>,
    ) -> Result<Map<String, Value>, VerifyError> {
        let header = decode_header(token).map_err(VerifyError::Jwt)?;
        if !self.cfg.algorithms.contains(&header.alg) {
            return Err(VerifyError::AlgorithmNotAllowed(header.alg));
        }
        let kid = header.kid.ok_or(VerifyError::MissingKid)?;
        let key = self.key_for(&kid)?;

        let mut v = Validation::new(header.alg);
        // Validation::new(alg) pins exactly the header alg (already checked against the allow-list);
        // jsonwebtoken also requires it to match the key family from the JWK.
        v.set_issuer(&[&self.cfg.issuer]);
        v.set_audience(&self.cfg.audience);
        v.set_required_spec_claims(&["exp", "iss", "aud", "sub"]);
        v.validate_nbf = true;
        v.leeway = self.cfg.leeway_secs;
        let data = decode::<Map<String, Value>>(token, &key, &v).map_err(VerifyError::Jwt)?;

        // nonce binds an ID token to the authorization request (OIDC Core 3.1.3.7)
        if let Some(expected) = nonce
            && data.claims.get("nonce").and_then(Value::as_str) != Some(expected)
        {
            return Err(VerifyError::NonceMismatch);
        }
        Ok(data.claims)
    }

    fn key_for(&self, kid: &str) -> Result<DecodingKey, VerifyError> {
        let mut c = self.cache.lock().unwrap();
        let stale = c.fetched.is_none_or(|t| t.elapsed() > self.cfg.cache_ttl);
        let may_refetch = c
            .fetched
            .is_none_or(|t| t.elapsed() >= self.cfg.refetch_cooldown);
        if stale || (!c.keys.contains_key(kid) && may_refetch) {
            c.keys = self.fetch()?;
            c.fetched = Some(Instant::now());
        }
        c.keys
            .get(kid)
            .cloned()
            .ok_or_else(|| VerifyError::UnknownKid(kid.into()))
    }

    fn fetch(&self) -> Result<HashMap<String, DecodingKey>, VerifyError> {
        let text = self
            .agent
            .get(&self.cfg.jwks_uri)
            .call()
            .and_then(|mut r| r.body_mut().read_to_string())
            .map_err(|e| VerifyError::Jwks(e.to_string()))?;
        let body: Value =
            serde_json::from_str(&text).map_err(|e| VerifyError::Jwks(e.to_string()))?;
        let mut out = HashMap::new();
        for k in body
            .get("keys")
            .and_then(Value::as_array)
            .into_iter()
            .flatten()
        {
            // Skip keys we cannot use (unknown kty, enc keys) instead of failing the whole set.
            if k.get("use")
                .and_then(Value::as_str)
                .is_some_and(|u| u != "sig")
            {
                continue;
            }
            let Ok(jwk) = serde_json::from_value::<Jwk>(k.clone()) else {
                continue;
            };
            let (Some(kid), Ok(dk)) = (jwk.common.key_id.clone(), DecodingKey::from_jwk(&jwk))
            else {
                continue;
            };
            out.insert(kid, dk);
        }
        Ok(out)
    }
}
