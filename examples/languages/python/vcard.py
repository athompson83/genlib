# SPDX-License-Identifier: Apache-2.0
"""RFC 6350 vCard 4.0 export for "save contact" downloads (.vcf) and address-book feeds.

Contact mappings use the shared JSON keys: fn (required), n {family, given, additional, prefix,
suffix}, org, title, emails [{value, type?}], phones [{value, type?}], address {type?, poBox,
extended, street, locality, region, postalCode, country}, urls, note, uid. Raises ValueError for
invalid fields; lines end with CRLF and are folded at 75 octets without splitting UTF-8 characters.
"""
import re
from collections.abc import Mapping

_CONTROL = re.compile(r"[\x00-\x09\x0b-\x1f\x7f]")
_TYPE = re.compile(r"[a-z][a-z0-9-]*")
_EMAIL = re.compile(r"[^\s@]+@[^\s@]+")
_TEL = re.compile(r"\+?[0-9][0-9 ().-]{1,30}")
_URL = re.compile(r"https?://\S+")
_N = ("family", "given", "additional", "prefix", "suffix")
_ADR = ("poBox", "extended", "street", "locality", "region", "postalCode", "country")


def _esc(value) -> str:
    if not isinstance(value, str):
        raise ValueError("vCard text values must be strings")
    if _CONTROL.search(value):
        raise ValueError("control characters are not allowed in vCard text")
    return value.replace("\\", "\\\\").replace(",", "\\,").replace(";", "\\;").replace("\n", "\\n")


def _type(value) -> str:
    if value is None:
        return ""
    if not isinstance(value, str) or not _TYPE.fullmatch(value):
        raise ValueError("TYPE must match [a-z][a-z0-9-]*")
    return ";TYPE=" + value


def _fold(line: str) -> str:
    data = line.encode("utf-8")
    parts, limit, start = [], 75, 0
    while len(data) - start > limit:
        end = start + limit
        while data[end] & 0xC0 == 0x80:  # never split a UTF-8 sequence
            end -= 1
        parts.append(data[start:end])
        start, limit = end, 74
    parts.append(data[start:])
    return "\r\n ".join(p.decode("utf-8") for p in parts) + "\r\n"


def _checked(pattern: re.Pattern, value, what: str) -> str:
    if not isinstance(value, str) or not pattern.fullmatch(value):
        raise ValueError(f"invalid {what}: {value!r}")
    return value


def build_vcard(contact: Mapping) -> str:
    fn = contact.get("fn")
    if not isinstance(fn, str) or not fn.strip():
        raise ValueError("fn is required and must not be blank")
    lines = ["BEGIN:VCARD", "VERSION:4.0", "FN:" + _esc(fn)]
    if "n" in contact:
        n = contact["n"]
        lines.append("N:" + ";".join(_esc(n.get(k, "")) for k in _N))
    for key, prop in (("org", "ORG"), ("title", "TITLE")):
        if contact.get(key):
            lines.append(f"{prop}:" + _esc(contact[key]))
    for e in contact.get("emails") or []:
        value = _checked(_EMAIL, e.get("value"), "email")
        lines.append("EMAIL" + _type(e.get("type")) + ":" + _esc(value))
    for p in contact.get("phones") or []:
        value = _checked(_TEL, p.get("value"), "phone")
        lines.append("TEL" + _type(p.get("type")) + ":" + value)
    if "address" in contact:
        a = contact["address"]
        lines.append("ADR" + _type(a.get("type")) + ":" + ";".join(_esc(a.get(k, "")) for k in _ADR))
    for u in contact.get("urls") or []:
        lines.append("URL:" + _checked(_URL, u, "url"))
    for key, prop in (("note", "NOTE"), ("uid", "UID")):
        if contact.get(key):
            lines.append(f"{prop}:" + _esc(contact[key]))
    lines.append("END:VCARD")
    return "".join(_fold(line) for line in lines)
