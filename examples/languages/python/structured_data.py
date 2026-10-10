# SPDX-License-Identifier: Apache-2.0
"""JSON-LD <script> blocks and <head> meta / Open Graph / Twitter card tags.

Pure and deterministic. JSON-LD output escapes < > & U+2028 U+2029 as \\uXXXX so text cannot
close the <script> element; meta values are HTML-escaped. Validate the result with a
schema.org testing tool.
"""
import json
import math
import re
from collections.abc import Mapping, Sequence
from typing import Any, Optional

TWITTER_CARDS = ("summary", "summary_large_image", "app", "player")
_SCRIPT = {"<": "\\u003c", ">": "\\u003e", "&": "\\u0026", "\u2028": "\\u2028", "\u2029": "\\u2029"}
_SCRIPT_RE = re.compile("[<>&\u2028\u2029]")
_HTML = {"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;"}
_HTTPS = re.compile(r"https://[^/?#]+", re.IGNORECASE)
_BAD_URL_CHARS = re.compile(r"[\x00-\x20\x7f]")
_LOCALE = re.compile(r"[a-z]{2,3}(_[A-Z]{2})?")


def _string(value: str) -> str:
    return _SCRIPT_RE.sub(lambda m: _SCRIPT[m.group(0)], json.dumps(value, ensure_ascii=False))


def script_safe_json(value: Any, path: str = "$", depth: int = 0) -> str:
    """Compact JSON, keys in insertion order, script-safe escaping; rejects NaN/Infinity."""
    if depth > 64:
        raise ValueError(f"{path}: nesting is deeper than 64 levels")
    if value is None:
        return "null"
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, int):
        return str(value)
    if isinstance(value, float):
        if not math.isfinite(value):
            raise ValueError(f"{path}: numbers must be finite (no NaN or Infinity)")
        if value.is_integer() and abs(value) < 1e21:
            return str(int(value))
        return json.dumps(value)
    if isinstance(value, str):
        return _string(value)
    if isinstance(value, Mapping):
        members = []
        for key, item in value.items():
            if not isinstance(key, str):
                raise TypeError(f"{path}: object keys must be strings")
            members.append(f"{_string(key)}:{script_safe_json(item, f'{path}.{key}', depth + 1)}")
        return "{" + ",".join(members) + "}"
    if isinstance(value, Sequence) and not isinstance(value, (bytes, bytearray)):
        items = (script_safe_json(item, f"{path}[{i}]", depth + 1) for i, item in enumerate(value))
        return "[" + ",".join(items) + "]"
    raise TypeError(f"{path}: unsupported JSON-LD value of type {type(value).__name__}")


def json_ld_script(data: Any) -> str:
    """Returns <script type="application/ld+json">{...}</script> for a dict or list."""
    if isinstance(data, (str, bytes)) or not isinstance(data, (Mapping, Sequence)):
        raise TypeError("JSON-LD data must be an object or an array")
    return f'<script type="application/ld+json">{script_safe_json(data)}</script>'


def html_escape(value: str) -> str:
    """Escapes & < > " for HTML text and double-quoted attribute values."""
    return "".join(_HTML.get(ch, ch) for ch in value)


def _is_https_url(value: str) -> bool:
    return not _BAD_URL_CHARS.search(value) and bool(_HTTPS.match(value))


def _optional(value: Optional[str], label: str) -> Optional[str]:
    if value is None or value == "":
        return None
    if not isinstance(value, str):
        raise TypeError(f"{label} must be a string")
    return value


def meta_tags(title: str, *, description: Optional[str] = None, canonical: Optional[str] = None,
              image: Optional[str] = None, site_name: Optional[str] = None,
              type: Optional[str] = None, twitter_card: Optional[str] = None,
              locale: Optional[str] = None) -> str:  # noqa: A002 - mirrors og:type
    """Title, description, canonical, Open Graph and Twitter tags joined by "\\n"."""
    if not isinstance(title, str) or not title.strip():
        raise ValueError("title must be a non-empty string")
    description = _optional(description, "description")
    canonical = _optional(canonical, "canonical")
    image = _optional(image, "image")
    site_name = _optional(site_name, "site_name")
    og_type = _optional(type, "type") or "website"
    card = _optional(twitter_card, "twitter_card") or "summary_large_image"
    locale = _optional(locale, "locale")
    if canonical is not None and not _is_https_url(canonical):
        raise ValueError("canonical must be an absolute https URL")
    if image is not None and not _is_https_url(image):
        raise ValueError("image must be an absolute https URL")
    if card not in TWITTER_CARDS:
        raise ValueError(f"twitter_card must be one of {', '.join(TWITTER_CARDS)}")
    if locale is not None and not _LOCALE.fullmatch(locale):
        raise ValueError("locale must look like en or en_US")
    rows = [
        (title, '<title>{}</title>'),
        (description, '<meta name="description" content="{}">'),
        (canonical, '<link rel="canonical" href="{}">'),
        (title, '<meta property="og:title" content="{}">'),
        (description, '<meta property="og:description" content="{}">'),
        (canonical, '<meta property="og:url" content="{}">'),
        (image, '<meta property="og:image" content="{}">'),
        (site_name, '<meta property="og:site_name" content="{}">'),
        (og_type, '<meta property="og:type" content="{}">'),
        (locale, '<meta property="og:locale" content="{}">'),
        (card, '<meta name="twitter:card" content="{}">'),
        (title, '<meta name="twitter:title" content="{}">'),
        (description, '<meta name="twitter:description" content="{}">'),
        (image, '<meta name="twitter:image" content="{}">'),
    ]
    return "\n".join(line.format(html_escape(value)) for value, line in rows if value is not None)
