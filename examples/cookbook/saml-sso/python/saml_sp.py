# SPDX-License-Identifier: Apache-2.0
"""Thin service-provider wrapper around python3-saml (OneLogin SAML toolkit).

python3-saml (strict mode) validates: XML signature against the configured IdP cert,
Issuer, Audience, Response Destination, SubjectConfirmationData Recipient/NotOnOrAfter,
Conditions NotBefore/NotOnOrAfter (fixed 300 s drift), and InResponseTo when the caller
passes the request ID it stored at login time. It does NOT keep a replay cache: the
caller must store the AuthnRequest ID server-side (session) and discard it after use.
"""
from __future__ import annotations

from dataclasses import dataclass
from urllib.parse import urlparse

from onelogin.saml2.auth import OneLogin_Saml2_Auth


class SamlError(Exception):
    pass


@dataclass(frozen=True)
class SpConfig:
    sp_entity_id: str
    acs_url: str
    idp_entity_id: str
    idp_sso_url: str
    idp_cert_pem: str


def _settings(cfg: SpConfig) -> dict:
    return {
        "strict": True,  # never disable: strict mode is what enables the checks above
        "debug": False,
        "sp": {
            "entityId": cfg.sp_entity_id,
            "assertionConsumerService": {"url": cfg.acs_url, "binding": "urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST"},
            "NameIDFormat": "urn:oasis:names:tc:SAML:1.1:nameid-format:unspecified",
        },
        "idp": {
            "entityId": cfg.idp_entity_id,
            "singleSignOnService": {"url": cfg.idp_sso_url, "binding": "urn:oasis:names:tc:SAML:2.0:bindings:HTTP-Redirect"},
            "x509cert": cfg.idp_cert_pem,
        },
        "security": {
            "wantAssertionsSigned": True,
            "wantMessagesSigned": False,  # set True if your IdP signs the whole Response
            "rejectUnsolicitedResponsesWithInResponseTo": True,
            "signatureAlgorithm": "http://www.w3.org/2001/04/xmldsig-more#rsa-sha256",
            "digestAlgorithm": "http://www.w3.org/2001/04/xmlenc#sha256",
            "rejectDeprecatedAlgorithm": True,  # refuse SHA-1 signatures
            "requestedAuthnContext": False,
            "wantAttributeStatement": False,
        },
    }


def _request_data(acs_url: str, post: dict | None = None) -> dict:
    # In a real app build this from the framework request (host, path, https, POST body).
    # Behind a proxy make sure the scheme/host match the public ACS URL, or Destination fails.
    u = urlparse(acs_url)
    return {"https": "on" if u.scheme == "https" else "off", "http_host": u.netloc, "script_name": u.path,
            "get_data": {}, "post_data": post or {}}


def login_redirect(cfg: SpConfig, relay_state: str) -> tuple[str, str]:
    """Return (redirect_url, request_id). Store request_id server-side for the ACS step."""
    auth = OneLogin_Saml2_Auth(_request_data(cfg.acs_url), _settings(cfg))
    url = auth.login(return_to=relay_state)
    return url, auth.get_last_request_id()


def process_acs(cfg: SpConfig, saml_response_b64: str, expected_request_id: str | None) -> dict:
    """Validate a POSTed SAMLResponse. Pass the request ID popped from the session."""
    if not expected_request_id:
        raise SamlError("no pending AuthnRequest (unsolicited or replayed response)")
    auth = OneLogin_Saml2_Auth(_request_data(cfg.acs_url, {"SAMLResponse": saml_response_b64}), _settings(cfg))
    auth.process_response(request_id=expected_request_id)
    if auth.get_errors() or not auth.is_authenticated():
        raise SamlError(f"{auth.get_errors()}: {auth.get_last_error_reason()}")
    return {"name_id": auth.get_nameid(), "session_index": auth.get_session_index(),
            "attributes": auth.get_attributes(), "assertion_id": auth.get_last_assertion_id()}
