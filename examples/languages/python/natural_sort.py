# SPDX-License-Identifier: Apache-2.0
"""Natural sort: "file2" < "file10".

Runs of ASCII digits compare by numeric value (any length), other runs by ASCII case-folded code
points; a digit run sorts before a text run. Ties: fewer runs first, then fewer leading zeros, then
plain code point order of the whole strings, so the order is total and deterministic.
"""
import functools


def _runs(s: str) -> list[tuple[bool, str]]:
    out, i = [], 0
    while i < len(s):
        digit = "0" <= s[i] <= "9"
        j = i
        while j < len(s) and ("0" <= s[j] <= "9") == digit:
            j += 1
        out.append((digit, s[i:j]))
        i = j
    return out


def _fold(s: str) -> str:
    return "".join(chr(ord(c) + 32) if "A" <= c <= "Z" else c for c in s)


def _cmp(x, y) -> int:
    return (x > y) - (x < y)


def natural_compare(a: str, b: str) -> int:
    """-1, 0 or 1 comparing a and b in natural order."""
    ra, rb = _runs(a), _runs(b)
    for (da, xa), (db, xb) in zip(ra, rb):
        if da and db:
            na, nb = xa.lstrip("0") or "0", xb.lstrip("0") or "0"
            c = _cmp(len(na), len(nb)) or _cmp(na, nb)
        elif da != db:
            c = -1 if da else 1
        else:
            c = _cmp(_fold(xa), _fold(xb))
        if c:
            return c
    c = _cmp(len(ra), len(rb))
    if c:
        return c
    for (da, xa), (db, xb) in zip(ra, rb):
        if da and db:
            c = _cmp(len(xa), len(xb))
            if c:
                return c
    return _cmp(a, b)


def natural_sort(items: list[str]) -> list[str]:
    """A new list sorted in natural order."""
    return sorted(items, key=functools.cmp_to_key(natural_compare))
