# SPDX-License-Identifier: Apache-2.0
"""Check digits: Luhn (cards), IBAN (ISO 13616 mod 97), GTIN/EAN/UPC and ISBN-10/13.

Validators return False for any malformed input instead of raising. A valid check digit only
proves the number was typed correctly; it does not prove an account, card or product exists.
"""
import re

_IBAN = re.compile(r"[A-Z]{2}[0-9]{2}[A-Z0-9]{11,30}")
_ISBN10 = re.compile(r"[0-9]{9}[0-9X]")


def _strip(s: str) -> str:
    return s.replace(" ", "").replace("-", "")


def _ascii_digits(s: str) -> bool:
    return s != "" and all("0" <= c <= "9" for c in s)


def luhn_valid(s: str) -> bool:
    if not isinstance(s, str):
        return False
    t = _strip(s)
    if len(t) < 2 or not _ascii_digits(t):
        return False
    total = 0
    for i, ch in enumerate(reversed(t)):
        d = ord(ch) - 48
        if i % 2 == 1:
            d *= 2
            if d > 9:
                d -= 9
        total += d
    return total % 10 == 0


def luhn_check_digit(payload: str) -> str:
    """Returns the one-character digit that makes payload + digit pass the Luhn check."""
    if not isinstance(payload, str):
        raise TypeError("payload must be a string")
    t = _strip(payload)
    if not _ascii_digits(t):
        raise ValueError("payload must contain only ASCII digits, spaces or hyphens")
    for d in "0123456789":
        if luhn_valid(t + d):
            return d
    raise AssertionError("unreachable")


def _iban_compact(s: str) -> str:
    return s.replace(" ", "").upper()


def iban_valid(s: str) -> bool:
    if not isinstance(s, str):
        return False
    t = _iban_compact(s)
    if not t.isascii() or not _IBAN.fullmatch(t):
        return False
    rem = 0
    for ch in t[4:] + t[:4]:
        if "0" <= ch <= "9":
            rem = (rem * 10 + ord(ch) - 48) % 97
        else:
            rem = (rem * 100 + ord(ch) - 55) % 97
    return rem == 1


def iban_format(s: str) -> str:
    """Valid IBAN as uppercase groups of four separated by single spaces."""
    if not iban_valid(s):
        raise ValueError("invalid IBAN")
    t = _iban_compact(s)
    return " ".join(t[i:i + 4] for i in range(0, len(t), 4))


def gtin_valid(s: str) -> bool:
    """GTIN-8/12/13/14 (EAN-8, UPC-A, EAN-13, ITF-14)."""
    if not isinstance(s, str):
        return False
    t = _strip(s)
    if len(t) not in (8, 12, 13, 14) or not _ascii_digits(t):
        return False
    total = sum((ord(c) - 48) * (3 if i % 2 == 1 else 1) for i, c in enumerate(reversed(t)))
    return total % 10 == 0


def isbn10_valid(s: str) -> bool:
    if not isinstance(s, str):
        return False
    t = _strip(s).upper()
    if not t.isascii() or not _ISBN10.fullmatch(t):
        return False
    return sum((10 - i) * (10 if c == "X" else ord(c) - 48) for i, c in enumerate(t)) % 11 == 0


def isbn13_valid(s: str) -> bool:
    if not isinstance(s, str):
        return False
    t = _strip(s)
    return len(t) == 13 and t[:3] in ("978", "979") and gtin_valid(t)


def isbn10_to_13(s: str) -> str:
    if not isbn10_valid(s):
        raise ValueError("invalid ISBN-10")
    body = "978" + _strip(s)[:9]
    for d in "0123456789":
        if gtin_valid(body + d):
            return body + d
    raise AssertionError("unreachable")
