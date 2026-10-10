# SPDX-License-Identifier: Apache-2.0
"""Strict base32 (RFC 4648 sections 6 and 7), Bitcoin base58 and unpadded base64url (RFC 4648 section 5).

Hand-written so every Genlib language accepts and rejects exactly the same inputs. Decoders raise
ValueError for unknown characters, bad padding or lengths, and non-canonical trailing bits.
"""

_B32 = {"rfc4648": "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567", "hex": "0123456789ABCDEFGHIJKLMNOPQRSTUV"}
_B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz"
_B64U = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_"


def _alphabet(name: str) -> str:
    if name not in _B32:
        raise ValueError("base32 alphabet must be 'rfc4648' or 'hex'")
    return _B32[name]


def base32_encode(data: bytes, alphabet: str = "rfc4648", padding: bool = True) -> str:
    table, bits, n, out = _alphabet(alphabet), 0, 0, []
    for byte in bytes(data):
        bits, n = ((bits << 8) | byte) & 0xFFFF, n + 8
        while n >= 5:
            n -= 5
            out.append(table[(bits >> n) & 31])
    if n:
        out.append(table[(bits << (5 - n)) & 31])
    text = "".join(out)
    return text + "=" * (-len(text) % 8) if padding else text


def base32_decode(text: str, alphabet: str = "rfc4648", padding: bool = True) -> bytes:
    """Case-insensitive; padded input needs a multiple of 8 and 0, 1, 3, 4 or 6 '='."""
    table, t = _alphabet(alphabet), text.upper()
    if padding:
        if len(t) % 8:
            raise ValueError("padded base32 length must be a multiple of 8")
        body = t.rstrip("=")
        if len(t) - len(body) not in (0, 1, 3, 4, 6):
            raise ValueError("invalid base32 padding")
        t = body
    elif "=" in t:
        raise ValueError("unexpected base32 padding")
    if len(t) % 8 in (1, 3, 6):
        raise ValueError("invalid base32 length")
    bits, n, out = 0, 0, bytearray()
    for ch in t:
        i = table.find(ch)
        if i < 0:
            raise ValueError(f"invalid base32 character {ch!r}")
        bits, n = ((bits << 5) | i) & 0xFFFF, n + 5
        if n >= 8:
            n -= 8
            out.append((bits >> n) & 255)
    if bits & ((1 << n) - 1):
        raise ValueError("non-canonical base32 (non-zero trailing bits)")
    return bytes(out)


def base58_encode(data: bytes) -> str:
    data = bytes(data)
    zeros = len(data) - len(data.lstrip(b"\0"))
    num, out = int.from_bytes(data, "big"), []
    while num:
        num, r = divmod(num, 58)
        out.append(_B58[r])
    return "1" * zeros + "".join(reversed(out))


def base58_decode(text: str) -> bytes:
    num = 0
    for ch in text:
        i = _B58.find(ch)
        if i < 0:
            raise ValueError(f"invalid base58 character {ch!r}")
        num = num * 58 + i
    zeros = len(text) - len(text.lstrip("1"))
    body = num.to_bytes((num.bit_length() + 7) // 8, "big") if num else b""
    return b"\0" * zeros + body


def base64url_encode(data: bytes) -> str:
    data, out = bytes(data), []
    for i in range(0, len(data), 3):
        chunk = data[i:i + 3]
        v = int.from_bytes(chunk + b"\0" * (3 - len(chunk)), "big")
        out.extend(_B64U[(v >> s) & 63] for s in (18, 12, 6, 0)[:len(chunk) + 1])
    return "".join(out)


def base64url_decode(text: str) -> bytes:
    """Unpadded base64url only: '=', '+', '/' and length % 4 == 1 are rejected."""
    if len(text) % 4 == 1:
        raise ValueError("invalid base64url length")
    out = bytearray()
    for i in range(0, len(text), 4):
        chunk, v = text[i:i + 4], 0
        for ch in chunk:
            k = _B64U.find(ch)
            if k < 0:
                raise ValueError(f"invalid base64url character {ch!r}")
            v = (v << 6) | k
        nbytes = len(chunk) * 6 // 8
        extra = len(chunk) * 6 - nbytes * 8
        if v & ((1 << extra) - 1):
            raise ValueError("non-canonical base64url (non-zero trailing bits)")
        out += (v >> extra).to_bytes(nbytes, "big")
    return bytes(out)
