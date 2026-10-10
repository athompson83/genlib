# SPDX-License-Identifier: Apache-2.0
"""Deterministic LCS line diff and GNU `diff -u` compatible unified output.

Lines are split on "\\n"; a final "\\n" ends the last line and its absence is reported with
"\\ No newline at end of file". The LCS table is O(n*m): inputs above 4,000,000 line pairs raise
ValueError. Escape lines before rendering them as HTML.
"""

MAX_CELLS = 4_000_000


def _split(text: str):
    if text == "":
        return [], True
    lines = text.split("\n")
    newline = text.endswith("\n")
    if newline:
        lines.pop()
    return lines, newline


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
            ops.append(["=", a[i]])
            i, j = i + 1, j + 1
        elif j >= m or (i < n and table[i + 1][j] >= table[i][j + 1]):
            ops.append(["-", a[i]])
            i += 1
        else:
            ops.append(["+", b[j]])
            j += 1
    return ops


def diff_lines(a: str, b: str) -> list:
    """List of ["=" | "-" | "+", line] turning a into b."""
    return _ops(_split(a)[0], _split(b)[0])


def unified_diff(a: str, b: str, from_name: str = "a", to_name: str = "b", context: int = 3) -> str:
    """GNU-style unified diff; "" when the texts are identical."""
    if isinstance(context, bool) or not isinstance(context, int) or context < 0:
        raise ValueError("context must be a non-negative integer")
    al, anl = _split(a)
    bl, bnl = _split(b)
    rows, ai, bi = [], 0, 0  # (op, line, index in a or None, index in b or None)
    for op, line in _ops(al, bl):
        if op == "=":
            rows.append((op, line, ai, bi))
            ai, bi = ai + 1, bi + 1
        elif op == "-":
            rows.append((op, line, ai, None))
            ai += 1
        else:
            rows.append((op, line, None, bi))
            bi += 1
    # final lines that differ only by the trailing newline are shown as removed and re-added
    if anl != bnl and rows and rows[-1][0] == "=" and rows[-1][2] == len(al) - 1 and rows[-1][3] == len(bl) - 1:
        _, line, x, y = rows.pop()
        rows += [("-", line, x, None), ("+", line, None, y)]
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
        seg = rows[s:e + 1]
        out.append(f"@@ -{_range(seg, rows[:s], '+', 2)} +{_range(seg, rows[:s], '-', 3)} @@\n")
        for op, line, x, y in seg:
            out.append({"=": " ", "-": "-", "+": "+"}[op] + line + "\n")
            if op != "+" and x == len(al) - 1 and not anl and (op == "-" or bnl == anl):
                out.append("\\ No newline at end of file\n")
            elif op == "+" and y == len(bl) - 1 and not bnl:
                out.append("\\ No newline at end of file\n")
    return "".join(out)


def _range(seg: list, before: list, other: str, idx: int) -> str:
    lines = [r for r in seg if r[0] != other]
    if not lines:
        return f"{sum(1 for r in before if r[0] != other)},0"
    first = lines[0][idx] + 1
    return f"{first}" if len(lines) == 1 else f"{first},{len(lines)}"
