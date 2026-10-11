# SPDX-License-Identifier: Apache-2.0
"""HTTP Link header (RFC 8288) parse, rel lookup and format.

Links are dicts {"uri", "params"} with ordered params. Commas inside <...> or quoted strings do not split;
names are lowercased; quoted strings honor backslash escapes; RFC 8187 ``name*`` values (UTF-8 or
ISO-8859-1) win over the plain form and are stored without '*'; otherwise the first occurrence wins and
rel is lowercased with whitespace collapsed. Errors raise LinkHeaderError.
"""
import re
from urllib.parse import unquote_to_bytes


class LinkHeaderError(ValueError):
    """Raised for a malformed Link header."""


_NAME = re.compile(r"[!#$%&'*+\-.^_`|~0-9A-Za-z]+")
_TOKEN = re.compile(r"[!#$%&'*+\-.^_`|~0-9A-Za-z]+\Z")
_BARE = re.compile(r"[^,;\s]*")
_EXT = re.compile(r"([A-Za-z0-9!#$&+\-^_`{}~]+)'([A-Za-z0-9-]*)'(.*)")
_ATTR = frozenset("ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!#$&+-.^_`|~")


def _ext(v: str) -> str:
    m = _EXT.fullmatch(v)
    if not m:
        raise LinkHeaderError("bad extended value")
    cs = m.group(1).lower()
    if cs not in ("utf-8", "iso-8859-1"):
        raise LinkHeaderError("unsupported charset")
    if re.search(r"%(?![0-9A-Fa-f]{2})", m.group(3)):
        raise LinkHeaderError("bad percent-encoding")
    try:
        return unquote_to_bytes(m.group(3)).decode("utf-8" if cs == "utf-8" else "latin-1")
    except UnicodeDecodeError:
        raise LinkHeaderError("invalid UTF-8") from None


def parse_link_header(s: str) -> list[dict]:
    """Parse a Link header into [{"uri", "params"}] in order; raises LinkHeaderError when malformed."""
    i, n = 0, len(s)
    links: list[dict] = []

    def ws() -> None:
        nonlocal i
        while i < n and s[i] in " \t":
            i += 1

    while True:
        ws()
        if i >= n:
            break
        if s[i] == ",":
            i += 1
            continue
        if s[i] != "<":
            raise LinkHeaderError("expected <")
        end = s.find(">", i)
        if end < 0:
            raise LinkHeaderError("unterminated <")
        uri = s[i + 1:end]
        i = end + 1
        params: dict[str, str] = {}
        ext: set[str] = set()
        while True:
            ws()
            if i >= n or s[i] == ",":
                break
            if s[i] != ";":
                raise LinkHeaderError("expected ;")
            i += 1
            ws()
            m = _NAME.match(s, i)
            if not m:
                raise LinkHeaderError("expected parameter name")
            name = m.group(0).lower()
            i = m.end()
            ws()
            val = ""
            if i < n and s[i] == "=":
                i += 1
                ws()
                if i < n and s[i] == '"':
                    i += 1
                    buf = []
                    while True:
                        if i >= n:
                            raise LinkHeaderError("unterminated quote")
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
                    m = _BARE.match(s, i)
                    val = m.group(0)
                    i = m.end()
            if name.endswith("*"):
                base = name[:-1]
                params[base] = _ext(val)
                ext.add(base)
            elif name not in ext and name not in params:
                params[name] = val
        if "rel" in params:
            params["rel"] = " ".join(params["rel"].lower().split())
        links.append({"uri": uri, "params": params})
    return links


def find_rel(links: list[dict], rel: str) -> dict | None:
    """The first link whose rel list contains rel (case-insensitive), or None."""
    for link in links:
        if rel.lower() in link["params"].get("rel", "").split():
            return link
    return None


def format_link_header(links: list[dict]) -> str:
    """Serialize links: rel always quoted, other values quoted unless tokens, non-ASCII as name*=UTF-8''."""
    out = []
    for link in links:
        parts = ["<" + link["uri"] + ">"]
        for k, v in link["params"].items():
            if any(ord(c) > 0x7E or ord(c) < 0x20 for c in v):
                enc = "".join(c if c in _ATTR else "".join(f"%{b:02X}" for b in c.encode("utf-8")) for c in v)
                parts.append(f"{k}*=UTF-8''{enc}")
            elif _TOKEN.match(v) and k != "rel":
                parts.append(f"{k}={v}")
            else:
                parts.append(f'{k}="' + v.replace("\\", "\\\\").replace('"', '\\"') + '"')
        out.append("; ".join(parts))
    return ", ".join(out)
