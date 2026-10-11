# SPDX-License-Identifier: Apache-2.0
"""application/x-www-form-urlencoded query strings exactly as the WHATWG URL standard defines them.

parse_query strips one leading '?', skips empty pieces, splits at the first '=', turns '+' into a space,
percent-decodes bytes (an invalid '%' stays literal) and decodes UTF-8 with U+FFFD replacement.
stringify_query keeps A-Z a-z 0-9 * - . _, writes a space as '+' and %XX (uppercase) for every other byte.
"""

_HEX = b"0123456789abcdefABCDEF"
_SAFE = frozenset(b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789*-._")


def _decode(s: str) -> str:
    b = s.replace("+", " ").encode("utf-8")
    out = bytearray()
    i = 0
    while i < len(b):
        if b[i] == 0x25 and i + 2 < len(b) and b[i + 1] in _HEX and b[i + 2] in _HEX:
            out.append(int(b[i + 1:i + 3], 16))
            i += 3
        else:
            out.append(b[i])
            i += 1
    return out.decode("utf-8", "replace")


def _encode(s: str) -> str:
    out = []
    for byte in s.encode("utf-8"):
        if byte in _SAFE:
            out.append(chr(byte))
        elif byte == 0x20:
            out.append("+")
        else:
            out.append(f"%{byte:02X}")
    return "".join(out)


def parse_query(s: str) -> list[list[str]]:
    """Ordered [name, value] pairs of a query string (a leading '?' is ignored); never raises."""
    s = s.removeprefix("?")
    pairs = []
    for piece in s.split("&"):
        if piece == "":
            continue
        name, _, value = piece.partition("=")
        pairs.append([_decode(name), _decode(value)])
    return pairs


def stringify_query(pairs: list[list[str]] | list[tuple[str, str]]) -> str:
    """Serialize [name, value] pairs as 'name=value' joined with '&' (form encoding, space as '+')."""
    return "&".join(_encode(n) + "=" + _encode(v) for n, v in pairs)


def get_all(pairs: list[list[str]] | list[tuple[str, str]], name: str) -> list[str]:
    """Every value for name, in order."""
    return [v for n, v in pairs if n == name]
