# SPDX-License-Identifier: Apache-2.0
"""Cache-Control (RFC 9111) parse, format and freshness lifetime.

Values are True (bare directive), int (delta-seconds directives) or str. Names are lowercased and the first
occurrence wins. max-age, s-maxage, stale-while-revalidate, stale-if-error, max-stale and min-fresh must be
ASCII digits (quoted digits accepted) and become ints; invalid ones are dropped, as are bare ones except
max-stale. Unparseable items are skipped up to the next comma; an unterminated quote raises CacheControlError.
"""
import re


class CacheControlError(ValueError):
    """Raised for an unterminated quoted string."""


_DELTA = frozenset({"max-age", "s-maxage", "stale-while-revalidate", "stale-if-error", "max-stale", "min-fresh"})
_TOKEN = re.compile(r"[!#$%&'*+\-.^_`|~0-9A-Za-z]+")
_DIGITS = re.compile(r"[0-9]+")


def parse_cache_control(value: str) -> dict[str, bool | int | str]:
    """Parse a Cache-Control header into an ordered {directive: True | int | str}."""
    s = value
    out: dict[str, bool | int | str] = {}
    i, n = 0, len(s)
    while i < n:
        while i < n and s[i] in " \t,":
            i += 1
        if i >= n:
            break
        m = _TOKEN.match(s, i)
        if not m:
            j = s.find(",", i)
            i = n if j < 0 else j
            continue
        name = m.group(0).lower()
        i = m.end()
        val: bool | int | str = True
        while i < n and s[i] in " \t":
            i += 1
        if i < n and s[i] == "=":
            i += 1
            while i < n and s[i] in " \t":
                i += 1
            if i < n and s[i] == '"':
                i += 1
                buf = []
                while True:
                    if i >= n:
                        raise CacheControlError("unterminated quote")
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
                m = _TOKEN.match(s, i)
                val = m.group(0) if m else ""
                i = m.end() if m else i
        j = s.find(",", i)
        i = n if j < 0 else j
        if name in _DELTA:
            if val is True and name != "max-stale":
                continue
            if val is not True:
                if not _DIGITS.fullmatch(val):
                    continue
                val = int(val)
        if name not in out:
            out[name] = val
    return out


def format_cache_control(directives: dict[str, bool | int | str]) -> str:
    """Serialize directives in order: True -> name, int -> name=N, strings quoted unless tokens."""
    parts = []
    for k, v in directives.items():
        if v is True:
            parts.append(k)
        elif (isinstance(v, int) and not isinstance(v, bool)) or _TOKEN.fullmatch(v):
            parts.append(f"{k}={v}")
        else:
            parts.append(f'{k}="' + v.replace("\\", "\\\\").replace('"', '\\"') + '"')
    return ", ".join(parts)


def cache_freshness(directives: dict[str, bool | int | str], shared: bool = False) -> int | None:
    """Freshness lifetime in seconds: no-store/no-cache -> 0, shared prefers s-maxage, else max-age or None."""
    if "no-store" in directives or "no-cache" in directives:
        return 0
    s_maxage = directives.get("s-maxage")
    if shared and isinstance(s_maxage, int) and not isinstance(s_maxage, bool):
        return s_maxage
    max_age = directives.get("max-age")
    return max_age if isinstance(max_age, int) and not isinstance(max_age, bool) else None
