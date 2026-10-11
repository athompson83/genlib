# SPDX-License-Identifier: Apache-2.0
"""Glob matching for '/'-separated paths (gitignore-style ``**``, braces and classes).

``*`` matches a run of characters and ``?`` one code point, ``[...]`` one code point from a class
(``[!...]``/``[^...]`` negate, ranges ``a-z``, ``]`` first is literal); none of them cross '/'. A whole
segment ``**`` matches zero or more segments (``src/**`` matches ``src``). ``{a,b}`` alternatives (not
nested) are expanded first and ``\\`` escapes the next character. A segment starting with '.' is matched
only by a pattern segment starting with a literal '.' unless ``dot`` is true, and ``**`` does not descend
into such segments without ``dot``. Matching is case-sensitive and memoized, so it never blows up.
"""


class GlobError(ValueError):
    """Raised for a malformed glob pattern."""


def _expand_braces(p: str) -> list[str]:
    i = -1
    k = 0
    while k < len(p):
        if p[k] == "\\":
            k += 2
            continue
        if p[k] == "{":
            i = k
            break
        if p[k] == "}":
            raise GlobError("unmatched }")
        k += 1
    if i < 0:
        return [p]
    j = i + 1
    parts: list[str] = []
    cur = ""
    while True:
        if j >= len(p):
            raise GlobError("unterminated {")
        c = p[j]
        if c == "\\":
            cur += p[j:j + 2]
            j += 2
            continue
        if c == "{":
            raise GlobError("nested braces are not supported")
        if c == ",":
            parts.append(cur)
            cur = ""
            j += 1
            continue
        if c == "}":
            parts.append(cur)
            break
        cur += c
        j += 1
    out: list[str] = []
    for alt in parts:
        out.extend(_expand_braces(p[:i] + alt + p[j + 1:]))
    return out


def _seg_match(pat: str, s: str, dot: bool) -> bool:
    if not dot and s.startswith(".") and not pat.startswith(".") and not pat.startswith("\\."):
        return False
    memo: dict[tuple[int, int], bool] = {}

    def m(pi: int, si: int) -> bool:
        key = (pi, si)
        if key not in memo:
            memo[key] = run(pi, si)
        return memo[key]

    def run(pi: int, si: int) -> bool:
        while pi < len(pat):
            c = pat[pi]
            if c == "*":
                while pi < len(pat) and pat[pi] == "*":
                    pi += 1
                if pi == len(pat):
                    return True
                return any(m(pi, k) for k in range(si, len(s) + 1))
            if si >= len(s):
                return False
            if c == "?":
                pi += 1
                si += 1
                continue
            if c == "[":
                j = pi + 1
                neg = False
                if j < len(pat) and pat[j] in "!^":
                    neg = True
                    j += 1
                items: list[tuple[str, str]] = []
                first = True
                while True:
                    if j >= len(pat):
                        raise GlobError("unterminated [")
                    if pat[j] == "]" and not first:
                        break
                    first = False
                    a = pat[j]
                    if a == "\\" and j + 1 < len(pat):
                        j += 1
                        a = pat[j]
                    if j + 2 < len(pat) and pat[j + 1] == "-" and pat[j + 2] != "]":
                        b = pat[j + 2]
                        if b == "\\" and j + 3 < len(pat):
                            j += 1
                            b = pat[j + 2]
                        items.append((a, b))
                        j += 3
                    else:
                        items.append((a, a))
                        j += 1
                hit = any(lo <= s[si] <= hi for lo, hi in items)
                if hit == neg:
                    return False
                pi = j + 1
                si += 1
                continue
            if c == "\\":
                if pi + 1 >= len(pat):
                    raise GlobError("trailing backslash")
                pi += 1
                c = pat[pi]
            if s[si] != c:
                return False
            pi += 1
            si += 1
        return si == len(s)

    return m(0, 0)


def _split_segments(p: str) -> list[str]:
    segs: list[str] = []
    cur = ""
    k = 0
    while k < len(p):
        if p[k] == "\\" and k + 1 < len(p):
            cur += p[k:k + 2]
            k += 2
            continue
        if p[k] == "/":
            segs.append(cur)
            cur = ""
            k += 1
            continue
        cur += p[k]
        k += 1
    segs.append(cur)
    return segs


def _match_one(pattern: str, path: str, dot: bool) -> bool:
    ps = _split_segments(pattern)
    ss = path.split("/")
    memo: dict[tuple[int, int], bool] = {}

    def m(i: int, j: int) -> bool:
        key = (i, j)
        if key in memo:
            return memo[key]
        if i == len(ps):
            res = j == len(ss)
        elif ps[i] == "**":
            res = False
            for k in range(j, len(ss) + 1):
                if k > j and not dot and ss[k - 1].startswith("."):
                    break
                if m(i + 1, k):
                    res = True
                    break
        elif j >= len(ss):
            res = False
        else:
            res = _seg_match(ps[i], ss[j], dot) and m(i + 1, j + 1)
        memo[key] = res
        return res

    return m(0, 0)


def _validate(pattern: str) -> None:
    if pattern == "":
        raise GlobError("empty pattern")
    if (len(pattern) - len(pattern.rstrip("\\"))) % 2 == 1:
        raise GlobError("trailing backslash")
    k = 0
    while k < len(pattern):
        if pattern[k] == "\\":
            k += 2
            continue
        if pattern[k] == "[":
            j = k + 1
            if j < len(pattern) and pattern[j] in "!^":
                j += 1
            if j < len(pattern) and pattern[j] == "]":
                j += 1
            while j < len(pattern) and pattern[j] != "]":
                j += 2 if pattern[j] == "\\" else 1
            if j >= len(pattern):
                raise GlobError("unterminated [")
            k = j
        k += 1


def glob_match(pattern: str, path: str, dot: bool = False) -> bool:
    """True when the '/'-separated path matches the glob pattern; raises GlobError for a bad pattern."""
    _validate(pattern)
    return any(_match_one(p, path, dot) for p in _expand_braces(pattern))


def glob_filter(pattern: str, paths: list[str], dot: bool = False) -> list[str]:
    """The paths that match the pattern, in their original order."""
    _validate(pattern)
    alts = _expand_braces(pattern)
    return [p for p in paths if any(_match_one(a, p, dot) for a in alts)]
