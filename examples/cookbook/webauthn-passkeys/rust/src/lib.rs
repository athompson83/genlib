// SPDX-License-Identifier: Apache-2.0
//! Thin passkey relying-party wrapper over `webauthn-rs` (MPL-2.0, Kanidm).
//! The library performs all protocol checks. Store `PasskeyRegistration` /
//! `PasskeyAuthentication` server-side between start and finish, and persist
//! each `Passkey` (serde-serialisable; holds credential id, COSE key, counter).

pub use webauthn_rs::prelude::*;

pub struct Rp {
    webauthn: Webauthn,
}

impl Rp {
    /// `rp_id` must be the origin's host or a registrable suffix of it.
    pub fn new(rp_id: &str, rp_name: &str, origin: &str) -> Result<Self, WebauthnError> {
        let origin = Url::parse(origin).map_err(|_| WebauthnError::Configuration)?;
        let webauthn = WebauthnBuilder::new(rp_id, &origin)?.rp_name(rp_name).build()?;
        Ok(Self { webauthn })
    }

    /// Options for `navigator.credentials.create` (serialise to JSON) plus the state to store.
    pub fn registration_options(
        &self,
        user_id: Uuid,
        user_name: &str,
        existing: &[Passkey],
    ) -> WebauthnResult<(CreationChallengeResponse, PasskeyRegistration)> {
        let exclude: Vec<CredentialID> = existing.iter().map(|p| p.cred_id().clone()).collect();
        self.webauthn.start_passkey_registration(
            user_id,
            user_name,
            user_name,
            if exclude.is_empty() { None } else { Some(exclude) },
        )
    }

    /// Verify the browser's JSON (`RegisterPublicKeyCredential`). Reject the
    /// result if its credential id is already registered to any account.
    pub fn verify_registration(&self, response_json: &str, state: &PasskeyRegistration) -> WebauthnResult<Passkey> {
        let reg: RegisterPublicKeyCredential =
            serde_json::from_str(response_json)?;
        self.webauthn.finish_passkey_registration(&reg, state)
    }

    /// Options for `navigator.credentials.get`, limited to the user's passkeys.
    pub fn authentication_options(
        &self,
        passkeys: &[Passkey],
    ) -> WebauthnResult<(RequestChallengeResponse, PasskeyAuthentication)> {
        self.webauthn.start_passkey_authentication(passkeys)
    }

    /// Verify an assertion and update the matching stored passkey's counter in place.
    /// Persist `passkeys` afterwards when this returns `Ok(true)`.
    pub fn verify_authentication(
        &self,
        response_json: &str,
        state: &PasskeyAuthentication,
        passkeys: &mut [Passkey],
    ) -> WebauthnResult<bool> {
        let cred: PublicKeyCredential =
            serde_json::from_str(response_json)?;
        let result = self.webauthn.finish_passkey_authentication(&cred, state)?;
        let mut changed = false;
        for pk in passkeys.iter_mut() {
            if let Some(updated) = pk.update_credential(&result) {
                changed |= updated;
            }
        }
        Ok(changed)
    }
}
