# SPDX-License-Identifier: Apache-2.0
"""Stripe-style webhook signatures: header "t=<seconds>,v1=<hex HMAC-SHA256>".

The signed payload is "<t>.<body>". Verification accepts any matching v1 (so senders can
rotate secrets), ignores other schemes such as v0, compares in constant time and rejects
timestamps outside the tolerance window.
"""
import hashlib
import hmac
import re

DEFAULT_TOLERANCE_SECONDS = 300
_DECIMAL = re.compile(r"[0-9]{1,18}")
_V1 = re.compile(r"[0-9a-f]{64}")


class WebhookError(ValueError):
    """kind is one of "malformed", "bad signature" or "expired"; the message starts with it."""

    def __init__(self, kind: str, detail: str = ""):
        super().__init__(kind + (f": {detail}" if detail else ""))
        self.kind = kind


def _bytes(value: "str | bytes", name: str) -> bytes:
    if isinstance(value, str):
        return value.encode("utf-8")
    if isinstance(value, (bytes, bytearray)):
        return bytes(value)
    raise TypeError(f"{name} must be str or bytes")


def _mac(secret: bytes, timestamp: int, body: bytes) -> str:
    return hmac.new(secret, str(timestamp).encode("ascii") + b"." + body, hashlib.sha256).hexdigest()


def _secret(secret: "str | bytes") -> bytes:
    key = _bytes(secret, "secret")
    if not key:
        raise ValueError("secret must not be empty")
    return key


def sign_webhook(secret: "str | bytes", timestamp_seconds: int, body: "str | bytes") -> str:
    if isinstance(timestamp_seconds, bool) or not isinstance(timestamp_seconds, int) or timestamp_seconds < 0:
        raise ValueError("timestamp_seconds must be a non-negative integer")
    key = _secret(secret)
    return f"t={timestamp_seconds},v1={_mac(key, timestamp_seconds, _bytes(body, 'body'))}"


def verify_webhook(header: str, body: "str | bytes", secret: "str | bytes", now_seconds: int,
                   tolerance_seconds: int = DEFAULT_TOLERANCE_SECONDS) -> int:
    """Returns the signed timestamp; raises WebhookError("malformed"|"bad signature"|"expired")."""
    key = _secret(secret)
    payload = _bytes(body, "body")
    if isinstance(now_seconds, bool) or not isinstance(now_seconds, int):
        raise TypeError("now_seconds must be an integer")
    if isinstance(tolerance_seconds, bool) or not isinstance(tolerance_seconds, int) or tolerance_seconds < 0:
        raise ValueError("tolerance_seconds must be a non-negative integer")
    if not isinstance(header, str):
        raise WebhookError("malformed", "header must be a string")
    stamps: list[str] = []
    signatures: list[str] = []
    for part in header.split(","):
        name, eq, value = part.partition("=")
        name, value = name.strip(), value.strip()
        if not eq or not name:
            raise WebhookError("malformed", "expected comma-separated key=value pairs")
        if name == "t":
            stamps.append(value)
        elif name == "v1":
            signatures.append(value)
    if len(stamps) != 1 or not _DECIMAL.fullmatch(stamps[0]):
        raise WebhookError("malformed", "need exactly one decimal t")
    if not signatures or any(not _V1.fullmatch(s) for s in signatures):
        raise WebhookError("malformed", "need v1 signatures of 64 lowercase hex characters")
    timestamp = int(stamps[0])
    expected = _mac(key, timestamp, payload).encode("ascii")
    matched = False
    for signature in signatures:
        matched |= hmac.compare_digest(expected, signature.encode("ascii"))
    if not matched:
        raise WebhookError("bad signature")
    if abs(now_seconds - timestamp) > tolerance_seconds:
        raise WebhookError("expired")
    return timestamp
