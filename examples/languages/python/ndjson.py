# SPDX-License-Identifier: Apache-2.0
"""Newline-delimited JSON (NDJSON / JSON Lines) parsing and serialization.

parse_ndjson() splits on LF, drops one trailing CR per line, skips lines that are empty or only spaces
and tabs, and parses each remaining line as one JSON value (NaN and Infinity are rejected); a bad line
raises NdjsonError with its 1-based line number in `.line`. stringify_ndjson() writes each value
compactly with object keys in insertion order, escaping only '"', '\\' and U+0000-U+001F (\\b \\f \\n
\\r \\t or lowercase \\u00XX) and keeping non-ASCII as UTF-8, each followed by LF. It accepts None, bool,
int, finite float, str, list and dict with str keys; floats use Python's repr, which other languages
may format differently.
"""

import json
import math


class NdjsonError(ValueError):
    """Raised for an invalid line (with its 1-based number) or an unsupported value."""

    def __init__(self, message: str, line: int | None = None):
        super().__init__(message)
        self.line = line


def _reject_constant(name: str):
    raise ValueError("non-standard JSON constant " + name)


def parse_ndjson(text: str) -> list:
    """Parse NDJSON text into a list of values."""
    out = []
    for i, line in enumerate(text.split("\n"), 1):
        if line.endswith("\r"):
            line = line[:-1]
        if line.strip(" \t") == "":
            continue
        try:
            out.append(json.loads(line, parse_constant=_reject_constant))
        except ValueError:
            raise NdjsonError("invalid JSON on line %d" % i, i) from None
    return out


def _string(s: str) -> str:
    out = ['"']
    for c in s:
        if c == '"':
            out.append('\\"')
        elif c == "\\":
            out.append("\\\\")
        elif c in _SHORT:
            out.append(_SHORT[c])
        elif ord(c) < 0x20:
            out.append("\\u%04x" % ord(c))
        else:
            out.append(c)
    out.append('"')
    return "".join(out)


_SHORT = {"\b": "\\b", "\f": "\\f", "\n": "\\n", "\r": "\\r", "\t": "\\t"}


def _value(v) -> str:
    if v is None:
        return "null"
    if v is True:
        return "true"
    if v is False:
        return "false"
    if isinstance(v, int):
        return str(v)
    if isinstance(v, float):
        if not math.isfinite(v):
            raise NdjsonError("NaN and infinity are not JSON")
        return repr(v)
    if isinstance(v, str):
        return _string(v)
    if isinstance(v, (list, tuple)):
        return "[" + ",".join(_value(x) for x in v) + "]"
    if isinstance(v, dict):
        if any(not isinstance(k, str) for k in v):
            raise NdjsonError("object keys must be strings")
        return "{" + ",".join(_string(k) + ":" + _value(x) for k, x in v.items()) + "}"
    raise NdjsonError("unsupported value type: " + type(v).__name__)


def stringify_ndjson(values) -> str:
    """Serialize values as NDJSON, one compact value per LF-terminated line."""
    return "".join(_value(v) + "\n" for v in values)
