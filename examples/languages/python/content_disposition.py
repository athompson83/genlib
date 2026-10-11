# SPDX-License-Identifier: Apache-2.0
"""Content-Disposition (RFC 6266 + RFC 8187) build and parse, with filename sanitizing.

sanitize_filename replaces / \\ " and control characters with '_', trims spaces and dots at both ends and
falls back to "download". build emits filename="..." for printable ASCII, otherwise an ASCII fallback plus
filename*=UTF-8''<pct>. parse lowercases the type, prefers filename* and returns the sanitized filename.
"""
import re
from urllib.parse import unquote_to_bytes


class DispositionError(ValueError):
    """Raised for a malformed Content-Disposition value."""


_ATTR = frozenset("ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!#$&+-.^_`|~")
_TYPE = re.compile(r"\s*([!#$%&'*+\-.^_`|~0-9A-Za-z]+)\s*")
_NAME = re.compile(r"[!#$%&'*+\-.^_`|~0-9A-Za-z]+")
_BARE = re.compile(r"[^;\s]*")
_EXT = re.compile(r"([A-Za-z0-9!#$&+\-^_`{}~]+)'([A-Za-z0-9-]*)'(.*)")


def sanitize_filename(name: str) -> str:
    """Replace / \\ " and control characters with '_', trim spaces and dots; empty -> 'download'."""
    out = "".join("_" if (c in '/\\"' or ord(c) < 0x20 or ord(c) == 0x7F) else c for c in name)
    return out.strip(" .") or "download"


def build_content_disposition(filename: str, inline: bool = False) -> str:
    """'attachment; filename="..."' (or inline), adding filename*=UTF-8'' for non-ASCII names."""
    name = sanitize_filename(filename)
    kind = "inline" if inline else "attachment"
    if all(0x20 <= ord(c) < 0x7F for c in name):
        return f'{kind}; filename="{name}"'
    fallback = "".join(c if 0x20 <= ord(c) < 0x7F else "_" for c in name)
    enc = "".join(c if c in _ATTR else "".join(f"%{b:02X}" for b in c.encode("utf-8")) for c in name)
    return f"{kind}; filename=\"{fallback}\"; filename*=UTF-8''{enc}"


def _ext(v: str) -> str:
    m = _EXT.fullmatch(v)
    if not m or m.group(1).lower() not in ("utf-8", "iso-8859-1"):
        raise DispositionError("bad extended value")
    if re.search(r"%(?![0-9A-Fa-f]{2})", m.group(3)):
        raise DispositionError("bad percent-encoding")
    try:
        return unquote_to_bytes(m.group(3)).decode("utf-8" if m.group(1).lower() == "utf-8" else "latin-1")
    except UnicodeDecodeError:
        raise DispositionError("invalid UTF-8") from None


def parse_content_disposition(value: str) -> dict:
    """{"type", "filename" (sanitized, or None), "params"}; raises DispositionError when malformed."""
    m = _TYPE.match(value)
    if not m:
        raise DispositionError("missing disposition type")
    s = value
    kind = m.group(1).lower()
    i, n = m.end(), len(s)
    params: dict[str, str] = {}
    while i < n:
        if s[i] != ";":
            raise DispositionError("expected ;")
        i += 1
        while i < n and s[i] in " \t":
            i += 1
        if i >= n:
            break
        mm = _NAME.match(s, i)
        if not mm:
            raise DispositionError("expected parameter")
        name = mm.group(0).lower()
        i = mm.end()
        while i < n and s[i] in " \t":
            i += 1
        if i >= n or s[i] != "=":
            raise DispositionError("expected =")
        i += 1
        while i < n and s[i] in " \t":
            i += 1
        if i < n and s[i] == '"':
            i += 1
            buf = []
            while True:
                if i >= n:
                    raise DispositionError("unterminated quote")
                c = s[i]
                if c == "\\" and i + 1 < n:
                    buf.append(s[i + 1])
                    i += 2
                    continue
                if c == '"':
                    i += 1
                    break
                buf.append(c)
                i += 1
            val = "".join(buf)
        else:
            mm = _BARE.match(s, i)
            val = mm.group(0)
            i = mm.end()
        while i < n and s[i] in " \t":
            i += 1
        if name.endswith("*"):
            params[name[:-1]] = _ext(val)
        elif name not in params:
            params[name] = val
    fn = params.get("filename")
    return {"type": kind, "filename": sanitize_filename(fn) if fn is not None else None, "params": params}
