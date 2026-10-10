# SPDX-License-Identifier: Apache-2.0
"""Password hashing: Argon2id via argon2-cffi, with a bcrypt fallback reader.

Parameters follow the OWASP Password Storage Cheat Sheet minimum for Argon2id:
m=19456 KiB (19 MiB), t=2, p=1. Raise memory/time when your servers allow.
Hashes are self-describing PHC strings ($argon2id$v=19$m=...,t=...,p=...$salt$hash).
"""
from __future__ import annotations

import argon2
from argon2.exceptions import InvalidHashError, VerificationError, VerifyMismatchError

HASHER = argon2.PasswordHasher(
    time_cost=2, memory_cost=19456, parallelism=1, hash_len=32, salt_len=16,
    type=argon2.Type.ID,
)


def hash_password(password: str) -> str:
    return HASHER.hash(password)


def verify_password(stored_hash: str, password: str) -> tuple[bool, str | None]:
    """Return (ok, replacement_hash). Persist replacement_hash when it is not None.

    A replacement is produced after a successful check when the stored hash is
    bcrypt (legacy) or Argon2 with parameters weaker/different from HASHER.
    """
    if stored_hash.startswith(("$2a$", "$2b$", "$2y$")):
        import bcrypt  # optional legacy dependency

        # bcrypt only uses the first 72 bytes; this is a reader for legacy rows.
        ok = bcrypt.checkpw(password.encode(), stored_hash.encode())
        return (True, hash_password(password)) if ok else (False, None)
    try:
        HASHER.verify(stored_hash, password)
    except (VerifyMismatchError, VerificationError, InvalidHashError):
        return False, None
    if HASHER.check_needs_rehash(stored_hash):
        return True, hash_password(password)
    return True, None


def bcrypt_hash(password: str, cost: int = 12) -> str:
    """Fallback for platforms without Argon2 (OWASP: cost >= 10, 72-byte limit)."""
    import bcrypt

    if len(password.encode()) > 72:
        raise ValueError("bcrypt truncates input over 72 bytes; refuse or pre-hash deliberately")
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt(rounds=cost)).decode()
