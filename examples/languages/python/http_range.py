# SPDX-License-Identifier: Apache-2.0
"""RFC 9110 Range request parsing and Content-Range formatting for byte ranges.

parse_range returns {"kind": "none"} (serve 200 with the full body), {"kind": "unsatisfiable",
"contentRange": "bytes */size"} (respond 416) or {"kind": "ranges", "ranges": [[start, end], ...]}
(inclusive, header order, not merged; respond 206).
"""
import re

MAX_SPECS = 100
_HEAD = re.compile(r"[ \t]*([A-Za-z]+)=(.*)", re.DOTALL)
_SPEC = re.compile(r"([0-9]+)-([0-9]*)|-([0-9]+)")


def parse_range(header, size: int) -> dict:
    if not isinstance(size, int) or size < 0:
        raise ValueError("size must be a non-negative integer")
    if header is None:
        return {"kind": "none"}
    m = _HEAD.fullmatch(header)
    if not m or m.group(1).lower() != "bytes":
        return {"kind": "none"}
    specs = [p.strip(" \t") for p in m.group(2).split(",")]
    if any(p == "" for p in specs) or len(specs) > MAX_SPECS:
        return {"kind": "none"}
    out = []
    for p in specs:
        mm = _SPEC.fullmatch(p)
        if not mm:
            return {"kind": "none"}
        if mm.group(3) is not None:
            n = int(mm.group(3))
            if n == 0 or size == 0:
                continue
            out.append([max(0, size - n), size - 1])
            continue
        a = int(mm.group(1))
        b = int(mm.group(2)) if mm.group(2) else None
        if b is not None and b < a:
            return {"kind": "none"}
        if a >= size:
            continue
        out.append([a, size - 1 if b is None else min(b, size - 1)])
    if not out:
        return {"kind": "unsatisfiable", "contentRange": f"bytes */{size}"}
    return {"kind": "ranges", "ranges": out}


def content_range(start: int, end: int, size: int) -> str:
    if not (0 <= start <= end < size):
        raise ValueError("need 0 <= start <= end < size")
    return f"bytes {start}-{end}/{size}"
