# SPDX-License-Identifier: Apache-2.0
"""Thin wrapper around PyJWT for verifying OIDC ID tokens / JWT access tokens.

PyJWT does signature, alg allow-list, iss/aud/exp/nbf/iat with leeway; PyJWKClient
caches the JWKS and refetches it when a token carries an unknown ``kid``.
This module only fixes the policy and adds the nonce check.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Sequence

import jwt
from jwt import PyJWKClient

FORBIDDEN_ALGS = {"none", "HS256", "HS384", "HS512"}


class TokenInvalid(Exception):
    pass


@dataclass
class OidcVerifier:
    issuer: str
    audience: str | Sequence[str]
    jwks_uri: str  # from discovery; must be https in production
    algorithms: Sequence[str] = ("RS256", "ES256")
    leeway_seconds: int = 60
    jwks_cache_seconds: int = 600
    _jwks: PyJWKClient = field(init=False, repr=False)

    def __post_init__(self) -> None:
        if FORBIDDEN_ALGS.intersection(self.algorithms):
            raise ValueError("symmetric or 'none' algorithms are not allowed with a public JWKS")
        self._jwks = PyJWKClient(self.jwks_uri, cache_jwk_set=True, lifespan=self.jwks_cache_seconds, timeout=5)

    def verify(self, token: str, *, nonce: str | None = None) -> dict[str, Any]:
        try:
            # Looks up the kid in the cached JWKS; on a miss refetches once.
            key = self._jwks.get_signing_key_from_jwt(token)
            claims = jwt.decode(
                token,
                key=key.key,
                algorithms=list(self.algorithms),
                audience=self.audience,
                issuer=self.issuer,
                leeway=self.leeway_seconds,
                options={"require": ["iss", "aud", "exp", "iat", "sub"]},
            )
        except (jwt.PyJWTError, jwt.PyJWKClientError) as e:
            raise TokenInvalid(f"{type(e).__name__}: {e}") from e
        # nonce binds an ID token to the authorization request (OIDC Core 3.1.3.7)
        if nonce is not None and claims.get("nonce") != nonce:
            raise TokenInvalid("nonce mismatch")
        return claims
