// SPDX-License-Identifier: Apache-2.0
// The recorded fixture answers fixed challenges, while webauthn-rs generates a
// random challenge inside its opaque state. The test therefore uses the
// `danger-allow-state-serialisation` feature to substitute the recorded
// challenge into a genuinely generated state. Production code never does this.
use cookbook_webauthn_passkeys::*;
use serde_json::Value;

fn fixture() -> Value {
    let raw = std::fs::read_to_string(concat!(env!("CARGO_MANIFEST_DIR"), "/../fixtures/passkey-es256-none.json")).unwrap();
    serde_json::from_str(&raw).unwrap()
}

fn with_challenge<T: serde::Serialize + serde::de::DeserializeOwned>(state: &T, outer: &str, challenge: &str) -> T {
    let mut v = serde_json::to_value(state).unwrap();
    v[outer]["challenge"] = Value::String(challenge.to_string());
    serde_json::from_value(v).unwrap()
}

fn user_id(fx: &Value) -> Uuid {
    let b64 = fx["userId"].as_str().unwrap();
    // Base64URL decode via the library's own type to avoid extra dependencies.
    let bytes: Base64UrlSafeData = serde_json::from_value(Value::String(b64.into())).unwrap();
    Uuid::from_slice(bytes.as_ref()).unwrap()
}

fn rp(fx: &Value) -> Rp {
    Rp::new(fx["rpId"].as_str().unwrap(), "Example", fx["origin"].as_str().unwrap()).unwrap()
}

#[test]
fn config_validation() {
    assert!(Rp::new("example.com", "Example", "https://evil.example").is_err());
    assert!(Rp::new("example.com", "Example", "not a url").is_err());
}

#[test]
fn options() {
    let fx = fixture();
    let rp = rp(&fx);
    let (a, _) = rp.registration_options(user_id(&fx), "alice@example.com", &[]).unwrap();
    let (b, _) = rp.registration_options(user_id(&fx), "alice@example.com", &[]).unwrap();
    let a = serde_json::to_value(&a).unwrap();
    let b = serde_json::to_value(&b).unwrap();
    assert_eq!(a["publicKey"]["rp"]["id"], "example.com");
    assert_eq!(a["publicKey"]["user"]["id"], fx["userId"]);
    assert_eq!(a["publicKey"]["authenticatorSelection"]["userVerification"], "required");
    assert_ne!(a["publicKey"]["challenge"], b["publicKey"]["challenge"]);
}

#[test]
fn recorded_ceremony() {
    let fx = fixture();
    let rp = rp(&fx);
    let (_, state) = rp.registration_options(user_id(&fx), "alice@example.com", &[]).unwrap();
    let state = with_challenge(&state, "rs", fx["registrationChallenge"].as_str().unwrap());
    let passkey = rp.verify_registration(&fx["registrationResponse"].to_string(), &state).unwrap();
    let cred_id = serde_json::to_value(passkey.cred_id()).unwrap();
    assert_eq!(cred_id, fx["credentialId"]);

    // Persist and reload, as a database round-trip would.
    let mut stored: Vec<Passkey> = vec![serde_json::from_str(&serde_json::to_string(&passkey).unwrap()).unwrap()];
    let (req, auth) = rp.authentication_options(&stored).unwrap();
    let req = serde_json::to_value(&req).unwrap();
    assert_eq!(req["publicKey"]["allowCredentials"][0]["id"], fx["credentialId"]);
    let auth = with_challenge(&auth, "ast", fx["authenticationChallenge"].as_str().unwrap());
    let changed = rp.verify_authentication(&fx["authenticationResponse"].to_string(), &auth, &mut stored).unwrap();
    assert!(changed, "counter should advance from 0 to 1");
}

#[test]
fn rejections() {
    let fx = fixture();
    let rp = rp(&fx);
    let (_, state) = rp.registration_options(user_id(&fx), "alice@example.com", &[]).unwrap();
    assert!(rp.verify_registration(&fx["registrationResponse"].to_string(), &state).is_err(), "random challenge must not match");
    let other = Rp::new("example.com", "Example", "https://login.example.com").unwrap();
    let (_, st2) = other.registration_options(user_id(&fx), "alice@example.com", &[]).unwrap();
    let st2 = with_challenge(&st2, "rs", fx["registrationChallenge"].as_str().unwrap());
    assert!(other.verify_registration(&fx["registrationResponse"].to_string(), &st2).is_err(), "origin mismatch");

    let state = with_challenge(&state, "rs", fx["registrationChallenge"].as_str().unwrap());
    let passkey = rp.verify_registration(&fx["registrationResponse"].to_string(), &state).unwrap();
    let mut stored = vec![passkey];
    let (_, auth) = rp.authentication_options(&stored).unwrap();
    assert!(rp.verify_authentication(&fx["authenticationResponse"].to_string(), &auth, &mut stored).is_err());
    // Replaying the same assertion after the counter advanced must fail.
    let auth = with_challenge(&auth, "ast", fx["authenticationChallenge"].as_str().unwrap());
    rp.verify_authentication(&fx["authenticationResponse"].to_string(), &auth, &mut stored).unwrap();
    let (_, auth2) = rp.authentication_options(&stored).unwrap();
    let auth2 = with_challenge(&auth2, "ast", fx["authenticationChallenge"].as_str().unwrap());
    let replay = rp.verify_authentication(&fx["authenticationResponse"].to_string(), &auth2, &mut stored);
    assert!(matches!(replay, Err(WebauthnError::CredentialPossibleCompromise)), "{replay:?}");
}
