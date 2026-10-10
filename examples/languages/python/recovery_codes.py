# SPDX-License-Identifier: Apache-2.0
"""MFA recovery (backup) codes: generate, normalize, keyed hash and lookup.

Show codes once, store only HMAC-SHA256 hashes keyed with a server-side secret ("pepper")
kept outside the database, delete a hash after use, rate-limit attempts and notify the user.
"""
import hashlib
import hmac
import secrets

#: Crockford base32 without I, L, O, U.
RECOVERY_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"
_FOLD = str.maketrans({"O": "0", "I": "1", "L": "1", " ": None, "-": None,
                       "\t": None, "\n": None, "\r": None})


def _shape(groups: int, group_length: int) -> int:
    for name, value, low, high in (("groups", groups, 1, 8), ("group_length", group_length, 2, 16)):
        if isinstance(value, bool) or not isinstance(value, int) or not low <= value <= high:
            raise ValueError(f"{name} must be an integer from {low} to {high}")
    return groups * group_length


def generate_recovery_codes(count: int = 10, groups: int = 2, group_length: int = 5) -> list[str]:
    """Unique codes such as "7K3QX-9MNP2"; secrets.choice selects symbols without bias."""
    total = _shape(groups, group_length)
    if isinstance(count, bool) or not isinstance(count, int) or not 1 <= count <= 100:
        raise ValueError("count must be an integer from 1 to 100")
    if total < 8:
        raise ValueError("codes must have at least 8 symbols (40 bits)")
    codes: dict[str, None] = {}
    while len(codes) < count:
        symbols = "".join(secrets.choice(RECOVERY_ALPHABET) for _ in range(total))
        codes["-".join(symbols[i:i + group_length] for i in range(0, total, group_length))] = None
    return list(codes)


def normalize_recovery_code(value: str, groups: int = 2, group_length: int = 5) -> str:
    """Uppercase, drop spaces/hyphens, map O->0 and I/L->1; raise ValueError otherwise."""
    total = _shape(groups, group_length)
    code = value.upper().translate(_FOLD)
    for ch in code:
        if ch not in RECOVERY_ALPHABET:
            raise ValueError(f"invalid recovery code character: {ch!r}")
    if len(code) != total:
        raise ValueError(f"recovery code must have {total} characters")
    return code


def hash_recovery_code(code: str, key: bytes, groups: int = 2, group_length: int = 5) -> str:
    """Lowercase hex HMAC-SHA256(key, normalized code)."""
    if not key:
        raise TypeError("key is required")
    normalized = normalize_recovery_code(code, groups, group_length)
    return hmac.new(bytes(key), normalized.encode("ascii"), hashlib.sha256).hexdigest()


def find_recovery_code(value: str, stored_hashes: list[str], key: bytes,
                       groups: int = 2, group_length: int = 5) -> int | None:
    """Index of the matching stored hash, or None (also for malformed input).

    Every stored hash is compared in constant time without exiting early.
    """
    _shape(groups, group_length)
    try:
        digest = hash_recovery_code(value, key, groups, group_length).encode()
    except ValueError:
        return None
    found = None
    for index, stored in enumerate(stored_hashes):
        if hmac.compare_digest(stored.lower().encode(), digest) and found is None:
            found = index
    return found
