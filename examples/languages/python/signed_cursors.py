# SPDX-License-Identifier: Apache-2.0
"""HMAC-SHA256 signed, expiring pagination cursors.

Token: base64url(body) "." base64url(HMAC_SHA256(secret, body)), both without padding, where
body is "v1\\n" + expires_at + "\\n" + values joined by "\\n". The values are visible to clients
(signed, not encrypted); keep the secret server-side and rotate it like any signing key.
"""
import base64
import hashlib
import hmac
import re

MAX_VALUES = 16
MIN_SECRET_BYTES = 32
_B64URL = re.compile(r"[A-Za-z0-9_-]+")


class CursorError(ValueError):
    """kind is one of "malformed", "bad signature" or "expired"; the message starts with it."""

    def __init__(self, kind: str, detail: str = ""):
        super().__init__(kind + (f": {detail}" if detail else ""))
        self.kind = kind


def _check_secret(secret: bytes) -> None:
    if not isinstance(secret, (bytes, bytearray)) or len(secret) < MIN_SECRET_BYTES:
        raise ValueError(f"secret must be at least {MIN_SECRET_BYTES} bytes")


def _b64encode(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


def _b64decode(part: str) -> bytes:
    if not _B64URL.fullmatch(part) or len(part) % 4 == 1:
        raise CursorError("malformed", "invalid base64url")
    return base64.urlsafe_b64decode(part + "=" * (-len(part) % 4))


def encode_cursor(values: list[str], secret: bytes, expires_at: int) -> str:
    """Signs the ordered key values (1 to 16, no newlines) with an expiry in unix seconds."""
    _check_secret(secret)
    if not isinstance(values, (list, tuple)) or not 1 <= len(values) <= MAX_VALUES:
        raise ValueError(f"values must hold 1 to {MAX_VALUES} strings")
    for value in values:
        if not isinstance(value, str) or "\n" in value:
            raise ValueError("values must be strings without newlines")
    if isinstance(expires_at, bool) or not isinstance(expires_at, int) or not 0 < expires_at < 2**63:
        raise ValueError("expires_at must be a positive 64-bit integer")
    body = ("v1\n" + str(expires_at) + "\n" + "\n".join(values)).encode("utf-8")
    mac = hmac.new(bytes(secret), body, hashlib.sha256).digest()
    return _b64encode(body) + "." + _b64encode(mac)


def decode_cursor(token: str, secret: bytes, now: int) -> list[str]:
    """Verifies signature and expiry and returns the values; raises CursorError."""
    _check_secret(secret)
    if isinstance(now, bool) or not isinstance(now, int):
        raise TypeError("now must be an integer")
    if not isinstance(token, str) or "." not in token:
        raise CursorError("malformed", "missing signature")
    body_part, _, mac_part = token.rpartition(".")
    body = _b64decode(body_part)
    _b64decode(mac_part)
    # Compare the canonical encoding so a changed unused trailing bit also fails.
    expected = _b64encode(hmac.new(bytes(secret), body, hashlib.sha256).digest())
    if not hmac.compare_digest(mac_part.encode("ascii"), expected.encode("ascii")):
        raise CursorError("bad signature")
    try:
        lines = body.decode("utf-8").split("\n")
    except UnicodeDecodeError as error:
        raise CursorError("malformed", "body is not UTF-8") from error
    if len(lines) < 3 or lines[0] != "v1" or not re.fullmatch(r"[0-9]+", lines[1]):
        raise CursorError("malformed", "bad header")
    if now >= int(lines[1]):
        raise CursorError("expired")
    return lines[2:]
