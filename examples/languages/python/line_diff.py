# SPDX-License-Identifier: Apache-2.0
"""Deterministic LCS line diff and unified output.

The result is a valid unified diff (patch reproduces the new text); same format as GNU diff -u,
which may pick a different alignment of equal size. Lines are split on "\\n"; a final "\\n" ends
the last line and its absence is reported with "\\ No newline at end of file". A last line without
"\\n" only matches another last line without "\\n". The LCS table is O(n*m): inputs above 4,000,000
line pairs raise ValueError. Escape lines before rendering them as HTML.
"""

MAX_CELLS = 4_000_000


def _split(text: str) -> list:
    """(line, no_eol) pairs; no_eol marks a last line that has no trailing "\\n"."""
    if text == "":
        return []
    lines = text.split("\n")
    newline = text.endswith("\n")
    if newline:
        lines.pop()
    last = len(lines) - 1
    return [(line, not newline and k == last) for k, line in enumerate(lines)]


def _ops(a: list, b: list) -> list:
    n, m = len(a), len(b)
    if n * m > MAX_CELLS:
        raise ValueError("diff input too large (lines(a) * lines(b) > 4,000,000)")
    table = [[0] * (m + 1) for _ in range(n + 1)]
    for i in range(n - 1, -1, -1):
        row, below = table[i], table[i + 1]
        for j in range(m - 1, -1, -1):
            row[j] = below[j + 1] + 1 if a[i] == b[j] else max(below[j], row[j + 1])
    i = j = 0
    ops = []
    while i < n or j < m:
        if i < n and j < m and a[i] == b[j]:
            ops.append(("=", a[i]))
            i, j = i + 1, j + 1
        elif j >= m or (i < n and table[i + 1][j] >= table[i][j + 1]):
            ops.append(("-", a[i]))
            i += 1
        else:
            ops.append(("+", b[j]))
            j += 1
    return ops


def diff_lines(a: str, b: str) -> list:
    """List of ["=" | "-" | "+", line] turning a into b."""
    return [[op, line[0]] for op, line in _ops(_split(a), _split(b))]


def unified_diff(a: str, b: str, from_name: str = "a", to_name: str = "b", context: int = 3) -> str:
    """Unified diff (valid for patch; GNU diff -u format); "" when the texts are identical."""
    if isinstance(context, bool) or not isinstance(context, int) or context < 0:
        raise ValueError("context must be a non-negative integer")
    rows = _ops(_split(a), _split(b))
    changes = [k for k, r in enumerate(rows) if r[0] != "="]
    if not changes:
        return ""
    hunks, start, end = [], changes[0], changes[0]
    for k in changes[1:]:
        if k - end - 1 <= 2 * context:
            end = k
        else:
            hunks.append((start, end))
            start = end = k
    hunks.append((start, end))
    out = [f"--- {from_name}\n", f"+++ {to_name}\n"]
    for s, e in hunks:
        s, e = max(0, s - context), min(len(rows) - 1, e + context)
        seg, before = rows[s:e + 1], rows[:s]
        out.append(f"@@ -{_range(seg, before, '+')} +{_range(seg, before, '-')} @@\n")
        for op, (line, no_eol) in seg:
            out.append({"=": " ", "-": "-", "+": "+"}[op] + line + "\n")
            if no_eol:
                out.append("\\ No newline at end of file\n")
    return "".join(out)


def _range(seg: list, before: list, other: str) -> str:
    count = sum(1 for r in seg if r[0] != other)
    first = sum(1 for r in before if r[0] != other)
    if count == 0:
        return f"{first},0"
    return f"{first + 1}" if count == 1 else f"{first + 1},{count}"
