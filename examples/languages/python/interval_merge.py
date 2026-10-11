# SPDX-License-Identifier: Apache-2.0
"""Set operations on integer half-open intervals [start, end).

An interval is a (start, end) pair of ints with start < end; anything else raises IntervalError.
Every result is a sorted list of non-overlapping [start, end] lists with touching intervals merged,
so [1, 2] and [2, 3] become [1, 3]. overlaps() treats touching intervals as not overlapping.
"""


class IntervalError(ValueError):
    """Raised for an empty or reversed interval or bad gap bounds."""


def _check(xs) -> None:
    for x in xs:
        if len(x) != 2:
            raise IntervalError("an interval is a [start, end] pair")
        s, e = x
        if isinstance(s, bool) or isinstance(e, bool) or not isinstance(s, int) or not isinstance(e, int) or s >= e:
            raise IntervalError("interval needs integers with start < end")


def merge(xs) -> list[list[int]]:
    """Sort and merge overlapping or touching intervals."""
    _check(xs)
    out: list[list[int]] = []
    for s, e in sorted((s, e) for s, e in xs):
        if out and s <= out[-1][1]:
            out[-1][1] = max(out[-1][1], e)
        else:
            out.append([s, e])
    return out


def intersect(a, b) -> list[list[int]]:
    """The parts covered by both interval sets."""
    a, b = merge(a), merge(b)
    i = j = 0
    out: list[list[int]] = []
    while i < len(a) and j < len(b):
        s, e = max(a[i][0], b[j][0]), min(a[i][1], b[j][1])
        if s < e:
            out.append([s, e])
        if a[i][1] < b[j][1]:
            i += 1
        else:
            j += 1
    return merge(out)


def subtract(a, b) -> list[list[int]]:
    """The parts of a not covered by b."""
    a, b = merge(a), merge(b)
    out: list[list[int]] = []
    for s, e in a:
        cur = s
        for bs, be in b:
            if be <= cur or bs >= e:
                continue
            if bs > cur:
                out.append([cur, bs])
            cur = max(cur, be)
            if cur >= e:
                break
        if cur < e:
            out.append([cur, e])
    return out


def gaps(xs, lo: int, hi: int) -> list[list[int]]:
    """The parts of [lo, hi) not covered by xs (lo < hi)."""
    if lo >= hi:
        raise IntervalError("gaps needs lo < hi")
    return subtract([[lo, hi]], xs)


def total(xs) -> int:
    """Covered length after merging."""
    return sum(e - s for s, e in merge(xs))


def overlaps(x, y) -> bool:
    """True when two intervals share at least one point (touching is not overlapping)."""
    _check([x, y])
    return x[0] < y[1] and y[0] < x[1]


def contains(xs, p: int) -> bool:
    """True when some interval has start <= p < end."""
    return any(s <= p < e for s, e in merge(xs))
