# SPDX-License-Identifier: Apache-2.0
"""GitHub-flavored Markdown tables with escaping, alignment and padded columns.

Cells escape '\\' as '\\\\' and '|' as '\\|' and turn CRLF, CR and LF into '<br>'. Each column is as
wide as its longest escaped cell in code points (at least 3). Alignment per column is "left",
"right", "center" or None (no colon); center puts the extra space on the right. Lines look like
'| a | b |' and are joined with '\\n' without a trailing newline. Cell text is not otherwise escaped:
Markdown inside a cell still renders, so escape untrusted Markdown or HTML before passing it in.
"""


class MarkdownTableError(ValueError):
    """Raised for empty headers, ragged rows or an unknown alignment."""


def _esc(c: str) -> str:
    c = c.replace("\\", "\\\\").replace("|", "\\|")
    return c.replace("\r\n", "<br>").replace("\r", "<br>").replace("\n", "<br>")


def _pad(s: str, w: int, a: str | None) -> str:
    gap = w - len(s)
    if a == "right":
        return " " * gap + s
    if a == "center":
        return " " * (gap // 2) + s + " " * (gap - gap // 2)
    return s + " " * gap


def _sep(w: int, a: str | None) -> str:
    d = ["-"] * w
    if a in ("left", "center"):
        d[0] = ":"
    if a in ("right", "center"):
        d[-1] = ":"
    return "".join(d)


def _line(cells: list[str]) -> str:
    return "| " + " | ".join(cells) + " |"


def markdown_table(headers: list[str], rows: list[list[str]], align: list[str | None] | None = None) -> str:
    """Render headers and rows as a GitHub-flavored Markdown table."""
    if not headers:
        raise MarkdownTableError("headers must not be empty")
    n = len(headers)
    align = list(align) if align else [None] * n
    if len(align) != n or any(a not in (None, "left", "right", "center") for a in align):
        raise MarkdownTableError("align needs one of left/right/center/None per column")
    if any(len(r) != n for r in rows):
        raise MarkdownTableError("every row needs one cell per header")
    cells = [[_esc(c) for c in headers]] + [[_esc(c) for c in r] for r in rows]
    widths = [max(3, max(len(r[i]) for r in cells)) for i in range(n)]
    out = [_line([_pad(c, widths[i], align[i]) for i, c in enumerate(cells[0])]),
           _line([_sep(widths[i], align[i]) for i in range(n)])]
    out += [_line([_pad(c, widths[i], align[i]) for i, c in enumerate(r)]) for r in cells[1:]]
    return "\n".join(out)
