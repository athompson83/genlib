# SPDX-License-Identifier: Apache-2.0
"""Time-ordered identifiers: UUIDv7 (RFC 9562) and ULID.

The deterministic builders take the Unix time in milliseconds and ten random bytes, so
tests and replays are reproducible; new_uuid_v7 and new_ulid use the system clock and
the operating system CSPRNG.
"""
import secrets
import time

CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"
MAX_UNIX_MS = (1 << 48) - 1
_HEX = frozenset("0123456789abcdef")


def _check(unix_ms: int, random10: bytes) -> None:
    if isinstance(unix_ms, bool) or not isinstance(unix_ms, int) or not 0 <= unix_ms <= MAX_UNIX_MS:
        raise ValueError("unix_ms must be an integer in [0, 2^48 - 1]")
    if not isinstance(random10, (bytes, bytearray)) or len(random10) != 10:
        raise ValueError("random10 must be exactly 10 bytes")


def uuid_v7(unix_ms: int, random10: bytes) -> str:
    """Lowercase 8-4-4-4-12 UUIDv7 from a 48-bit millisecond timestamp and 10 random bytes."""
    _check(unix_ms, random10)
    b = bytearray(unix_ms.to_bytes(6, "big") + bytes(random10))
    b[6] = 0x70 | (b[6] & 0x0F)
    b[8] = 0x80 | (b[8] & 0x3F)
    h = b.hex()
    return f"{h[0:8]}-{h[8:12]}-{h[12:16]}-{h[16:20]}-{h[20:32]}"


def ulid(unix_ms: int, random10: bytes) -> str:
    """26-character Crockford base32 ULID of (unix_ms << 80) | random."""
    _check(unix_ms, random10)
    value = (unix_ms << 80) | int.from_bytes(random10, "big")
    return "".join(CROCKFORD[(value >> (5 * (25 - i))) & 31] for i in range(26))


def uuid_v7_time(text: str) -> int:
    """Returns the Unix milliseconds of a UUIDv7; raises ValueError for anything else."""
    if not isinstance(text, str) or len(text) != 36:
        raise ValueError("UUID must be 36 characters")
    lower = text.lower()
    if any(lower[i] != "-" for i in (8, 13, 18, 23)):
        raise ValueError("UUID must use 8-4-4-4-12 dashes")
    digits = lower.replace("-", "")
    if len(digits) != 32 or not set(digits) <= _HEX:
        raise ValueError("UUID must be hexadecimal")
    if digits[12] != "7":
        raise ValueError("not a version 7 UUID")
    if digits[16] not in "89ab":
        raise ValueError("UUID variant must be RFC 9562")
    return int(digits[:12], 16)


def ulid_time(text: str) -> int:
    """Returns the Unix milliseconds of a ULID; raises ValueError for anything else."""
    if not isinstance(text, str) or len(text) != 26:
        raise ValueError("ULID must be 26 characters")
    upper = text.upper()
    if any(c not in CROCKFORD for c in upper):
        raise ValueError("ULID must use Crockford base32")
    if upper[0] > "7":
        raise ValueError("ULID overflows 128 bits")
    value = 0
    for c in upper[:10]:
        value = value * 32 + CROCKFORD.index(c)
    return value


def new_uuid_v7() -> str:
    return uuid_v7(time.time_ns() // 1_000_000, secrets.token_bytes(10))


def new_ulid() -> str:
    return ulid(time.time_ns() // 1_000_000, secrets.token_bytes(10))
