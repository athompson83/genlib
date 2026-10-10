# SPDX-License-Identifier: Apache-2.0
"""NIST SP 800-63B style password checks without composition rules.

Use a large breached-password list as the blocklist, allow every printable character including
spaces and emoji, never truncate passwords, and rate-limit attempts. Store only a slow hash
(Argon2id, scrypt or bcrypt) on the server. Lengths count Unicode code points.
"""

FAILURE_ORDER = ("too-short", "too-long", "control-characters", "blocklisted", "contains-context", "repetitive")
_ALNUM = "0123456789abcdefghijklmnopqrstuvwxyz"


def _lower(text: str) -> str:
    return "".join(chr(ord(c) + 32) if "A" <= c <= "Z" else c for c in text)


def _is_control(cp: int) -> bool:
    return cp < 0x20 or 0x7F <= cp <= 0x9F


def _repetitive(pw: str) -> bool:
    for i in range(len(pw) - 3):
        window = pw[i:i + 4]
        if len(set(window)) == 1:
            return True
        low = _lower(window)
        if all(c in _ALNUM for c in low) and (low in _ALNUM or low[::-1] in _ALNUM):
            return True
    return False


def check_password(password: str, min_length: int = 15, max_length: int = 64, blocklist=(), context=()) -> dict:
    """Return {"ok": bool, "failures": [...]} with failures in FAILURE_ORDER."""
    if min_length < 1 or max_length < min_length:
        raise ValueError("need 1 <= min_length <= max_length")
    failures = []
    if len(password) < min_length:
        failures.append("too-short")
    if len(password) > max_length:
        failures.append("too-long")
    if any(_is_control(ord(c)) for c in password):
        failures.append("control-characters")
    low = _lower(password)
    if any(low == _lower(entry) for entry in blocklist):
        failures.append("blocklisted")
    if any(len(item) >= 4 and _lower(item) in low for item in context):
        failures.append("contains-context")
    if _repetitive(password):
        failures.append("repetitive")
    return {"ok": not failures, "failures": failures}
