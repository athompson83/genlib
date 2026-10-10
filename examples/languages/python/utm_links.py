# SPDX-License-Identifier: Apache-2.0
"""Build, parse and clean campaign (UTM) URLs.

Pure string handling that keeps existing query parameters in place with their original
encoding. Values are trimmed and lowercased so reports do not split "Email" from "email".
"""
import re
from collections.abc import Mapping
from urllib.parse import quote, unquote_to_bytes

#: Output order for both build_utm_url and parse_utm.
UTM_KEYS = ("id", "source", "medium", "campaign", "term", "content")
REQUIRED_KEYS = ("source", "medium", "campaign")
TRACKING_PARAMS = frozenset({"gclid", "gbraid", "wbraid", "fbclid", "msclkid", "ttclid", "twclid",
                             "li_fat_id", "mc_cid", "mc_eid", "_hsenc", "_hsmi", "yclid", "igshid"})

_URL = re.compile(r"https?://[^/?#]+", re.IGNORECASE)
_BAD_URL_CHARS = re.compile(r"[\x00-\x20\x7f]")
_BAD_PERCENT = re.compile(r"%(?![0-9A-Fa-f]{2})")


def _split(url: str, label: str) -> tuple[str, list[str], str]:
    if not isinstance(url, str) or _BAD_URL_CHARS.search(url) or not _URL.match(url):
        raise ValueError(f"{label} must be an absolute http(s) URL")
    rest, hash_sign, fragment = url.partition("#")
    base, question, query = rest.partition("?")
    params = [p for p in query.split("&") if p] if question else []
    return base, params, hash_sign + fragment


def _join(base: str, params: list[str], fragment: str) -> str:
    return base + ("?" + "&".join(params) if params else "") + fragment


def _raw_key(param: str) -> str:
    return param.partition("=")[0]


def percent_encode(value: str) -> str:
    """RFC 3986 percent-encoding of UTF-8 bytes, keeping only unreserved A-Z a-z 0-9 - . _ ~."""
    return quote(value, safe="-._~")


def _decode(value: str) -> str:
    value = value.replace("+", " ")
    if _BAD_PERCENT.search(value):
        raise ValueError(f"invalid percent-encoding in {value!r}")
    try:
        return unquote_to_bytes(value).decode("utf-8")
    except UnicodeDecodeError as error:
        raise ValueError(f"invalid percent-encoding in {value!r}") from error


def build_utm_url(base_url: str, params: Mapping[str, str]) -> str:
    """params keys: source, medium, campaign (required); term, content, id (optional)."""
    unknown = set(params) - set(UTM_KEYS)
    if unknown:
        raise ValueError(f"unknown UTM keys {sorted(unknown)}")
    base, query, fragment = _split(base_url, "base_url")
    for key in UTM_KEYS:
        raw = params.get(key)
        if raw is not None and not isinstance(raw, str):
            raise TypeError(f"{key} must be a string")
        value = (raw or "").strip().lower()
        if not value:
            if key in REQUIRED_KEYS:
                raise ValueError(f"{key} is required")
            continue
        name = f"utm_{key}"
        pair = f"{name}={percent_encode(value)}"
        index = next((i for i, p in enumerate(query) if _raw_key(p) == name), -1)
        if index < 0:
            query.append(pair)
            continue
        query = [p for i, p in enumerate(query) if i <= index or _raw_key(p) != name]
        query[index] = pair
    return _join(base, query, fragment)


def parse_utm(url: str) -> dict[str, str]:
    """Present utm_* values without the prefix, decoded (+ is a space), first occurrence wins."""
    found: dict[str, str] = {}
    for param in _split(url, "url")[1]:
        raw_key, _, raw_value = param.partition("=")
        key = _decode(raw_key)
        if key.startswith("utm_") and key not in found:
            found[key] = _decode(raw_value)
    return {key: found[f"utm_{key}"] for key in UTM_KEYS if f"utm_{key}" in found}


def strip_tracking(url: str) -> str:
    """Removes utm_* and click-ID parameters; other parameters keep their order and encoding."""
    base, query, fragment = _split(url, "url")
    kept = [p for p in query if not _raw_key(p).startswith("utm_") and _raw_key(p) not in TRACKING_PARAMS]
    return _join(base, kept, fragment)
