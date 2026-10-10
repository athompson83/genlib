# SPDX-License-Identifier: Apache-2.0
"""Set-Cookie serialization and Cookie header parsing (RFC 6265 plus current browser prefix rules).

Values must already be cookie-octets: encode anything else (for example percent-encoding) first.
"""
import datetime as dt
import re

_TOKEN = re.compile(r"[!#$%&'*+\-.^_`|~0-9A-Za-z]+")
_OCTETS = re.compile(r"[\x21\x23-\x2b\x2d-\x3a\x3c-\x5b\x5d-\x7e]*")
_LABEL = r"[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?"
_DOMAIN = re.compile(r"\.?" + _LABEL + r"(?:\." + _LABEL + r")*")
_PATH_BAD = re.compile(r"[\x00-\x1f\x7f;]")
_DAYS = ("Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun")
_MONTHS = ("Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec")


def _imf(seconds: int) -> str:
    d = dt.datetime.fromtimestamp(seconds, dt.timezone.utc)
    return (f"{_DAYS[d.weekday()]}, {d.day:02d} {_MONTHS[d.month - 1]} {d.year:04d} "
            f"{d.hour:02d}:{d.minute:02d}:{d.second:02d} GMT")


def serialize_cookie(name: str, value: str, max_age=None, expires=None, domain=None, path=None,
                     secure=False, http_only=False, same_site=None, partitioned=False) -> str:
    """Return a Set-Cookie header value; raise ValueError for unsafe or inconsistent attributes."""
    if not isinstance(name, str) or not _TOKEN.fullmatch(name):
        raise ValueError("cookie name must be an RFC 7230 token")
    if not isinstance(value, str) or not _OCTETS.fullmatch(value):
        raise ValueError("cookie value has characters outside cookie-octet; encode it first")
    if domain is not None and not _DOMAIN.fullmatch(domain):
        raise ValueError("invalid cookie Domain")
    if path is not None and (not path.startswith("/") or _PATH_BAD.search(path)):
        raise ValueError("cookie Path must start with / and contain no controls or ';'")
    if same_site is not None and same_site not in ("Strict", "Lax", "None"):
        raise ValueError("SameSite must be Strict, Lax or None")
    if same_site == "None" and not secure:
        raise ValueError("SameSite=None requires Secure")
    if partitioned and not secure:
        raise ValueError("Partitioned requires Secure")
    if name.startswith("__Secure-") and not secure:
        raise ValueError("__Secure- cookies require Secure")
    if name.startswith("__Host-") and (not secure or domain is not None or path != "/"):
        raise ValueError("__Host- cookies require Secure, Path=/ and no Domain")
    if max_age is not None and (isinstance(max_age, bool) or not isinstance(max_age, int) or max_age < 0):
        raise ValueError("max_age must be a non-negative integer")
    if expires is not None and (isinstance(expires, bool) or not isinstance(expires, int)):
        raise ValueError("expires must be integer unix seconds")
    out = [f"{name}={value}"]
    if max_age is not None:
        out.append(f"Max-Age={max_age}")
    if expires is not None:
        out.append("Expires=" + _imf(expires))
    if domain is not None:
        out.append("Domain=" + domain.lower())
    if path is not None:
        out.append("Path=" + path)
    if secure:
        out.append("Secure")
    if http_only:
        out.append("HttpOnly")
    if same_site:
        out.append("SameSite=" + same_site)
    if partitioned:
        out.append("Partitioned")
    return "; ".join(out)


def parse_cookie_header(header: str) -> "list[tuple[str, str]]":
    """Ordered (name, value) pairs from a Cookie header; duplicates are kept in order."""
    out = []
    for piece in header.split(";"):
        if "=" not in piece:
            continue
        name, _, value = piece.partition("=")
        name, value = name.strip(" \t"), value.strip(" \t")
        if not name:
            continue
        if len(value) >= 2 and value[0] == '"' and value[-1] == '"':
            value = value[1:-1]
        out.append((name, value))
    return out
