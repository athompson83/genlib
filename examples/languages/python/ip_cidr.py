# SPDX-License-Identifier: Apache-2.0
"""IP address parsing, CIDR matching and an SSRF guard (standard library only, hand-parsed).

SSRF use: resolve the hostname yourself, check EVERY resolved address with is_public_ip, then
connect to that checked address (no second DNS lookup) and re-check after every redirect.
"""
import re

_V4_PART = re.compile(r"0|[1-9][0-9]{0,2}")
_HEX = re.compile(r"[0-9A-Fa-f]{1,4}")
_MAPPED = b"\0" * 10 + b"\xff\xff"
_NAT64 = bytes.fromhex("0064ff9b0000000000000000")


def _parse_v4(text: str) -> bytes:
    parts = text.split(".")
    if len(parts) != 4:
        raise ValueError(f"invalid IPv4 address: {text!r}")
    out = []
    for p in parts:
        if not _V4_PART.fullmatch(p) or int(p) > 255:
            raise ValueError(f"invalid IPv4 address: {text!r}")
        out.append(int(p))
    return bytes(out)


def _groups(text: str, original: str) -> list:
    if text == "":
        return []
    groups = text.split(":")
    for h in groups:
        if not _HEX.fullmatch(h):
            raise ValueError(f"invalid IPv6 address: {original!r}")
    return [int(h, 16) for h in groups]


def _parse_v6(text: str) -> bytes:
    original = text
    if text.count("::") > 1 or not re.fullmatch(r"[0-9A-Fa-f:.]+", text):
        raise ValueError(f"invalid IPv6 address: {original!r}")
    tail = b""
    if "." in text:
        i = text.rfind(":")
        tail = _parse_v4(text[i + 1:])
        text = text[:i + 1] if text[i - 1:i + 1] == "::" else text[:i]
    need = 6 if tail else 8
    if "::" in text:
        a, b = text.split("::")
        ga, gb = _groups(a, original), _groups(b, original)
        if len(ga) + len(gb) > need - 1:
            raise ValueError(f"invalid IPv6 address: {original!r}")
        groups = ga + [0] * (need - len(ga) - len(gb)) + gb
    else:
        groups = _groups(text, original)
        if len(groups) != need:
            raise ValueError(f"invalid IPv6 address: {original!r}")
    return b"".join(g.to_bytes(2, "big") for g in groups) + tail


def parse_ip(text: str) -> bytes:
    """Return 4 (IPv4) or 16 (IPv6) bytes; raise ValueError for anything else (zones, brackets, spaces)."""
    if not isinstance(text, str):
        raise ValueError("address must be a string")
    return _parse_v6(text) if ":" in text else _parse_v4(text)


def format_ip(raw: bytes) -> str:
    """RFC 5952 text for 4 or 16 address bytes."""
    if len(raw) == 4:
        return ".".join(map(str, raw))
    if raw[:12] == _MAPPED:
        return "::ffff:" + ".".join(map(str, raw[12:]))
    g = [int.from_bytes(raw[i:i + 2], "big") for i in range(0, 16, 2)]
    best, best_len, i = -1, 1, 0
    while i < 8:
        if g[i] == 0:
            j = i
            while j < 8 and g[j] == 0:
                j += 1
            if j - i > best_len:
                best, best_len = i, j - i
            i = j
        else:
            i += 1
    h = [format(x, "x") for x in g]
    if best < 0:
        return ":".join(h)
    return ":".join(h[:best]) + "::" + ":".join(h[best + best_len:])


def canonical_ip(text: str) -> str:
    return format_ip(parse_ip(text))


def parse_cidr(cidr: str) -> "tuple[bytes, int]":
    if not isinstance(cidr, str) or cidr.count("/") != 1:
        raise ValueError(f"invalid CIDR: {cidr!r}")
    addr, prefix = cidr.split("/")
    raw = parse_ip(addr)
    if not _V4_PART.fullmatch(prefix) or int(prefix) > len(raw) * 8:
        raise ValueError(f"invalid CIDR prefix: {cidr!r}")
    p, bits = int(prefix), len(raw) * 8
    if int.from_bytes(raw, "big") & ((1 << (bits - p)) - 1):
        raise ValueError(f"CIDR has host bits set: {cidr!r}")
    return raw, p


def cidr_contains(cidr: str, ip: str) -> bool:
    """True when ip is inside cidr; different families never match."""
    net, p = parse_cidr(cidr)
    x = parse_ip(ip)
    if len(x) != len(net):
        return False
    shift = len(net) * 8 - p
    return (int.from_bytes(x, "big") >> shift) == (int.from_bytes(net, "big") >> shift)


V4_SPECIAL = ("0.0.0.0/8", "10.0.0.0/8", "100.64.0.0/10", "127.0.0.0/8", "169.254.0.0/16", "172.16.0.0/12",
              "192.0.0.0/24", "192.0.2.0/24", "192.88.99.0/24", "192.168.0.0/16", "198.18.0.0/15",
              "198.51.100.0/24", "203.0.113.0/24", "224.0.0.0/4", "240.0.0.0/4")
V6_SPECIAL = ("::/128", "::1/128", "100::/64", "2001::/23", "2001:db8::/32", "2002::/16", "fc00::/7",
              "fe80::/10", "ff00::/8")


def is_public_ip(ip: str) -> bool:
    """False for private, loopback, link-local, documentation, multicast and other special ranges."""
    raw = parse_ip(ip)
    if len(raw) == 16 and raw[:12] in (_MAPPED, _NAT64):
        raw = raw[12:]
    text = format_ip(raw)
    return not any(cidr_contains(c, text) for c in (V4_SPECIAL if len(raw) == 4 else V6_SPECIAL))
