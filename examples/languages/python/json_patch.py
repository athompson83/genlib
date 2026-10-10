# SPDX-License-Identifier: Apache-2.0
"""JSON Pointer (RFC 6901), JSON Patch (RFC 6902), JSON Merge Patch (RFC 7396) and a patch generator.

Values are the ones json.loads produces: dict, list, str, int, float, bool and None. Equality is
deep, compares numbers numerically (1 == 1.0), never treats booleans as numbers and ignores object
key order. apply_patch is atomic and returns a new document; the input is never changed.
create_patch is deterministic (keys in code point order, arrays by index, no moves). canonical
prints compact JSON with keys in code point order, whole numbers without a decimal point and other
floats in Python's shortest round-trip form; non-finite numbers raise ValueError.
"""

import copy
import json
import math
import re

_INDEX = re.compile(r"0|[1-9][0-9]*")
_BAD_ESCAPE = re.compile(r"~(?![01])")


def _is_number(v) -> bool:
    return isinstance(v, (int, float)) and not isinstance(v, bool)


def equal(a, b) -> bool:
    """Deep JSON equality (numbers numerically, booleans never equal numbers)."""
    if _is_number(a) and _is_number(b):
        return a == b
    if isinstance(a, dict) and isinstance(b, dict):
        return a.keys() == b.keys() and all(equal(a[k], b[k]) for k in a)
    if isinstance(a, list) and isinstance(b, list):
        return len(a) == len(b) and all(equal(x, y) for x, y in zip(a, b))
    if _is_number(a) or _is_number(b) or type(a) is not type(b):
        return False
    return a == b


def _parse_pointer(pointer) -> list:
    if not isinstance(pointer, str):
        raise ValueError("pointer must be a string")
    if pointer == "":
        return []
    if not pointer.startswith("/"):
        raise ValueError('pointer must be empty or start with "/"')
    tokens = []
    for token in pointer[1:].split("/"):
        if _BAD_ESCAPE.search(token):
            raise ValueError(f"bad escape in pointer token {token!r}")
        tokens.append(token.replace("~1", "/").replace("~0", "~"))
    return tokens


def _escape(token: str) -> str:
    return token.replace("~", "~0").replace("/", "~1")


def _index(token: str, length: int, allow_end: bool) -> int:
    if allow_end and token == "-":
        return length
    if not _INDEX.fullmatch(token):
        raise ValueError(f"bad array index {token!r}")
    i = int(token)
    if i > length or (i == length and not allow_end):
        raise ValueError(f"array index {i} out of range")
    return i


def _get(doc, tokens):
    cur = doc
    for t in tokens:
        if isinstance(cur, dict):
            if t not in cur:
                raise ValueError(f"no member {t!r}")
            cur = cur[t]
        elif isinstance(cur, list):
            cur = cur[_index(t, len(cur), False)]
        else:
            raise ValueError("cannot index a scalar")
    return cur


def get_pointer(doc, pointer: str):
    """The value at an RFC 6901 pointer ("" is the whole document)."""
    return _get(doc, _parse_pointer(pointer))


def _add(doc, tokens, value):
    if not tokens:
        return value
    parent, last = _get(doc, tokens[:-1]), tokens[-1]
    if isinstance(parent, dict):
        parent[last] = value
    elif isinstance(parent, list):
        parent.insert(_index(last, len(parent), True), value)
    else:
        raise ValueError("cannot add to a scalar")
    return doc


def _remove(doc, tokens):
    if not tokens:
        raise ValueError("cannot remove the root")
    parent, last = _get(doc, tokens[:-1]), tokens[-1]
    if isinstance(parent, dict):
        if last not in parent:
            raise ValueError(f"no member {last!r}")
        return parent.pop(last)
    if isinstance(parent, list):
        return parent.pop(_index(last, len(parent), False))
    raise ValueError("cannot remove from a scalar")


