# SPDX-License-Identifier: Apache-2.0
"""Masking personal data for logs and UIs (display masking, not anonymization or tokenization).

mask_email keeps the first code point of the local part and the domain ('j*******@example.com', at
least three '*'). mask_phone keeps the last 4 ASCII digits and a leading '+<1-3 digits> ' country
code. mask_card keeps the last 4 of 12-19 digits and the separators. mask_middle keeps code points at
each end. redact replaces emails and Luhn-valid 13-19 digit card numbers (optionally separated by
single spaces or hyphens, not touching other digits) in free text; phones are not detected there.
"""

import re


class PiiError(ValueError):
    """Raised when the input is not the expected kind of value or the arguments are invalid."""


_PHONE_PREFIX = re.compile(r"\+(\d{1,3}) ")
_EMAIL = re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}")
_CARD = re.compile(r"(?<![0-9])[0-9](?:[ -]?[0-9]){12,18}(?![0-9])")


def _is_ascii_digit(c: str) -> bool:
    return "0" <= c <= "9"


def mask_email(email: str) -> str:
    """Mask the local part of an email address except its first code point."""
    if email.count("@") != 1:
        raise PiiError("not an email address")
    local, domain = email.split("@")
    if not local or not domain:
        raise PiiError("not an email address")
    return local[0] + "*" * max(3, len(local) - 1) + "@" + domain


def mask_phone(phone: str) -> str:
    """Mask every ASCII digit except the last 4 and a leading '+NN ' country code."""
    total = sum(1 for c in phone if _is_ascii_digit(c))
    if total < 7:
        raise PiiError("not a phone number")
    m = _PHONE_PREFIX.match(phone)
    keep_front = len(m.group(1)) if m else 0
    out = []
    seen = 0
    for c in phone:
        if _is_ascii_digit(c):
            out.append(c if seen < keep_front or seen >= total - 4 else "*")
            seen += 1
        else:
            out.append(c)
    return "".join(out)


def mask_card(card: str) -> str:
    """Mask all but the last 4 digits of a 12-19 digit card number, keeping spaces and hyphens."""
    if not re.fullmatch(r"[0-9 -]+", card):
        raise PiiError("not a card number")
    total = sum(1 for c in card if _is_ascii_digit(c))
    if not 12 <= total <= 19:
        raise PiiError("not a card number")
    out = []
    seen = 0
    for c in card:
        if _is_ascii_digit(c):
            out.append(c if seen >= total - 4 else "*")
            seen += 1
        else:
            out.append(c)
    return "".join(out)


def mask_middle(s: str, keep_start: int = 1, keep_end: int = 1, mask: str = "*") -> str:
    """Keep keep_start and keep_end code points and mask the rest (everything when too short)."""
    if keep_start < 0 or keep_end < 0 or len(mask) != 1:
        raise PiiError("bad arguments")
    if len(s) <= keep_start + keep_end:
        return mask * len(s)
    return s[:keep_start] + mask * (len(s) - keep_start - keep_end) + (s[len(s) - keep_end:] if keep_end else "")


def _luhn(digits: str) -> bool:
    total = 0
    for i, ch in enumerate(reversed(digits)):
        n = int(ch)
        if i % 2:
            n = n * 2 - 9 if n * 2 > 9 else n * 2
        total += n
    return total % 10 == 0


def _mask_card_match(m: re.Match) -> str:
    run = m.group(0)
    return mask_card(run) if _luhn(re.sub(r"[ -]", "", run)) else run


def redact(text: str, kinds: tuple = ("email", "card")) -> str:
    """Mask emails and Luhn-valid card numbers found in free text."""
    for k in kinds:
        if k not in ("email", "card"):
            raise PiiError("unsupported kind")
    if "card" in kinds:
        text = _CARD.sub(_mask_card_match, text)
    if "email" in kinds:
        text = _EMAIL.sub(lambda m: mask_email(m.group(0)), text)
    return text
