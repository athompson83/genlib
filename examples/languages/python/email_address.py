# SPDX-License-Identifier: Apache-2.0
"""WHATWG HTML "valid e-mail address" syntax check (what <input type=email> accepts).

Syntax only: it accepts forms such as "a@b" and "user.@example.com" exactly as browsers do and
rejects non-ASCII addresses. It cannot tell whether a mailbox exists or belongs to the user;
confirm ownership by sending a confirmation email with a single-use link.
"""
import re

_LABEL = r"[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?"
_EMAIL = re.compile(r"[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@" + _LABEL + r"(?:\." + _LABEL + r")*", re.ASCII)
_ASCII_WS = " \t\n\f\r"


def email_valid(s: str) -> bool:
    if not isinstance(s, str) or len(s) > 254 or not s.isascii():
        return False
    if not _EMAIL.fullmatch(s):
        return False
    return len(s.split("@", 1)[0]) <= 64


def email_normalize(s: str) -> str:
    """Trims ASCII whitespace, validates and lowercases the domain; the local part keeps its case."""
    if not isinstance(s, str):
        raise TypeError("email must be a string")
    t = s.strip(_ASCII_WS)
    if not email_valid(t):
        raise ValueError("invalid email address")
    local, domain = t.split("@", 1)
    return local + "@" + domain.lower()
