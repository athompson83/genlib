# SPDX-License-Identifier: Apache-2.0
"""Base58 (Bitcoin alphabet) and Base58Check.

Leading zero bytes become leading '1' characters; the rest is the big-endian number in base 58,
converted digit by digit on byte arrays. Base58Check appends the first 4 bytes of
SHA-256(SHA-256(payload)) and verifies them on decode. The alphabet omits 0, O, I and l.
"""

import hashlib

ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz"
_INDEX = {c: i for i, c in enumerate(ALPHABET)}


class Base58Error(ValueError):
    """Raised for a character outside the alphabet or a bad Base58Check checksum."""


def base58_encode(data: bytes) -> str:
    """Encode bytes as Base58 (Bitcoin alphabet)."""
    zeros = 0
    while zeros < len(data) and data[zeros] == 0:
        zeros += 1
    digits: list[int] = []  # little-endian base-58 digits
    for byte in data[zeros:]:
        carry = byte
        for i, d in enumerate(digits):
            carry += d * 256
            digits[i] = carry % 58
            carry //= 58
        while carry:
            digits.append(carry % 58)
            carry //= 58
    return "1" * zeros + "".join(ALPHABET[d] for d in reversed(digits))


def base58_decode(text: str) -> bytes:
    """Decode Base58 text to bytes; raises Base58Error for a character outside the alphabet."""
    zeros = 0
    while zeros < len(text) and text[zeros] == "1":
        zeros += 1
    out: list[int] = []  # little-endian bytes
    for c in text:
        carry = _INDEX.get(c)
        if carry is None:
            raise Base58Error("invalid base58 character")
        for i, b in enumerate(out):
            carry += b * 58
            out[i] = carry & 0xFF
            carry >>= 8
        while carry:
            out.append(carry & 0xFF)
            carry >>= 8
    return bytes(zeros) + bytes(reversed(out))


def _checksum(payload: bytes) -> bytes:
    return hashlib.sha256(hashlib.sha256(payload).digest()).digest()[:4]


def base58check_encode(payload: bytes) -> str:
    """Encode payload plus its 4-byte double-SHA-256 checksum as Base58."""
    return base58_encode(bytes(payload) + _checksum(bytes(payload)))


def base58check_decode(text: str) -> bytes:
    """Decode Base58Check text and return the payload; raises Base58Error for a short input or bad checksum."""
    data = base58_decode(text)
    if len(data) < 4:
        raise Base58Error("too short for a checksum")
    payload, check = data[:-4], data[-4:]
    if _checksum(payload) != check:
        raise Base58Error("checksum mismatch")
    return payload
