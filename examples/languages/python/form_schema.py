# SPDX-License-Identifier: Apache-2.0
"""Server-side form validation from a small declarative schema.

The schema is a list of dicts using portable (JSON) keys: name, type, required, minLength,
maxLength, min, max, pattern (full match), enum. Errors are codes, not messages, so the UI can
localize them. Patterns come from schema authors, never end users. The email rule is a simple
shape check; confirm ownership with a verification link.
"""
import math
import re
from collections.abc import Mapping, Sequence
from typing import Any

TYPES = ("string", "number", "integer", "boolean", "email", "date")
_DATE = re.compile(r"([0-9]{4})-([0-9]{2})-([0-9]{2})")


def _is_email(value: str) -> bool:
    parts = value.split("@")
    return (len(parts) == 2 and bool(parts[0]) and "." in parts[1]
            and not any(ch.isspace() for ch in value) and len(value) <= 254)


def _is_date(value: str) -> bool:
    match = _DATE.fullmatch(value)
    if not match:
        return False
    year, month, day = (int(g) for g in match.groups())
    leap = (year % 4 == 0 and year % 100 != 0) or year % 400 == 0
    days = [31, 29 if leap else 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
    return 1 <= month <= 12 and 1 <= day <= days[month - 1]


def _type_matches(kind: str, value: Any) -> bool:
    if kind == "boolean":
        return isinstance(value, bool)
    if isinstance(value, bool):
        return False
    if kind == "number":
        return isinstance(value, (int, float)) and math.isfinite(value)
    if kind == "integer":
        return isinstance(value, int) or (isinstance(value, float) and value.is_integer())
    return isinstance(value, str)


def _compile(schema: Sequence[Mapping[str, Any]]) -> dict[str, tuple[Mapping[str, Any], re.Pattern[str] | None]]:
    compiled: dict[str, tuple[Mapping[str, Any], re.Pattern[str] | None]] = {}
    for field in schema:
        name = field.get("name")
        if not name or name in compiled:
            raise ValueError(f"missing or duplicate field name: {name!r}")
        if field.get("type") not in TYPES:
            raise ValueError(f"unknown type for {name}: {field.get('type')!r}")
        pattern = field.get("pattern")
        # re.ASCII keeps \d and \w ASCII-only, matching JavaScript and most other languages.
        compiled[name] = (field, re.compile(pattern, re.ASCII) if pattern is not None else None)
    return compiled


def _check_field(field: Mapping[str, Any], pattern: re.Pattern[str] | None, value: Any) -> list[str]:
    if value is None or value == "":
        return ["required"] if field.get("required") else []
    if not _type_matches(field["type"], value):
        return ["type"]
    codes: list[str] = []
    if isinstance(value, str):
        if field.get("minLength") is not None and len(value) < field["minLength"]:
            codes.append("minLength")
        if field.get("maxLength") is not None and len(value) > field["maxLength"]:
            codes.append("maxLength")
    elif not isinstance(value, bool):
        if field.get("min") is not None and value < field["min"]:
            codes.append("min")
        if field.get("max") is not None and value > field["max"]:
            codes.append("max")
    if isinstance(value, str):
        if pattern is not None and not pattern.fullmatch(value):
            codes.append("pattern")
        if field.get("enum") is not None and value not in field["enum"]:
            codes.append("enum")
        if field["type"] == "email" and not _is_email(value):
            codes.append("email")
        if field["type"] == "date" and not _is_date(value):
            codes.append("date")
    return codes


def validate(schema: Sequence[Mapping[str, Any]], values: Mapping[str, Any],
             allow_unknown: bool = False) -> dict[str, list[str]]:
    """Field name -> error codes, only for fields with errors: schema order, then unknown keys."""
    compiled = _compile(schema)
    errors: dict[str, list[str]] = {}
    for name, (field, pattern) in compiled.items():
        codes = _check_field(field, pattern, values.get(name))
        if codes:
            errors[name] = codes
    if not allow_unknown:
        for key in values:
            if key not in compiled:
                errors[key] = ["unknown"]
    return errors
