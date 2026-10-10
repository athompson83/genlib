// SPDX-License-Identifier: Apache-2.0
//! Local-only test: samael's IdP helpers generate a key + self-signed cert and sign
//! a Response in-process (xmlsec); the SP wrapper must accept it and reject variants.

use std::io::Read;

use base64::Engine;
use base64::engine::general_purpose::STANDARD as B64;
use chrono::{Duration, Utc};
use samael::crypto::{Crypto, CryptoProvider};
use samael::idp::response_builder::build_response_template;
use samael::idp::{CertificateParams, IdentityProvider, KeyType, Rsa};
use samael::schema::Response;
use samael::signature::DigestAlgorithm;
use samael::traits::ToXml;
use saml_sso::Sp;

const ACS: &str = "https://sp.example.test/saml/acs";
const SP: &str = "https://sp.example.test/metadata";
const IDP: &str = "https://idp.example.test/metadata";

struct TestIdp {
    idp: IdentityProvider,
    cert: samael::crypto::CertificateDer,
}

fn new_idp() -> TestIdp {
    let idp = IdentityProvider::generate_new(KeyType::Rsa(Rsa::Rsa2048)).unwrap();
    let cert = idp
        .create_certificate(&CertificateParams {
            common_name: "Test IdP",
            issuer_name: "Test IdP",
            days_until_expiration: 1,
        })
        .unwrap();
    TestIdp { idp, cert }
}

fn metadata(t: &TestIdp) -> String {
    format!(
        r#"<md:EntityDescriptor xmlns:md="urn:oasis:names:tc:SAML:2.0:metadata" xmlns:ds="http://www.w3.org/2000/09/xmldsig#" entityID="{IDP}"><md:IDPSSODescriptor protocolSupportEnumeration="urn:oasis:names:tc:SAML:2.0:protocol"><md:KeyDescriptor use="signing"><ds:KeyInfo><ds:X509Data><ds:X509Certificate>{}</ds:X509Certificate></ds:X509Data></ds:KeyInfo></md:KeyDescriptor><md:SingleSignOnService Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-Redirect" Location="https://idp.example.test/sso"/></md:IDPSSODescriptor></md:EntityDescriptor>"#,
        B64.encode(t.cert.der_data())
    )
}

fn signed(t: &TestIdp, irt: &str, edit: impl FnOnce(&mut Response)) -> String {
    signed_with(t, irt, DigestAlgorithm::Sha256, edit)
}

fn signed_with(
    t: &TestIdp,
    irt: &str,
    digest: DigestAlgorithm,
    edit: impl FnOnce(&mut Response),
) -> String {
    let mut r = build_response_template(&t.cert, "alice@example.test", SP, IDP, ACS, irt, &[]);
    // samael's template uses a SHA-1 digest; the SP policy only allows SHA-2.
    r.signature.as_mut().unwrap().signed_info.reference[0]
        .digest_method
        .algorithm = digest;
    // ...and leaves SubjectConfirmationData NotOnOrAfter unset, which the SP requires.
    let a = r.assertion.as_mut().unwrap();
    a.subject
        .as_mut()
        .unwrap()
        .subject_confirmations
        .as_mut()
        .unwrap()[0]
        .subject_confirmation_data
        .as_mut()
        .unwrap()
        .not_on_or_after = Some(Utc::now() + Duration::minutes(5));
    edit(&mut r);
    let xml = r.to_string().unwrap();
    let out = Crypto::sign_xml(
        xml.as_str(),
        t.idp.export_private_key_der().unwrap().as_slice(),
    )
    .unwrap();
    B64.encode(out)
}

