# SPDX-License-Identifier: Apache-2.0
"""data: URLs (RFC 2397 with the WHATWG fetch "data: URL processor" rules, simplified).

parse_data_uri returns {"mime", "params", "base64", "data"}: the scheme and ";base64" are case-insensitive,
an empty or invalid media type becomes text/plain with charset US-ASCII, the body is percent-decoded to bytes
(invalid '%' sequences stay literal) and base64 bodies are checked strictly. build_data_uri picks base64
automatically unless the type is textual and the bytes are valid UTF-8.
"""
import base64 as _b64
import re

_TOKEN = r"[!#$%&'*+\-.^_`|~0-9A-Za-z]+"
_MIME = re.compile(_TOKEN + "/" + _TOKEN)
_MEDIA = re.compile(_TOKEN + "/" + _TOKEN + r"(\s*;\s*" + _TOKEN + "=" + r"[^;,\s]+)*")
_HEX = b"0123456789abcdefABCDEF"
_KEEP = frozenset(b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_.!~*'();/?:@&=+$,")


class DataUriError(ValueError):
    """Raised for a malformed data: URL or media type."""


def _pct(s: str) -> bytes:
    b = s.encode("utf-8")
    out = bytearray()
    i = 0
    while i < len(b):
        if b[i] == 0x25 and i + 2 < len(b) and b[i + 1] in _HEX and b[i + 2] in _HEX:
            out.append(int(b[i + 1:i + 3], 16))
            i += 3
        else:
            out.append(b[i])
            i += 1
    return bytes(out)


def parse_data_uri(url: str) -> dict:
    """Parse a data: URL into {"mime", "params" (ordered dict), "base64" (bool), "data" (bytes)}."""
    if url[:5].lower() != "data:":
        raise DataUriError("not a data: URL")
    rest = url[5:]
    if "," not in rest:
        raise DataUriError("missing comma")
    header, body = rest.split(",", 1)
    header = header.strip()
    is_b64 = False
    m = re.search(r";\s*base64\s*$", header, re.IGNORECASE)
    if m:
        is_b64 = True
        header = header[:m.start()]
    parts = header.split(";")
    mime = parts[0].strip().lower()
    params: dict[str, str] = {}
    for p in parts[1:]:
        if "=" in p:
            k, v = p.split("=", 1)
            k = k.strip().lower()
            if k and k not in params:
                params[k] = v.strip()
    if not _MIME.fullmatch(mime):
        mime = "text/plain"
        if "charset" not in params:
            params = {"charset": "US-ASCII", **params}
    data = _pct(body)
    if is_b64:
        s = re.sub(rb"[\t\n\f\r ]", b"", data)
        s = s[:-2] if s.endswith(b"==") else s[:-1] if s.endswith(b"=") else s
        if len(s) % 4 == 1 or not re.fullmatch(rb"[A-Za-z0-9+/]*", s):
            raise DataUriError("invalid base64")
        data = _b64.b64decode(s + b"=" * (-len(s) % 4))
    return {"mime": mime, "params": params, "base64": is_b64, "data": data}


def build_data_uri(data: bytes, mime: str = "application/octet-stream", base64: bool | None = None) -> str:
    """Build a data: URL; base64=None picks base64 unless the type is textual and data is valid UTF-8."""
    if not _MEDIA.fullmatch(mime):
        raise DataUriError("invalid media type")
    if base64 is None:
        base = mime.split(";")[0].strip().lower()
        textual = (base.startswith("text/") or base.endswith(("+json", "+xml"))
                   or base in ("application/json", "application/xml", "application/javascript"))
        try:
            data.decode("utf-8")
            utf8 = True
        except UnicodeDecodeError:
            utf8 = False
        base64 = not (textual and utf8)
    if base64:
        return f"data:{mime};base64," + _b64.b64encode(data).decode("ascii")
    return f"data:{mime}," + "".join(chr(b) if b in _KEEP else f"%{b:02X}" for b in data)
