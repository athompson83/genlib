# SPDX-License-Identifier: Apache-2.0
"""OAuth 2.0 authorization code + PKCE request side for OpenID Connect SSO.

SCOPE: this builds and checks the browser leg only (verifier, challenge, state, nonce,
authorization URL, callback parsing, token request body). ID token and access token
VERIFICATION (signature, issuer, audience, expiry, nonce) must use a vetted OIDC/JOSE library
(see the Tier B cookbook). Never decode a token to make an auth decision here.
Keep the verifier, state and nonce in a server-side session bound to one login.
"""
import base64
import hashlib
import hmac
import re
import secrets
from collections.abc import Iterable, Mapping
from urllib.parse import parse_qs, quote, urlencode, urlsplit

_UNRESERVED = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~"
_RESERVED = {"response_type", "client_id", "redirect_uri", "scope", "state", "nonce",
             "code_challenge", "code_challenge_method"}


class OAuthCallbackError(Exception):
    """`error` is the provider's OAuth error code, or state_mismatch / missing_code / invalid_callback."""

    def __init__(self, error: str, error_description: str | None = None):
        super().__init__(f"{error}: {error_description}" if error_description else error)
        self.error = error
        self.error_description = error_description


def _b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).decode("ascii").rstrip("=")


def generate_code_verifier(length: int = 64) -> str:
    """RFC 7636 verifier: 43-128 unreserved characters from the CSPRNG (secrets.choice is unbiased)."""
    if isinstance(length, bool) or not isinstance(length, int) or not 43 <= length <= 128:
        raise ValueError("verifier length must be from 43 to 128")
    return "".join(secrets.choice(_UNRESERVED) for _ in range(length))


def code_challenge_s256(verifier: str) -> str:
    """base64url(SHA-256(ASCII verifier)) without padding."""
    if not isinstance(verifier, str) or not re.fullmatch(r"[A-Za-z0-9._~-]{43,128}", verifier):
        raise ValueError("invalid code verifier")
    return _b64url(hashlib.sha256(verifier.encode("ascii")).digest())


def random_token(num_bytes: int = 32) -> str:
    """Opaque random value for state and nonce."""
    if isinstance(num_bytes, bool) or not isinstance(num_bytes, int) or not 16 <= num_bytes <= 256:
        raise ValueError("num_bytes must be from 16 to 256")
    return _b64url(secrets.token_bytes(num_bytes))


def _check_endpoint(raw: str) -> None:
    try:
        url = urlsplit(raw)
        host = url.hostname
    except ValueError as exc:
        raise ValueError("authorization_endpoint is not a valid URL") from exc
    loopback = url.scheme == "http" and host in ("localhost", "127.0.0.1")
    if url.scheme != "https" and not loopback:
        raise ValueError("authorization_endpoint must use https (http only for localhost)")
    if not host:
        raise ValueError("authorization_endpoint has no host")
    if "#" in raw:
        raise ValueError("authorization_endpoint must not contain a fragment")


def build_authorization_url(*, authorization_endpoint: str, client_id: str, redirect_uri: str,
                            scope: str | Iterable[str], state: str, nonce: str, code_challenge: str,
                            extra_params: Mapping[str, str] | Iterable[tuple[str, str]] | None = None) -> str:
    _check_endpoint(authorization_endpoint)
    scopes = scope.split() if isinstance(scope, str) else list(scope)
    if "openid" not in scopes:
        raise ValueError('scope must include "openid"')
    required = {"client_id": client_id, "redirect_uri": redirect_uri, "state": state,
                "nonce": nonce, "code_challenge": code_challenge}
    for name, value in required.items():
        if not value:
            raise ValueError(f"{name} is required")
    params = [("response_type", "code"), ("client_id", client_id), ("redirect_uri", redirect_uri),
              ("scope", " ".join(scopes)), ("state", state), ("nonce", nonce),
              ("code_challenge", code_challenge), ("code_challenge_method", "S256")]
    extra = extra_params.items() if isinstance(extra_params, Mapping) else (extra_params or ())
    for name, value in extra:
        if name in _RESERVED:
            raise ValueError(f"extra_params must not override {name}")
        params.append((name, value))
    query = "&".join(f"{quote(k, safe='')}={quote(v, safe='')}" for k, v in params)
    if "?" not in authorization_endpoint:
        separator = "?"
    else:
        separator = "" if authorization_endpoint.endswith(("?", "&")) else "&"
    return authorization_endpoint + separator + query


def parse_callback(callback_url: str, expected_state: str) -> dict[str, str]:
    """Parse the provider redirect. Raises OAuthCallbackError; returns {"code": ...}."""
    try:
        params = parse_qs(urlsplit(callback_url).query, keep_blank_values=True)
    except ValueError as exc:
        raise OAuthCallbackError("invalid_callback", "Callback is not a valid URL") from exc
    for name in ("code", "state", "error"):
        if len(params.get(name, [])) > 1:
            raise OAuthCallbackError("invalid_callback", f"Duplicate {name} parameter")
    one = lambda name: params.get(name, [None])[0]  # noqa: E731
    if one("error") is not None:
        raise OAuthCallbackError(one("error"), one("error_description"))
    state = one("state") or ""
    if not expected_state or not hmac.compare_digest(state.encode(), expected_state.encode()):
        raise OAuthCallbackError("state_mismatch")
    code = one("code")
    if not code:
        raise OAuthCallbackError("missing_code")
    return {"code": code}


def token_request_body(*, code: str, redirect_uri: str, client_id: str, code_verifier: str) -> str:
    """application/x-www-form-urlencoded body for the token endpoint (POST it server-side)."""
    fields = [("grant_type", "authorization_code"), ("code", code), ("redirect_uri", redirect_uri),
              ("client_id", client_id), ("code_verifier", code_verifier)]
    for name, value in fields:
        if not value:
            raise ValueError(f"{name} is required")
    return urlencode(fields)
