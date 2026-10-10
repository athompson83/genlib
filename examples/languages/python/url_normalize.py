# SPDX-License-Identifier: Apache-2.0
"""http(s) URL normalization (RFC 3986 section 6) for cache keys, dedupe and allow-list comparison.

Hand-parsed so results are identical across languages. Userinfo is rejected; the fragment is dropped.
"""
import re

from ip_cidr import canonical_ip

_UNRESERVED = frozenset("ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~")
_URL = re.compile(r"([A-Za-z][A-Za-z0-9+.-]*)://([^/?#]*)([^?#]*)(\?[^#]*)?(#.*)?", re.DOTALL)
_AUTH = re.compile(r"(\[[0-9A-Fa-f:.]+\]|[A-Za-z0-9.-]+)(?::([0-9]*))?")
_BAD_PCT = re.compile(r"%(?![0-9A-Fa-f]{2})")
_PCT = re.compile(r"%([0-9A-Fa-f]{2})")


def remove_dot_segments(path: str) -> str:
    """RFC 3986 section 5.2.4."""
    inp, out = path, ""
    while inp:
        if inp.startswith("../"):
            inp = inp[3:]
        elif inp.startswith("./"):
            inp = inp[2:]
        elif inp.startswith("/./"):
            inp = "/" + inp[3:]
        elif inp == "/.":
            inp = "/"
        elif inp.startswith("/../") or inp == "/..":
            inp = "/" + inp[4:]
            out = out[:out.rfind("/")] if "/" in out else ""
        elif inp in (".", ".."):
            inp = ""
        else:
            i = inp.find("/", 1 if inp.startswith("/") else 0)
            if i < 0:
                out, inp = out + inp, ""
            else:
                out, inp = out + inp[:i], inp[i:]
    return out


def _normalize_percent(s: str) -> str:
    if _BAD_PCT.search(s):
        raise ValueError("'%' must be followed by two hex digits")

    def fix(m):
        c = chr(int(m.group(1), 16))
        return c if c in _UNRESERVED else "%" + m.group(1).upper()
    return _PCT.sub(fix, s)


def normalize_url(text: str) -> str:
    if not isinstance(text, str) or any(ord(c) <= 0x20 or ord(c) == 0x7F for c in text):
        raise ValueError("URL must not contain spaces or control characters")
    m = _URL.fullmatch(text)
    if not m:
        raise ValueError("URL must be scheme://authority/path")
    scheme, auth, path, query = m.group(1).lower(), m.group(2), m.group(3), m.group(4)
    if scheme not in ("http", "https"):
        raise ValueError("only http and https URLs are supported")
    if "@" in auth:
        raise ValueError("userinfo is not allowed")
    hm = _AUTH.fullmatch(auth)
    if not hm:
        raise ValueError("invalid host")
    host, port = hm.group(1).lower(), hm.group(2)
    if host.startswith("["):
        host = "[" + canonical_ip(host[1:-1]) + "]"
    if port == "":
        port = None
    if port is not None:
        p = int(port)
        if p > 65535:
            raise ValueError("port out of range")
        port = None if (scheme, p) in (("http", 80), ("https", 443)) else str(p)
    path = remove_dot_segments(_normalize_percent(path)) or "/"
    query = _normalize_percent(query) if query else ""
    return f"{scheme}://{host}" + (f":{port}" if port else "") + path + (query if query != "?" else "")
