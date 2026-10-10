# SPDX-License-Identifier: Apache-2.0
"""Minimal line diff (Myers' linear-space algorithm) and unified output.

The result is a valid unified diff (patch reproduces the new text) and minimal: it is a shortest
edit script. It is usually identical to GNU diff -u (about 95% of small random inputs) but that is
not guaranteed, because equal-size alignments can differ. Lines are split on "\\n"; a final "\\n"
ends the last line and its absence is reported with "\\ No newline at end of file". A last line
without "\\n" only matches another last line without "\\n". Time is O((N+M)*D) and memory is linear
(no N*M table); inputs with more than 1,000,000 lines in total raise ValueError. Escape lines
before rendering them as HTML.

Steps: lines that occur nowhere in the other file are marked changed first; Myers' middle-snake
recursion runs on the remaining lines; each run of changes slides down as far as equal lines allow;
then a run of changes moves up next to changes of the other file so a hunk shows a replacement.
"""

MAX_LINES = 1_000_000


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


def _middle_snake(a, b, a0, a1, b0, b1):
    """A middle snake (x, y, u, v) of the box a[a0:a1] x b[b0:b1] (Myers 1986, section 4b)."""
    n, m = a1 - a0, b1 - b0
    delta = n - m
    odd = delta & 1
    off = n + m + 1
    vf = [0] * (2 * off + 1)  # vf[off + k]: furthest x on diagonal k = x - y, forward
    vb = [0] * (2 * off + 1)  # the same on the reversed sequences
    for d in range((n + m + 1) // 2 + 1):
        for k in range(-d, d + 1, 2):
            if k == -d or (k != d and vf[off + k - 1] < vf[off + k + 1]):
                x = vf[off + k + 1]
            else:
                x = vf[off + k - 1] + 1
            y = x - k
            sx, sy = x, y
            while x < n and y < m and a[a0 + x] == b[b0 + y]:
                x += 1
                y += 1
            vf[off + k] = x
            if odd and delta - (d - 1) <= k <= delta + (d - 1) and x + vb[off + delta - k] >= n:
                return a0 + sx, b0 + sy, a0 + x, b0 + y
        for k in range(-d, d + 1, 2):
            if k == -d or (k != d and vb[off + k - 1] < vb[off + k + 1]):
                x = vb[off + k + 1]
            else:
                x = vb[off + k - 1] + 1
            y = x - k
            sx, sy = x, y
            while x < n and y < m and a[a1 - 1 - x] == b[b1 - 1 - y]:
                x += 1
                y += 1
            vb[off + k] = x
            if not odd and -d <= delta - k <= d and x + vf[off + delta - k] >= n:
                return a1 - x, b1 - y, a1 - sx, b1 - sy
    raise AssertionError("no middle snake")


def _compare(a, b, a0, a1, b0, b1, ca, cb):
    # Iterative on the second half, recursive on the first: depth stays O(log) for typical inputs.
    while True:
        while a0 < a1 and b0 < b1 and a[a0] == b[b0]:
            a0 += 1
            b0 += 1
        while a1 > a0 and b1 > b0 and a[a1 - 1] == b[b1 - 1]:
            a1 -= 1
            b1 -= 1
        if a0 == a1:
            for j in range(b0, b1):
                cb[j] = True
            return
        if b0 == b1:
            for i in range(a0, a1):
                ca[i] = True
            return
        x, y, u, v = _middle_snake(a, b, a0, a1, b0, b1)
        _compare(a, b, a0, x, b0, y, ca, cb)
        a0, b0 = u, v


def _slide(lines, changed):
    """Move each run of changed lines down while the line after it equals its first line."""
    i, n = 0, len(lines)
    while i < n:
        if not changed[i]:
            i += 1
            continue
        j = i
        while j < n and changed[j]:
            j += 1
        while j < n and lines[i] == lines[j]:
            changed[i] = False
            changed[j] = True
            i += 1
            j += 1
            while j < n and changed[j]:
                j += 1
        i = j


def _pairs(ca, cb):
    out, i, j = [], 0, 0
    while i < len(ca) or j < len(cb):
        if i < len(ca) and ca[i]:
            i += 1
        elif j < len(cb) and cb[j]:
            j += 1
        else:
            out.append((i, j))
            i += 1
            j += 1
    return out


def _align(x, cx, cy, swap):
    """One bottom-up pass: move a run of changed x lines up through equal lines into the nearest gap
    that holds changes of the other file, so the hunk shows a replacement."""
    e = [(q, p) for p, q in _pairs(cy, cx)] if swap else _pairs(cx, cy)
    xb = [-1] + [p[0] for p in e]
    yb = [-1] + [p[1] for p in e] + [len(cy)]
    xe = [p[0] for p in e] + [len(cx)]
    g = len(e)
    while g >= 1:
        x0, x1 = xb[g] + 1, xe[g]
        if x1 > x0 and yb[g + 1] - yb[g] == 1:
            h, top, last = g, x0, x1 - 1
            while h >= 1 and xb[h] == top - 1 and x[top - 1] == x[last]:
                h -= 1
                top -= 1
                last -= 1
                if yb[h + 1] - yb[h] > 1:
                    for k in range(top, x0):
                        cx[k] = True
                    for k in range(last + 1, x1):
                        cx[k] = False
                    g = h
                    break
                if h >= 1 and xe[h] - xb[h] > 1:
                    break
        g -= 1


def _ops(a: list, b: list) -> list:
    if len(a) + len(b) > MAX_LINES:
        raise ValueError("diff input too large (more than 1,000,000 lines)")
    in_a, in_b = set(a), set(b)
    ca = [line not in in_b for line in a]
    cb = [line not in in_a for line in b]
    ka = [i for i, line in enumerate(a) if line in in_b]
    kb = [j for j, line in enumerate(b) if line in in_a]
    fa, fb = [a[i] for i in ka], [b[j] for j in kb]
    sa, sb = [False] * len(fa), [False] * len(fb)
    _compare(fa, fb, 0, len(fa), 0, len(fb), sa, sb)
    for k, i in enumerate(ka):
        ca[i] = sa[k]
    for k, j in enumerate(kb):
        cb[j] = sb[k]
    _slide(a, ca)
    _slide(b, cb)
    _align(a, ca, cb, False)
    _align(b, cb, ca, True)
    out, i, j = [], 0, 0
    while i < len(a) or j < len(b):
        if i < len(a) and ca[i]:
            out.append(("-", a[i]))
            i += 1
        elif j < len(b) and cb[j]:
            out.append(("+", b[j]))
            j += 1
        else:
            out.append(("=", a[i]))
            i += 1
            j += 1
    return out


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
    p = old_line = new_line = 0  # lines of a and b before rows[p]
    for s, e in hunks:
        s, e = max(0, s - context), min(len(rows) - 1, e + context)
        for op, _ in rows[p:s]:
            old_line += op != "+"
            new_line += op != "-"
        p = s
        seg = rows[s:e + 1]
        out.append(f"@@ -{_range(seg, old_line, '+')} +{_range(seg, new_line, '-')} @@\n")
        for op, (line, no_eol) in seg:
            out.append({"=": " ", "-": "-", "+": "+"}[op] + line + "\n")
            if no_eol:
                out.append("\\ No newline at end of file\n")
    return "".join(out)


def _range(seg: list, first: int, other: str) -> str:
    count = sum(1 for r in seg if r[0] != other)
    if count == 0:
        return f"{first},0"
    return f"{first + 1}" if count == 1 else f"{first + 1},{count}"
