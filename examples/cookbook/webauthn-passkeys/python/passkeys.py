# SPDX-License-Identifier: Apache-2.0
"""Thin passkey (WebAuthn) relying-party wrapper over py_webauthn.

The library does all protocol work. This module only fixes the RP settings,
asks for discoverable credentials with user verification, and returns a
record you persist (credential id, COSE public key, sign count, transports).
Store each challenge server-side (session) and consume it exactly once.
"""
from __future__ import annotations

import json
from dataclasses import dataclass, field
from typing import Iterable, Sequence

from webauthn import (
    generate_authentication_options,
    generate_registration_options,
    options_to_json,
    verify_authentication_response,
    verify_registration_response,
)
from webauthn.helpers.structs import (
    AuthenticatorSelectionCriteria,
    AuthenticatorTransport,
    PublicKeyCredentialDescriptor,
    ResidentKeyRequirement,
    UserVerificationRequirement,
)


@dataclass(frozen=True)
class RelyingParty:
    rp_id: str  # registrable domain, e.g. "example.com"
    rp_name: str
    origins: Sequence[str]  # exact origins, e.g. ["https://example.com"]


@dataclass
class StoredCredential:
    credential_id: bytes
    public_key: bytes  # COSE_Key bytes
    sign_count: int
    user_id: bytes
    transports: list[str] = field(default_factory=list)
    backed_up: bool = False


def _descriptors(creds: Iterable[StoredCredential]) -> list[PublicKeyCredentialDescriptor]:
    known = {t.value for t in AuthenticatorTransport}
    return [
        PublicKeyCredentialDescriptor(
            id=c.credential_id,
            transports=[AuthenticatorTransport(t) for t in c.transports if t in known] or None,
        )
        for c in creds
    ]


def registration_options(rp: RelyingParty, user_id: bytes, user_name: str,
                         existing: Iterable[StoredCredential] = ()) -> tuple[str, bytes]:
    """Return (options JSON for navigator.credentials.create, challenge to store)."""
    opts = generate_registration_options(
        rp_id=rp.rp_id,
        rp_name=rp.rp_name,
        user_id=user_id,
        user_name=user_name,
        authenticator_selection=AuthenticatorSelectionCriteria(
            resident_key=ResidentKeyRequirement.REQUIRED,
            user_verification=UserVerificationRequirement.REQUIRED,
        ),
        exclude_credentials=_descriptors(existing),
    )
    return options_to_json(opts), opts.challenge


def verify_registration(rp: RelyingParty, response: str | dict, expected_challenge: bytes,
                        user_id: bytes) -> StoredCredential:
    """Verify a navigator.credentials.create() result; raises on any failure."""
    v = verify_registration_response(
        credential=response,
        expected_challenge=expected_challenge,
        expected_rp_id=rp.rp_id,
        expected_origin=list(rp.origins),
        require_user_verification=True,
    )
    body = json.loads(response) if isinstance(response, str) else response
    return StoredCredential(
        credential_id=v.credential_id,
        public_key=v.credential_public_key,
        sign_count=v.sign_count,
        user_id=user_id,
        transports=list(body.get("response", {}).get("transports", [])),
        backed_up=v.credential_backed_up,
    )


def authentication_options(rp: RelyingParty,
                           allowed: Iterable[StoredCredential] = ()) -> tuple[str, bytes]:
    """Empty `allowed` = discoverable-credential (usernameless) sign-in."""
    opts = generate_authentication_options(
        rp_id=rp.rp_id,
        allow_credentials=_descriptors(allowed),
        user_verification=UserVerificationRequirement.REQUIRED,
    )
    return options_to_json(opts), opts.challenge


def verify_authentication(rp: RelyingParty, response: str | dict, expected_challenge: bytes,
                          stored: StoredCredential) -> StoredCredential:
    """Verify a navigator.credentials.get() result against the stored record.

    Look `stored` up by the response's credential id first, and check that its
    user_id equals the response userHandle when one is present. Persist the
    returned record (updated sign count / backup state).
    """
    v = verify_authentication_response(
        credential=response,
        expected_challenge=expected_challenge,
        expected_rp_id=rp.rp_id,
        expected_origin=list(rp.origins),
        credential_public_key=stored.public_key,
        credential_current_sign_count=stored.sign_count,
        require_user_verification=True,
    )
    stored.sign_count = v.new_sign_count
    stored.backed_up = v.credential_backed_up
    return stored