def apply_patch(doc, patch):
    """Apply an RFC 6902 patch atomically; returns a new document and never changes doc."""
    if not isinstance(patch, list):
        raise ValueError("patch must be an array")
    doc = copy.deepcopy(doc)
    for op in patch:
        if not isinstance(op, dict) or not isinstance(op.get("op"), str):
            raise ValueError('operation must be an object with a string "op"')
        if "path" not in op:
            raise ValueError('operation needs "path"')
        kind, path = op["op"], _parse_pointer(op["path"])
        if kind in ("add", "replace", "test") and "value" not in op:
            raise ValueError(f'{kind} needs "value"')
        if kind in ("move", "copy") and "from" not in op:
            raise ValueError(f'{kind} needs "from"')
        if kind == "add":
            doc = _add(doc, path, copy.deepcopy(op["value"]))
        elif kind == "remove":
            _remove(doc, path)
        elif kind == "replace":
            _get(doc, path)
            if not path:
                doc = copy.deepcopy(op["value"])
            else:
                _remove(doc, path)
                doc = _add(doc, path, copy.deepcopy(op["value"]))
        elif kind == "move":
            source = _parse_pointer(op["from"])
            if source == path:
                _get(doc, source)
                continue
            if path[:len(source)] == source:
                raise ValueError("cannot move a value into itself")
            doc = _add(doc, path, _remove(doc, source))
        elif kind == "copy":
            doc = _add(doc, path, copy.deepcopy(get_pointer(doc, op["from"])))
        elif kind == "test":
            if not equal(_get(doc, path), op["value"]):
                raise ValueError(f"test failed at {op['path']!r}")
        else:
            raise ValueError(f"unknown op {kind!r}")
    return doc


def merge_patch(target, patch):
    """RFC 7396 merge patch; returns a new value."""
    if not isinstance(patch, dict):
        return copy.deepcopy(patch)
    out = copy.deepcopy(target) if isinstance(target, dict) else {}
    for k, v in patch.items():
        if v is None:
            out.pop(k, None)
        else:
            out[k] = merge_patch(out.get(k), v)
    return out


def create_patch(a, b, path: str = "") -> list:
    """Deterministic RFC 6902 patch turning a into b (apply_patch(a, create_patch(a, b)) equals b)."""
    if equal(a, b):
        return []
    if isinstance(a, dict) and isinstance(b, dict):
        ops = []
        for k in sorted(set(a) | set(b)):  # str ordering is code point ordering
            p = path + "/" + _escape(k)
            if k not in b:
                ops.append({"op": "remove", "path": p})
            elif k not in a:
                ops.append({"op": "add", "path": p, "value": copy.deepcopy(b[k])})
            else:
                ops += create_patch(a[k], b[k], p)
        return ops
    if isinstance(a, list) and isinstance(b, list):
        ops = []
        for i in range(min(len(a), len(b))):
            ops += create_patch(a[i], b[i], f"{path}/{i}")
        for i in range(len(a) - 1, len(b) - 1, -1):
            ops.append({"op": "remove", "path": f"{path}/{i}"})
        for i in range(len(a), len(b)):
            ops.append({"op": "add", "path": f"{path}/{i}", "value": copy.deepcopy(b[i])})
        return ops
    return [{"op": "replace", "path": path, "value": copy.deepcopy(b)}]


def canonical(v) -> str:
    """Compact JSON, keys in code point order, whole numbers without a decimal point."""
    if isinstance(v, dict):
        return "{" + ",".join(canonical(k) + ":" + canonical(v[k]) for k in sorted(v)) + "}"
    if isinstance(v, list):
        return "[" + ",".join(canonical(x) for x in v) + "]"
    if isinstance(v, float):
        if not math.isfinite(v):
            raise ValueError("JSON numbers must be finite")
        if v.is_integer():
            return str(int(v))
    return json.dumps(v, ensure_ascii=False)
