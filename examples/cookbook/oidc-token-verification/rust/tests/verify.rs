// SPDX-License-Identifier: Apache-2.0
//! Local-only test: RSA keys generated here; JWKS served by a tiny HTTP stub on 127.0.0.1.

use std::io::{Read, Write};
use std::net::TcpListener;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use base64::Engine;
use base64::engine::general_purpose::URL_SAFE_NO_PAD as B64;
use jsonwebtoken::{Algorithm, EncodingKey, Header, encode};
use oidc_token_verification::{Config, OidcVerifier, VerifyError};
use rsa::RsaPrivateKey;
use rsa::pkcs1::{EncodeRsaPrivateKey, LineEnding};
use rsa::traits::PublicKeyParts;
use serde_json::{Value, json};

const ISS: &str = "https://idp.example.test";
const AUD: &str = "client-123";

fn new_key(kid: &str, jwks: &Mutex<Vec<Value>>) -> EncodingKey {
    let k = RsaPrivateKey::new(&mut rand_core(), 2048).unwrap();
    jwks.lock()
        .unwrap()
        .push(json!({"kty":"RSA","kid":kid,"alg":"RS256","use":"sig",
        "n": B64.encode(k.n().to_bytes_be()), "e": B64.encode(k.e().to_bytes_be())}));
    EncodingKey::from_rsa_pem(k.to_pkcs1_pem(LineEnding::LF).unwrap().as_bytes()).unwrap()
}

fn rand_core() -> rsa::rand_core::OsRng {
    rsa::rand_core::OsRng
}

fn now() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_secs() as i64
}

fn token(key: &EncodingKey, kid: &str, over: Value) -> String {
    let mut c = json!({"iss":ISS,"aud":AUD,"sub":"user-1","iat":now(),"nbf":now(),"exp":now()+300,"nonce":"n-1"});
    for (k, v) in over.as_object().unwrap() {
        c[k] = v.clone();
    }
    let mut h = Header::new(Algorithm::RS256);
    h.kid = Some(kid.into());
    encode(&h, &c, key).unwrap()
}

fn serve(jwks: Arc<Mutex<Vec<Value>>>, fetches: Arc<AtomicUsize>) -> String {
    let l = TcpListener::bind("127.0.0.1:0").unwrap();
    let addr = l.local_addr().unwrap();
    std::thread::spawn(move || {
        for s in l.incoming() {
            let mut s = s.unwrap();
            let mut buf = [0u8; 4096];
            let _ = s.read(&mut buf);
            fetches.fetch_add(1, Ordering::SeqCst);
            let body = json!({"keys": *jwks.lock().unwrap()}).to_string();
            let _ = write!(
                s,
                "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
                body.len(),
                body
            );
        }
    });
    format!("http://{addr}/jwks")
}

#[test]
fn verifies_and_rejects() {
    let jwks = Arc::new(Mutex::new(vec![]));
    let fetches = Arc::new(AtomicUsize::new(0));
    let k1 = new_key("k1", &jwks);
    let url = serve(jwks.clone(), fetches.clone());
    let mut cfg = Config::new(ISS, AUD, &url);
    cfg.leeway_secs = 5;
    cfg.refetch_cooldown = Duration::ZERO;
    let v = OidcVerifier::new(cfg).unwrap();

    let claims = v.verify(&token(&k1, "k1", json!({})), Some("n-1")).unwrap();
    assert_eq!(claims["sub"], "user-1");

    for (name, t) in [
        ("aud", token(&k1, "k1", json!({"aud":"other"}))),
        ("iss", token(&k1, "k1", json!({"iss":"https://evil.test"}))),
        (
            "exp",
            token(&k1, "k1", json!({"exp":now()-30,"nbf":now()-60})),
        ),
        ("nbf", token(&k1, "k1", json!({"nbf":now()+120}))),
    ] {
        assert!(v.verify(&t, None).is_err(), "{name} should be rejected");
    }
    assert!(
        v.verify(
            &token(&k1, "k1", json!({"exp":now()-2,"nbf":now()-60})),
            None
        )
        .is_ok(),
        "within leeway"
    );
    assert!(matches!(
        v.verify(&token(&k1, "k1", json!({})), Some("other")),
        Err(VerifyError::NonceMismatch)
    ));
    let good = token(&k1, "k1", json!({}));
    let tampered = format!("{}AAAA", &good[..good.len() - 4]);
    assert!(v.verify(&tampered, None).is_err());
    let mut hh = Header::new(Algorithm::HS256);
    hh.kid = Some("k1".into());
    let hs = encode(
        &hh,
        &json!({"iss":ISS,"aud":AUD,"sub":"x","exp":now()+60}),
        &EncodingKey::from_secret(&[b'x'; 32]),
    )
    .unwrap();
    assert!(matches!(
        v.verify(&hs, None),
        Err(VerifyError::AlgorithmNotAllowed(_))
    ));

    // kid rotation
    let before = fetches.load(Ordering::SeqCst);
    let k2 = new_key("k2", &jwks);
    assert!(v.verify(&token(&k2, "k2", json!({})), None).is_ok());
    assert!(
        fetches.load(Ordering::SeqCst) > before,
        "JWKS should be refetched"
    );
    let stranger = new_key("tmp", &Mutex::new(vec![]));
    assert!(matches!(
        v.verify(&token(&stranger, "nope", json!({})), None),
        Err(VerifyError::UnknownKid(_))
    ));

    let mut bad = Config::new(ISS, AUD, &url);
    bad.algorithms = vec![Algorithm::HS256];
    assert!(OidcVerifier::new(bad).is_err());
}
