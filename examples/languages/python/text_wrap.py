# SPDX-License-Identifier: Apache-2.0
"""Plain-text wrapping and truncation, counted in code points.

wrap_text() keeps input line breaks (CRLF and CR become LF) and empty lines, splits each line on runs
of spaces and tabs, fills lines greedily with single spaces, breaks words longer than the width into
width-sized chunks and leaves no trailing spaces. truncate_text() returns text unchanged when it fits;
otherwise it keeps max_len - len(ellipsis) code points, backs up to the last space when that space is
at or after half the kept length, strips trailing spaces and appends the ellipsis. Code points are not
grapheme clusters: combining marks and emoji sequences may be split, and East Asian wide characters
count as one column.
"""

import re

_WS = re.compile(r"[ \t]+")


class TextWrapError(ValueError):
    """Raised for a width or maximum length that cannot be honored."""


def wrap_text(text: str, width: int) -> str:
    """Greedy word wrap to at most width code points per line."""
    if isinstance(width, bool) or not isinstance(width, int) or width < 1:
        raise TextWrapError("width must be >= 1")
    out: list[str] = []
    for line in text.replace("\r\n", "\n").replace("\r", "\n").split("\n"):
        cur = ""
        for w in (w for w in _WS.split(line) if w):
            while len(w) > width:
                if cur:
                    out.append(cur)
                    cur = ""
                out.append(w[:width])
                w = w[width:]
            if not w:
                continue
            if not cur:
                cur = w
            elif len(cur) + 1 + len(w) <= width:
                cur += " " + w
            else:
                out.append(cur)
                cur = w
        out.append(cur)
    return "\n".join(out)


def truncate_text(text: str, max_len: int, ellipsis: str = "\u2026") -> str:
    """Shorten text to at most max_len code points, preferring a word boundary."""
    if len(text) <= max_len:
        return text
    keep = max_len - len(ellipsis)
    if max_len < 1 or keep < 0:
        raise TextWrapError("max_len must be >= 1 and fit the ellipsis")
    cut = text[:keep]
    sp = cut.rfind(" ")
    if sp >= keep // 2 and sp > 0:
        cut = cut[:sp]
    return cut.rstrip(" ") + ellipsis
