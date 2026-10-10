# SPDX-License-Identifier: Apache-2.0
"""Expiring signed URLs: "<target>?...&expires=<unix seconds>&signature=<base64url HMAC-SHA256>".

The MAC covers the path, the existing query and the expiry exactly as sent. Keep the secret on
the server, use HTTPS, and keep expiries short; a signed URL is a bearer credential until it expires.
"""
import base64
import hashlib
import hmac
import re

_DECIMAL = re.compile(r"[0-9]{1,18}")
_SIG = re.compile(r"[A-Za-z0-9_-]{43}")
_MARK = "&signature="


class SignedUrlError(ValueError):
    """kind is one of "malformed", "bad signature" or "expired"; the message starts with it."""

    def __init__(self, kind: str, detail: str = ""):
        super().__init__(kind + (f": {detail}" if detail else ""))
        self.kind = kind


def _key(secret: "str | bytes") -> bytes:
    key = secret.encode("utf-8") if isinstance(secret, str) else bytes(secret)
    if not key:
        raise ValueError("secret must not be empty")
    return key


def _mac(key: bytes, message: str) -> str:
    digest = hmac.new(key, message.encode("utf-8"), hashlib.sha256).digest()
    return base64.urlsafe_b64encode(digest).rstrip(b"=").decode("ascii")


def _param_names(target: str) -> list[str]:
    _, _, query = target.partition("?")
    return [p.split("=", 1)[0] for p in query.split("&") if p]


def _seconds(value: int, name: str) -> int:
    if isinstance(value, bool) or not isinstance(value, int) or value < 0:
        raise ValueError(f"{name} must be a non-negative integer of unix seconds")
    return value


def sign_url(target: str, secret: "str | bytes", expires_unix_seconds: int) -> str:
    if not isinstance(target, str) or not target.startswith("/") or "#" in target:
        raise ValueError("target must be a path (plus optional query) starting with '/' and without '#'")
    names = _param_names(target)
    if "expires" in names or "signature" in names:
        raise ValueError("target already has an expires or signature parameter")
    key = _key(secret)
    message = target + ("&" if "?" in target else "?") + "expires=" + str(_seconds(expires_unix_seconds, "expires"))
    return message + _MARK + _mac(key, message)


def verify_url(signed: str, secret: "str | bytes", now_unix_seconds: int) -> int:
    """Returns the expiry; raises SignedUrlError("malformed"|"bad signature"|"expired")."""
    key = _key(secret)
    now = _seconds(now_unix_seconds, "now")
    if not isinstance(signed, str):
        raise SignedUrlError("malformed", "signed URL must be a string")
    cut = signed.rfind(_MARK)
    if cut < 0:
        raise SignedUrlError("malformed", "missing signature")
    message, signature = signed[:cut], signed[cut + len(_MARK):]
    if not _SIG.fullmatch(signature):
        raise SignedUrlError("malformed", "signature must be 43 base64url characters at the end")
    _, _, query = message.partition("?")
    expires = [p[len("expires="):] for p in query.split("&") if p.split("=", 1)[0] == "expires"]
    if len(expires) != 1 or not _DECIMAL.fullmatch(expires[0]):
        raise SignedUrlError("malformed", "need exactly one decimal expires parameter")
    if not hmac.compare_digest(_mac(key, message).encode("ascii"), signature.encode("ascii")):
        raise SignedUrlError("bad signature")
    expiry = int(expires[0])
    if now > expiry:
        raise SignedUrlError("expired")
    return expiry