fn request_id_from(sp: &Sp) -> String {
    let (url, id) = sp.login_redirect("rs-1").unwrap();
    assert!(url.as_str().starts_with("https://idp.example.test/sso?"));
    let req = url
        .query_pairs()
        .find(|(k, _)| k == "SAMLRequest")
        .unwrap()
        .1
        .to_string();
    let mut xml = String::new();
    flate2::read::DeflateDecoder::new(B64.decode(req).unwrap().as_slice())
        .read_to_string(&mut xml)
        .unwrap();
    assert!(
        xml.contains("AuthnRequest")
            && xml.contains(&format!("AssertionConsumerServiceURL=\"{ACS}\""))
            && xml.contains(&id)
    );
    id
}

#[test]
fn authn_request_and_response_validation() {
    let idp = new_idp();
    let other = new_idp();
    let sp = Sp::new(SP, ACS, &metadata(&idp)).unwrap();

    let id = request_id_from(&sp);
    let a = sp
        .parse_acs(&signed(&idp, &id, |_| {}), &[&id])
        .expect("valid response");
    assert_eq!(
        a.subject.unwrap().name_id.unwrap().value,
        "alice@example.test"
    );
    assert!(
        sp.parse_acs(&signed(&idp, &id, |_| {}), &[]).is_err(),
        "no pending request"
    );

    type Edit = Box<dyn FnOnce(&mut Response)>;
    let cases: Vec<(&str, Edit)> = vec![
        (
            "audience",
            Box::new(|r| {
                r.assertion
                    .as_mut()
                    .unwrap()
                    .conditions
                    .as_mut()
                    .unwrap()
                    .audience_restrictions
                    .as_mut()
                    .unwrap()[0]
                    .audience = vec!["https://other-sp".into()]
            }),
        ),
        (
            "recipient",
            Box::new(|r| {
                r.assertion
                    .as_mut()
                    .unwrap()
                    .subject
                    .as_mut()
                    .unwrap()
                    .subject_confirmations
                    .as_mut()
                    .unwrap()[0]
                    .subject_confirmation_data
                    .as_mut()
                    .unwrap()
                    .recipient = Some("https://evil/acs".into())
            }),
        ),
        (
            "destination",
            Box::new(|r| r.destination = Some("https://evil/acs".into())),
        ),
        (
            "expired",
            Box::new(|r| {
                r.assertion
                    .as_mut()
                    .unwrap()
                    .conditions
                    .as_mut()
                    .unwrap()
                    .not_on_or_after = Some(Utc::now() - Duration::minutes(10))
            }),
        ),
        (
            "issuer",
            Box::new(|r| {
                r.assertion.as_mut().unwrap().issuer.value = Some("https://evil-idp".into())
            }),
        ),
    ];
    for (name, edit) in cases {
        let id = request_id_from(&sp);
        let err = sp.parse_acs(&signed(&idp, &id, edit), &[&id]);
        assert!(err.is_err(), "{name} should be rejected");
        eprintln!("{name}: {}", err.unwrap_err());
    }
    let id = request_id_from(&sp);
    assert!(
        sp.parse_acs(
            &signed_with(&idp, &id, DigestAlgorithm::Sha1, |_| {}),
            &[&id]
        )
        .is_err(),
        "SHA-1 digest"
    );
    let id = request_id_from(&sp);
    assert!(
        sp.parse_acs(&signed(&other, &id, |_| {}), &[&id]).is_err(),
        "untrusted signer"
    );
    let id = request_id_from(&sp);
    assert!(
        sp.parse_acs(&signed(&idp, "_other", |_| {}), &[&id])
            .is_err(),
        "InResponseTo"
    );
    let id = request_id_from(&sp);
    let raw = String::from_utf8(B64.decode(signed(&idp, &id, |_| {})).unwrap())
        .unwrap()
        .replace("alice@", "admin@");
    assert!(sp.parse_acs(&B64.encode(raw), &[&id]).is_err(), "tampered");

    assert!(
        Sp::new(
            SP,
            ACS,
            &metadata(&idp).replace("use=\"signing\"", "use=\"encryption\"")
        )
        .is_err(),
        "metadata without signing cert"
    );
}
