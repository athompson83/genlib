# SPDX-License-Identifier: Apache-2.0
"""Dotted paths into JSON-like data: ``user.addresses[0].city`` and ``a["x.y"]``.

Data is what json.loads produces (dict, list, str, int, float, bool, None). Grammar: names are
separated by '.', run until '.' or '[' and may not be empty; ``[n]`` (no leading zeros except
``0``) is a list index; ``["..."]`` is a key with ``\\"`` and ``\\\\`` escapes (for keys containing
dots). The empty path is the root. get_path returns the default for a missing key, an out-of-range
index, an index on a non-list or a key on a non-object. set_path and delete_path return a NEW
structure and never mutate their input: set_path creates dicts for a following key and lists for a
following index, appends when index == len(list), and raises for index > len or a scalar in the way.
"""

import copy
import re

_INDEX = re.compile(r"\[(0|[1-9][0-9]*)\]")
_MISSING = object()


class PathError(ValueError):
    """Raised for a malformed path or a set_path that cannot be applied."""


def parse_path(path: str) -> list:
    """Split a dotted path into keys (str) and list indexes (int); '' is the root ([])."""
    out: list = []
    i, n = 0, len(path)
    while i < n:
        c = path[i]
        if c == "[":
            if i + 1 < n and path[i + 1] == '"':
                j = i + 2
                buf = []
                while True:
                    if j >= n:
                        raise PathError("unterminated quoted key")
                    if path[j] == "\\" and j + 1 < n:
                        buf.append(path[j + 1])
                        j += 2
                        continue
                    if path[j] == '"':
                        break
                    buf.append(path[j])
                    j += 1
                if j + 1 >= n or path[j + 1] != "]":
                    raise PathError("expected ]")
                out.append("".join(buf))
                i = j + 2
            else:
                m = _INDEX.match(path, i)
                if not m:
                    raise PathError("bad index")
                out.append(int(m.group(1)))
                i = m.end()
            if i < n and path[i] == ".":
                i += 1
                if i >= n:
                    raise PathError("trailing dot")
            continue
        if c == ".":
            raise PathError("empty segment")
        j = i
        while j < n and path[j] not in ".[":
            j += 1
        out.append(path[i:j])
        i = j
        if i < n and path[i] == ".":
            i += 1
            if i >= n:
                raise PathError("trailing dot")
    return out


def _step(cur, key):
    if isinstance(key, int):
        return cur[key] if isinstance(cur, list) and key < len(cur) else _MISSING
    return cur[key] if isinstance(cur, dict) and key in cur else _MISSING


def get_path(data, path: str, default=None):
    """Value at path, or default when any step is missing."""
    cur = data
    for key in parse_path(path):
        cur = _step(cur, key)
        if cur is _MISSING:
            return default
    return cur


def has_path(data, path: str) -> bool:
    """True when every step of path exists (a None value counts as present)."""
    cur = data
    for key in parse_path(path):
        cur = _step(cur, key)
        if cur is _MISSING:
            return False
    return True


def _set(cur, keys: list, value):
    if not keys:
        return copy.deepcopy(value)
    key, rest = keys[0], keys[1:]
    if cur is None:
        cur = [] if isinstance(key, int) else {}
    if isinstance(key, int):
        if not isinstance(cur, list):
            raise PathError("index on a non-list")
        if key > len(cur):
            raise PathError("index out of range")
        new = copy.deepcopy(cur)
        child = new[key] if key < len(new) else None
        v = _set(child, rest, value)
        if key == len(new):
            new.append(v)
        else:
            new[key] = v
        return new
    if not isinstance(cur, dict):
        raise PathError("key on a non-object")
    new = copy.deepcopy(cur)
    new[key] = _set(new.get(key), rest, value)
    return new


def set_path(data, path: str, value):
    """New structure with value at path (creates containers, appends at index == len)."""
    return _set(data, parse_path(path), value)


def delete_path(data, path: str):
    """New structure without the key or index at path (lists shift); a missing path returns a copy."""
    keys = parse_path(path)
    if not keys:
        return None

    def rec(cur, keys):
        key, rest = keys[0], keys[1:]
        if _step(cur, key) is _MISSING:
            return copy.deepcopy(cur)
        new = copy.deepcopy(cur)
        if rest:
            new[key] = rec(cur[key], rest)
        else:
            del new[key]
        return new

    return rec(data, keys)
