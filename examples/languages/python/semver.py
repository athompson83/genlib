# SPDX-License-Identifier: Apache-2.0
"""Semantic Versioning 2.0.0 parsing and ordering, plus npm-style range matching.

Ranges desugar exactly as npm's node-semver (without includePrerelease): ^, ~, x-ranges,
hyphen ranges, comparators and || alternatives. A prerelease version only satisfies a
set when one of the set's own comparators has a prerelease on the same major.minor.patch.
"""
import functools
import re
from typing import NamedTuple

_NUM = r"(0|[1-9][0-9]*)"
_PRE_ID = r"(?:0|[1-9][0-9]*|[0-9]*[A-Za-z-][0-9A-Za-z-]*)"
_VERSION = re.compile(rf"{_NUM}\.{_NUM}\.{_NUM}(?:-({_PRE_ID}(?:\.{_PRE_ID})*))?(?:\+([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?")
_XR = r"(0|[1-9][0-9]*|[xX*])"
_PARTIAL = re.compile(rf"v?{_XR}(?:\.{_XR}(?:\.{_XR}(?:-({_PRE_ID}(?:\.{_PRE_ID})*))?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?)?)?")
_TOKEN = re.compile(r"(<=|>=|<|>|=|\^|~>?|)(.+)")
_HYPHEN = re.compile(r"(\S+)\s+-\s+(\S+)")


class Version(NamedTuple):
    major: int
    minor: int
    patch: int
    prerelease: tuple = ()
    build: tuple = ()

    def __str__(self) -> str:
        text = f"{self.major}.{self.minor}.{self.patch}"
        if self.prerelease:
            text += "-" + ".".join(str(p) for p in self.prerelease)
        return text + ("+" + ".".join(self.build) if self.build else "")


def parse(text: str) -> Version:
    """Strict SemVer 2.0.0 (no leading "v", no leading zeros); raises ValueError."""
    match = _VERSION.fullmatch(text) if isinstance(text, str) else None
    if not match:
        raise ValueError(f"invalid semantic version: {text!r}")
    pre = tuple(int(p) if p.isdigit() else p for p in match.group(4).split(".")) if match.group(4) else ()
    build = tuple(match.group(5).split(".")) if match.group(5) else ()
    return Version(int(match.group(1)), int(match.group(2)), int(match.group(3)), pre, build)


def _as_version(value: "str | Version") -> Version:
    return value if isinstance(value, Version) else parse(value)


def _compare_pre(a: tuple, b: tuple) -> int:
    if not a or not b:
        return (not a) - (not b)  # a release sorts after any prerelease
    for x, y in zip(a, b):
        if x == y:
            continue
        if isinstance(x, int) != isinstance(y, int):
            return -1 if isinstance(x, int) else 1
        return -1 if x < y else 1
    return (len(a) > len(b)) - (len(a) < len(b))


def compare(a: "str | Version", b: "str | Version") -> int:
    """-1, 0 or 1 by SemVer precedence; build metadata is ignored."""
    va, vb = _as_version(a), _as_version(b)
    core_a, core_b = va[:3], vb[:3]
    if core_a != core_b:
        return -1 if core_a < core_b else 1
    return _compare_pre(va.prerelease, vb.prerelease)


def sort_versions(versions: list) -> list:
    """Stable ascending sort by precedence."""
    return sorted(versions, key=functools.cmp_to_key(compare))


class _Comparator(NamedTuple):
    op: str
    version: Version
    synthetic: bool = False


def _upper(major: int, minor: int, patch: int) -> _Comparator:
    return _Comparator("<", Version(major, minor, patch, (0,)), True)


def _partial(text: str):
    match = _PARTIAL.fullmatch(text)
    if not match:
        raise ValueError(f"invalid version in range: {text!r}")
    parts = [None if p is None or p in "xX*" else int(p) for p in match.group(1, 2, 3)]
    pre = tuple(int(p) if p.isdigit() else p for p in match.group(4).split(".")) if match.group(4) else ()
    return parts, pre


def _desugar(op: str, text: str) -> list:
    (M, m, p), pre = _partial(text)
    full = p is not None
    if op == "^":
        if M is None:
            return []
        lo = _Comparator(">=", Version(M, m or 0, p or 0, pre))
        if M > 0 or m is None:
            return [lo, _upper(M + 1, 0, 0)]
        if m > 0 or p is None:
            return [lo, _upper(0, m + 1, 0)]
        return [lo, _upper(0, 0, p + 1)]
    if op in ("~", "~>"):
        if M is None:
            return []
        lo = _Comparator(">=", Version(M, m or 0, p or 0, pre))
        return [lo, _upper(M + 1, 0, 0) if m is None else _upper(M, m + 1, 0)]
    if full:
        return [_Comparator(op or "=", Version(M, m, p, pre))]
    if op == "=":
        op = ""
    if M is None:
        return [_Comparator("<", Version(0, 0, 0, (0,)), True)] if op in ("<", ">") else []
    if op:
        m2, p2 = m or 0, 0
        major = M
        if op == ">":
            op = ">="
            major, m2 = (M + 1, 0) if m is None else (M, m2 + 1)
        elif op == "<=":
            op = "<"
            major, m2 = (M + 1, 0) if m is None else (M, m2 + 1)
        if op == "<":
            return [_upper(major, m2, p2)]
        return [_Comparator(op, Version(major, m2, p2))]
    lo = _Comparator(">=", Version(M, m or 0, 0))
    return [lo, _upper(M + 1, 0, 0) if m is None else _upper(M, m + 1, 0)]


def _hyphen(low: str, high: str) -> list:
    (M, m, p), pre = _partial(low)
    out = []
    if M is not None:
        out.append(_Comparator(">=", Version(M, m or 0, p or 0, pre if p is not None else ())))
    (M, m, p), pre = _partial(high)
    if M is not None:
        if m is None:
            out.append(_upper(M + 1, 0, 0))
        elif p is None:
            out.append(_upper(M, m + 1, 0))
        else:
            out.append(_Comparator("<=", Version(M, m, p, pre)))
    return out


def _parse_set(text: str) -> list:
    text = text.strip()
    hyphen = _HYPHEN.fullmatch(text)
    if hyphen:
        return _hyphen(hyphen.group(1), hyphen.group(2))
    text = re.sub(r"(<=|>=|<|>|=|\^|~>?)\s+", r"\1", text)
    out = []
    for token in text.split():
        match = _TOKEN.fullmatch(token)
        if not match:
            raise ValueError(f"invalid range token: {token!r}")
        out.extend(_desugar(match.group(1), match.group(2)))
    return out


def _test(comparator: _Comparator, version: Version) -> bool:
    c = compare(version, comparator.version)
    return {"=": c == 0, "<": c < 0, "<=": c <= 0, ">": c > 0, ">=": c >= 0}[comparator.op]


def satisfies(version: "str | Version", range_text: str) -> bool:
    """True when version matches the npm-style range; raises ValueError for invalid input."""
    v = _as_version(version)
    if not isinstance(range_text, str):
        raise ValueError("range must be a string")
    for set_text in range_text.split("||"):
        comparators = _parse_set(set_text)
        if not all(_test(c, v) for c in comparators):
            continue
        if not v.prerelease or any(c.version.prerelease and not c.synthetic and c.version[:3] == v[:3]
                                   for c in comparators):
            return True
    return False
