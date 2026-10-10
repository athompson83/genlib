# SPDX-License-Identifier: Apache-2.0
"""Sanitize untrusted text: normalize newlines, strip control, bidirectional and invisible characters.

find_bidi_controls is the Trojan Source check (CVE-2021-42574). U+200C/U+200D (ZWNJ/ZWJ) are kept
because emoji sequences and Indic/Persian text need them. This is not HTML escaping.
"""
import re

BIDI_CONTROLS = frozenset({0x061C, 0x200E, 0x200F, 0x202A, 0x202B, 0x202C, 0x202D, 0x202E,
                           0x2066, 0x2067, 0x2068, 0x2069})
_INVISIBLE = frozenset({0x200B, 0x2060, 0xFEFF})
_WS = re.compile(r"[ \t\n\r\f\v]+")


def sanitize_text(text: str, allow_newlines: bool = True, max_length=None) -> str:
    if max_length is not None and (isinstance(max_length, bool) or not isinstance(max_length, int) or max_length < 0):
        raise ValueError("max_length must be a non-negative integer")
    out = []
    for c in text.replace("\r\n", "\n").replace("\r", "\n"):
        cp = ord(c)
        if c == "\n":
            out.append("\n" if allow_newlines else " ")
        elif c == "\t":
            out.append(c)
        elif cp < 0x20 or 0x7F <= cp <= 0x9F or cp in BIDI_CONTROLS or cp in _INVISIBLE:
            continue
        else:
            out.append(c)
    if max_length is not None:
        out = out[:max_length]
    return "".join(out)


def find_bidi_controls(text: str) -> list:
    """[[code point index, "XXXX" uppercase hex], ...] for every bidirectional control."""
    return [[i, format(ord(c), "04X")] for i, c in enumerate(text) if ord(c) in BIDI_CONTROLS]


def normalize_whitespace(text: str) -> str:
    """Collapse runs of space, tab, LF, CR, FF and VT into one space and trim spaces."""
    return _WS.sub(" ", text).strip(" ")
