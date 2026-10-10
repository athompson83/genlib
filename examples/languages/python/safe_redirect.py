# SPDX-License-Identifier: Apache-2.0
"""Open-redirect guard for "?next=" style parameters.

Accepts same-site paths ("/x", never "//x") and absolute http(s) URLs whose origin exactly
matches an allowed origin. Everything else (protocol-relative, backslashes, userinfo, control
characters, javascript:, relative paths) falls back. Redirect with the returned value only.
"""
import re

_ABS = re.compile(r"([hH][tT][tT][pP][sS]?)://([A-Za-z0-9.-]+)(?::([0-9]{1,5}))?(/[^?#]*)?(\?[^#]*)?(#.*)?",
                  re.DOTALL)
MAX_LENGTH = 2048


def _origin(url: str) -> "str | None":
    m = _ABS.fullmatch(url)
    if not m:
        return None
    scheme, host, port = m.group(1).lower(), m.group(2).lower(), m.group(3)
    if host.startswith(".") or host.endswith(".") or ".." in host:
        return None
    if port is not None:
        p = int(port)
        if not 1 <= p <= 65535:
            return None
        port = None if (scheme, p) in (("https", 443), ("http", 80)) else str(p)
    return f"{scheme}://{host}" + (f":{port}" if port else "")


def safe_redirect(target: str, allowed_origins, fallback: str = "/") -> str:
    if not isinstance(target, str) or target == "" or len(target) > MAX_LENGTH:
        return fallback
    if "\\" in target or any(ord(c) <= 0x20 or ord(c) == 0x7F for c in target):
        return fallback
    if target.startswith("/"):
        return fallback if target.startswith("//") else target
    origin = _origin(target)
    if origin is None:
        return fallback
    allowed = {_origin(a) for a in allowed_origins if isinstance(a, str)}
    allowed.discard(None)
    return target if origin in allowed else fallback
