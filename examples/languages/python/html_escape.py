# SPDX-License-Identifier: Apache-2.0
"""HTML escaping for text and quoted attributes, unescaping character references, and tag stripping.

escape_html replaces & < > " ' with &amp; &lt; &gt; &quot; &#39;. unescape_html decodes &#NNN; (1-10
decimal digits) and &#xHHH; (1-8 hex digits, x in either case); the ';' is required. 0, surrogates and
values above U+10FFFF become U+FFFD and 0x80-0x9F map through the HTML5 windows-1252 table. Only a
fixed set of named references is decoded (case-sensitive, ';' required); anything else is left as is.
strip_tags drops <script>/<style> contents, removes tags and unescapes: it produces plain-text
previews and is NOT a sanitizer; never render its output as HTML without escaping it again.
"""

import re

_NAMED = {
    "amp": "&", "lt": "<", "gt": ">", "quot": '"', "apos": "'", "nbsp": "\u00a0", "copy": "\u00a9",
    "reg": "\u00ae", "trade": "\u2122", "hellip": "\u2026", "mdash": "\u2014", "ndash": "\u2013",
    "lsquo": "\u2018", "rsquo": "\u2019", "ldquo": "\u201c", "rdquo": "\u201d", "bull": "\u2022",
    "middot": "\u00b7", "deg": "\u00b0", "plusmn": "\u00b1", "times": "\u00d7", "divide": "\u00f7",
    "euro": "\u20ac", "pound": "\u00a3", "yen": "\u00a5", "cent": "\u00a2", "sect": "\u00a7",
    "para": "\u00b6", "laquo": "\u00ab", "raquo": "\u00bb", "iexcl": "\u00a1", "iquest": "\u00bf",
    "shy": "\u00ad",
}
_C1 = {
    0x80: 0x20AC, 0x82: 0x201A, 0x83: 0x0192, 0x84: 0x201E, 0x85: 0x2026, 0x86: 0x2020, 0x87: 0x2021,
    0x88: 0x02C6, 0x89: 0x2030, 0x8A: 0x0160, 0x8B: 0x2039, 0x8C: 0x0152, 0x8E: 0x017D, 0x91: 0x2018,
    0x92: 0x2019, 0x93: 0x201C, 0x94: 0x201D, 0x95: 0x2022, 0x96: 0x2013, 0x97: 0x2014, 0x98: 0x02DC,
    0x99: 0x2122, 0x9A: 0x0161, 0x9B: 0x203A, 0x9C: 0x0153, 0x9E: 0x017E, 0x9F: 0x0178,
}
_REF = re.compile(r"&(#[xX][0-9A-Fa-f]{1,8}|#[0-9]{1,10}|[A-Za-z][A-Za-z0-9]{0,31});")
_SCRIPT_STYLE = re.compile(r"(?is)<(script|style)\b[^>]*>.*?(</\1\s*>|$)")
_TAG = re.compile(r"<[A-Za-z/!?][^>]*>")


def escape_html(s: str) -> str:
    """Escape & < > " ' for HTML text and single- or double-quoted attribute values."""
    return (s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
            .replace('"', "&quot;").replace("'", "&#39;"))


def _numeric(v: int) -> str:
    if v == 0 or 0xD800 <= v <= 0xDFFF or v > 0x10FFFF:
        return "\ufffd"
    return chr(_C1.get(v, v))


def _replace(m: re.Match) -> str:
    g = m.group(1)
    if g[0] == "#":
        hexadecimal = g[1] in "xX"
        v = int(g[1 + hexadecimal:], 16 if hexadecimal else 10)
        return _numeric(min(v, 0x110000))
    return _NAMED.get(g, m.group(0))


def unescape_html(s: str) -> str:
    """Decode numeric references and the fixed set of named references (';' required)."""
    return _REF.sub(_replace, s)


def strip_tags(s: str) -> str:
    """Plain text from HTML for previews (drops script/style, removes tags, unescapes); NOT a sanitizer."""
    s = _SCRIPT_STYLE.sub("", s)
    s = _TAG.sub("", s)
    return unescape_html(s)
