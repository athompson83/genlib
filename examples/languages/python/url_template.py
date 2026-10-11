# SPDX-License-Identifier: Apache-2.0
"""RFC 6570 URI Template expansion, levels 1-4 (simple, +, #, ., /, ;, ? and & operators).

Variables map a name to a string, a list of strings or an ordered dict of string to string; a
missing name, None, an empty list and an empty dict are undefined and skipped. Unreserved
characters are kept; the + and # operators also keep reserved characters and existing %XX
triplets; everything else is percent-encoded as UTF-8 with uppercase hex. A prefix ``:n`` (1..9999)
cuts strings by code point and is an error on lists and dicts. Literal text copies %XX triplets as-is
(RFC 6570 section 3.1), keeps unreserved and reserved characters and encodes the rest. Malformed
templates (unclosed or stray braces, empty expressions, bad names, bad prefixes, the reserved
operators = , ! @ |) raise.
"""

import re

_OPS = {"": ("", ",", False, "", False), "+": ("", ",", False, "", True), "#": ("#", ",", False, "", True),
        ".": (".", ".", False, "", False), "/": ("/", "/", False, "", False), ";": (";", ";", True, "", False),
        "?": ("?", "&", True, "=", False), "&": ("&", "&", True, "=", False)}
_UNRESERVED = frozenset("ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~")
_RESERVED = frozenset(":/?#[]@!$&'()*+,;=")
_VARNAME = re.compile(r"^(?:[A-Za-z0-9_]|%[0-9A-Fa-f]{2})(?:\.?(?:[A-Za-z0-9_]|%[0-9A-Fa-f]{2}))*$")
_VARSPEC = re.compile(r"^([^:*]+)(?::([0-9]+)|(\*))?$")
_TRIPLET = re.compile(r"%[0-9A-Fa-f]{2}")


class UrlTemplateError(ValueError):
    """Raised for a malformed template or a value that cannot be expanded."""


def _enc(s: str, allow_reserved: bool) -> str:
    out = []
    i = 0
    while i < len(s):
        c = s[i]
        if allow_reserved and c == "%" and _TRIPLET.match(s, i):
            out.append(s[i:i + 3])
            i += 3
            continue
        if c in _UNRESERVED or (allow_reserved and c in _RESERVED):
            out.append(c)
        else:
            out.extend("%%%02X" % b for b in c.encode("utf-8"))
        i += 1
    return "".join(out)


def _varspec(spec: str) -> tuple[str, int | None, bool]:
    m = _VARSPEC.match(spec)
    if not m or not _VARNAME.match(m.group(1)):
        raise UrlTemplateError("bad varspec: " + spec)
    prefix = None
    if m.group(2) is not None:
        if m.group(2).startswith("0") or not 1 <= int(m.group(2)) <= 9999:
            raise UrlTemplateError("bad prefix: " + spec)
        prefix = int(m.group(2))
    return m.group(1), prefix, m.group(3) is not None


def _expand(expr: str, variables: dict) -> str:
    if expr == "":
        raise UrlTemplateError("empty expression")
    if expr[0] in "=,!@|":
        raise UrlTemplateError("reserved operator: " + expr[0])
    op = expr[0] if expr[0] in "+#./;?&" else ""
    first, sep, named, ifemp, allow = _OPS[op]
    parts = []
    for spec in expr[len(op):].split(","):
        name, prefix, explode = _varspec(spec)
        value = variables.get(name)
        if value is None or (isinstance(value, (list, dict)) and not value):
            continue
        if isinstance(value, str):
            v = value[:prefix] if prefix else value
            if named:
                parts.append(_enc(name, allow) + (ifemp if v == "" else "=" + _enc(v, allow)))
            else:
                parts.append(_enc(v, allow))
            continue
        if prefix:
            raise UrlTemplateError("prefix on composite value: " + name)
        if isinstance(value, list):
            if not explode:
                joined = ",".join(_enc(x, allow) for x in value)
                parts.append(_enc(name, allow) + "=" + joined if named else joined)
            elif named:
                parts.append(sep.join(_enc(name, allow) + (ifemp if x == "" else "=" + _enc(x, allow)) for x in value))
            else:
                parts.append(sep.join(_enc(x, allow) for x in value))
        elif isinstance(value, dict):
            if not explode:
                joined = ",".join(_enc(k, allow) + "," + _enc(v, allow) for k, v in value.items())
                parts.append(_enc(name, allow) + "=" + joined if named else joined)
            else:
                parts.append(sep.join(
                    _enc(k, allow) + ((ifemp if v == "" else "=" + _enc(v, allow)) if named else "=" + _enc(v, allow))
                    for k, v in value.items()))
        else:
            raise UrlTemplateError("unsupported value type for " + name)
    return first + sep.join(parts) if parts else ""


def expand_template(template: str, variables: dict) -> str:
    """Expand an RFC 6570 template with string, list and ordered-dict variables."""
    out = []
    i = 0
    while i < len(template):
        c = template[i]
        if c == "{":
            j = template.find("}", i)
            if j < 0:
                raise UrlTemplateError("unclosed expression")
            out.append(_expand(template[i + 1:j], variables))
            i = j + 1
        elif c == "}":
            raise UrlTemplateError("stray }")
        elif c == "%" and _TRIPLET.match(template, i):
            out.append(template[i:i + 3])
            i += 3
        else:
            out.append(_enc(c, True))
            i += 1
    return "".join(out)
