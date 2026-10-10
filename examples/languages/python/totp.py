# SPDX-License-Identifier: Apache-2.0
"""HOTP/TOTP one-time passwords for MFA (RFC 4226, RFC 6238).

Uses the standard library hmac/hashlib/secrets. Store the shared secret encrypted at rest,
rate-limit verification and remember the last accepted counter per user to block replay.
"""
import base64
import hashlib
import hmac
import math
import re
import secrets
from urllib.parse import quote

_HASHES = {"SHA1": hashlib.sha1, "SHA256": hashlib.sha256, "SHA512": hashlib.sha512}
_BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567"


def _check(digits: int, algorithm: str) -> None:
    if isinstance(digits, bool) or not isinstance(digits, int) or not 6 <= digits <= 10:
        raise ValueError("digits must be an integer from 6 to 10")
    if algorithm not in _HASHES:
        raise ValueError(f"unsupported algorithm: {algorithm!r}")


def hotp(secret: bytes, counter: int, digits: int = 6, algorithm: str = "SHA1") -> str:
    """RFC 4226 HOTP with dynamic truncation, zero-padded."""
    _check(digits, algorithm)
    if isinstance(counter, bool) or not isinstance(counter, int) or not 0 <= counter < 2**64:
        raise ValueError("counter must be an unsigned 64-bit integer")
    mac = hmac.new(bytes(secret), counter.to_bytes(8, "big"), _HASHES[algorithm]).digest()
    offset = mac[-1] & 0x0F
    binary = int.from_bytes(mac[offset:offset + 4], "big") & 0x7FFFFFFF
    return str(binary % 10**digits).zfill(digits)


def _counter_at(unix_seconds: float, step: int, t0: float) -> int:
    if not math.isfinite(unix_seconds) or not math.isfinite(t0):
        raise ValueError("time values must be finite")
    if isinstance(step, bool) or not isinstance(step, int) or step <= 0:
        raise ValueError("step must be a positive integer")
    counter = math.floor((unix_seconds - t0) / step)
    if counter < 0:
        raise ValueError("time is before t0")
    return counter


def totp(secret: bytes, unix_seconds: float, *, step: int = 30, digits: int = 6,
         algorithm: str = "SHA1", t0: float = 0) -> str:
    """RFC 6238 TOTP for a Unix time in seconds."""
    return hotp(secret, _counter_at(unix_seconds, step, t0), digits, algorithm)


def verify_totp(code: str, secret: bytes, unix_seconds: float, *, window: int = 1, step: int = 30,
                digits: int = 6, algorithm: str = "SHA1", t0: float = 0) -> bool:
    """Accept counters within +/- window; every candidate is compared in constant time."""
    if isinstance(window, bool) or not isinstance(window, int) or not 0 <= window <= 10:
        raise ValueError("window must be an integer from 0 to 10")
    _check(digits, algorithm)
    if not isinstance(code, str) or len(code) != digits or not re.fullmatch(r"[0-9]+", code):
        return False
    now = _counter_at(unix_seconds, step, t0)
    matched = False
    for counter in range(now - window, now + window + 1):
        if counter >= 0 and hmac.compare_digest(hotp(secret, counter, digits, algorithm).encode(), code.encode()):
            matched = True
    return matched


def base32_encode(data: bytes) -> str:
    """RFC 4648 base32 without padding."""
    return base64.b32encode(bytes(data)).decode("ascii").rstrip("=")


def _clean_base32(text: str) -> str:
    return re.sub(r"[\s-]", "", text).upper().rstrip("=")


def base32_decode(text: str) -> bytes:
    """Case-insensitive; ignores spaces, hyphens and trailing '='; raises ValueError otherwise."""
    out = bytearray()
    buffer = bits = 0
    for ch in _clean_base32(text):
        value = _BASE32.find(ch)
        if value < 0:
            raise ValueError(f"invalid base32 character: {ch!r}")
        buffer = ((buffer << 5) | value) & 0xFFFF
        bits += 5
        if bits >= 8:
            out.append((buffer >> (bits - 8)) & 0xFF)
            bits -= 8
    return bytes(out)


def otpauth_uri(issuer: str, account: str, secret_base32: str, digits: int = 6, period: int = 30,
                algorithm: str = "SHA1") -> str:
    """Provisioning URI for authenticator apps (render as a QR code; never log it)."""
    _check(digits, algorithm)
    if not issuer or not account:
        raise ValueError("issuer and account are required")
    if isinstance(period, bool) or not isinstance(period, int) or period <= 0:
        raise ValueError("period must be a positive integer")
    secret = _clean_base32(secret_base32)
    if not base32_decode(secret):
        raise ValueError("secret is empty")
    enc = lambda s: quote(s, safe="")  # noqa: E731 - %20 for spaces, not +
    return (f"otpauth://totp/{enc(issuer)}:{enc(account)}?secret={secret}&issuer={enc(issuer)}"
            f"&algorithm={algorithm}&digits={digits}&period={period}")


def generate_secret(num_bytes: int = 20) -> bytes:
    """Random shared secret from the CSPRNG; 20 bytes (160 bits) is the RFC 4226 recommendation."""
    if isinstance(num_bytes, bool) or not isinstance(num_bytes, int) or not 16 <= num_bytes <= 64:
        raise ValueError("num_bytes must be an integer from 16 to 64")
    return secrets.token_bytes(num_bytes)
