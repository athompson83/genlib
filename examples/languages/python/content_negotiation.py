# SPDX-License-Identifier: Apache-2.0
"""Accept and Accept-Language negotiation (RFC 9110 q-values, RFC 4647 basic filtering)."""
import re

_Q = re.compile(r"0(\.[0-9]{0,3})?|1(\.0{0,3})?")
_TOKEN = r"[!#$%&'*+.^_`|~0-9a-z-]+"
_MEDIA = re.compile(_TOKEN + "/" + _TOKEN)
_LANG = re.compile(r"\*|[a-z]{1,8}(-[a-z0-9]{1,8})*")


def parse_quality_list(header: str) -> "list[tuple[str, float]]":
    """Return [(lowercased value, q)] skipping empty items and items with an invalid q."""
    items = []
    for part in header.split(","):
        part = part.strip(" \t")
        if not part:
            continue
        bits = [b.strip(" \t") for b in part.split(";")]
        q, ok = 1.0, True
        for param in bits[1:]:
            k, _, v = param.partition("=")
            if k.strip(" \t").lower() == "q":
                v = v.strip(" \t")
                if not _Q.fullmatch(v):
                    ok = False
                    break
                q = float(v)
        if ok:
            items.append((bits[0].lower(), q))
    return items


def _pick(available, ranges, specificity):
    best, best_q = None, 0.0
    for a in available:
        match = None
        for r, q in ranges:
            s = specificity(r, a.lower())
            if s and (match is None or s > match[0]):
                match = (s, q)
        if match and match[1] > best_q:
            best, best_q = a, match[1]
    return best


def _media_spec(r, a):
    rt, rs = r.split("/")
    t, _, s = a.partition("/")
    if (rt, rs) == (t, s):
        return 3
    if rt == t and rs == "*":
        return 2
    return 1 if (rt, rs) == ("*", "*") else 0


def _lang_spec(r, tag):
    if r == "*":
        return 1
    return 2 + r.count("-") if tag == r or tag.startswith(r + "-") else 0


def negotiate_media_type(accept, available):
    """Best available media type for an Accept header, or None; a missing/blank header picks the first."""
    if accept is None or accept.strip() == "":
        return available[0] if available else None
    ranges = [(r, q) for r, q in parse_quality_list(accept) if _MEDIA.fullmatch(r)]
    return _pick(available, ranges, _media_spec)


def negotiate_language(accept_language, available):
    """Best available language tag (original case) for Accept-Language, or None."""
    if accept_language is None or accept_language.strip() == "":
        return available[0] if available else None
    ranges = [(r, q) for r, q in parse_quality_list(accept_language) if _LANG.fullmatch(r)]
    return _pick(available, ranges, _lang_spec)
