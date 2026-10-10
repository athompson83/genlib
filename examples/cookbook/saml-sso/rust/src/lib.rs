// SPDX-License-Identifier: Apache-2.0
//! Thin service-provider wrapper around `samael` (feature `xmlsec`, links libxmlsec1).
//!
//! samael verifies the XML signature with xmlsec against the IdP metadata certificates
//! and reduces the document to the signed part, then checks Response Destination,
//! InResponseTo, Issuer, Status, assertion IssueInstant age, Conditions
//! NotBefore/NotOnOrAfter, Audience (when present) and SubjectConfirmationData
//! Recipient/NotOnOrAfter/InResponseTo.
//! This wrapper refuses IdP metadata without signing certificates (samael would then
//! skip signature verification), pins the allowed signature algorithms, and requires
//! an AudienceRestriction naming this SP.

use std::str::FromStr;

use samael::crypto::AllowedSignatureAlgorithm;
use samael::metadata::{EntityDescriptor, HTTP_REDIRECT_BINDING};
use samael::schema::Assertion;
use samael::service_provider::{ServiceProvider, ServiceProviderBuilder};
use url::Url;

pub type Error = Box<dyn std::error::Error + Send + Sync>;

pub struct Sp {
    sp: ServiceProvider,
    entity_id: String,
}

impl Sp {
    /// `idp_metadata_xml`: the IdP's SAML metadata (fetch it out-of-band and pin it).
    pub fn new(sp_entity_id: &str, acs_url: &str, idp_metadata_xml: &str) -> Result<Self, Error> {
        let idp = EntityDescriptor::from_str(idp_metadata_xml).map_err(|e| e.to_string())?;
        let sp = ServiceProviderBuilder::default()
            .entity_id(sp_entity_id.to_string())
            .acs_url(acs_url.to_string())
            .idp_metadata(idp)
            .allow_idp_initiated(false)
            .allowed_signature_algorithms(vec![
                AllowedSignatureAlgorithm::RsaSha256,
                AllowedSignatureAlgorithm::RsaSha384,
                AllowedSignatureAlgorithm::RsaSha512,
                AllowedSignatureAlgorithm::EcdsaSha256,
                AllowedSignatureAlgorithm::EcdsaSha384,
            ])
            .build()
            .map_err(|e| e.to_string())?;
        match sp.idp_signing_certs().map_err(|e| e.to_string())? {
            Some(certs) if !certs.is_empty() => {}
            _ => return Err("IdP metadata has no signing certificate; refusing (signatures would not be checked)".into()),
        }
        Ok(Sp {
            sp,
            entity_id: sp_entity_id.to_string(),
        })
    }

    /// Returns the redirect URL and the AuthnRequest ID to store server-side.
    pub fn login_redirect(&self, relay_state: &str) -> Result<(Url, String), Error> {
        let idp_url = self
            .sp
            .sso_binding_location(HTTP_REDIRECT_BINDING)
            .ok_or("IdP has no HTTP-Redirect SSO endpoint")?;
        let req = self
            .sp
            .make_authentication_request(&idp_url)
            .map_err(|e| e.to_string())?;
        let url = req
            .redirect(relay_state)
            .map_err(|e| e.to_string())?
            .ok_or("no redirect URL")?;
        Ok((url, req.id))
    }

    /// Validate the POSTed base64 SAMLResponse against the pending request IDs.
    pub fn parse_acs(
        &self,
        saml_response_b64: &str,
        pending_request_ids: &[&str],
    ) -> Result<Assertion, Error> {
        if pending_request_ids.is_empty() {
            return Err("no pending AuthnRequest (unsolicited or replayed response)".into());
        }
        let assertion = self
            .sp
            .parse_base64_response(saml_response_b64, Some(pending_request_ids))
            .map_err(|e| e.to_string())?;
        let has_audience = assertion
            .conditions
            .as_ref()
            .and_then(|c| c.audience_restrictions.as_ref())
            .is_some_and(|rs| {
                rs.iter()
                    .any(|r| r.audience.iter().any(|a| a == &self.entity_id))
            });
        if !has_audience {
            return Err("assertion has no AudienceRestriction for this SP".into());
        }
        Ok(assertion)
    }
}
