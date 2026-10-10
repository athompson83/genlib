# SPDX-License-Identifier: Apache-2.0
"""Deterministic feature-flag evaluation: kill switch, deny/allow lists, percentage rollout, variants.

The same flag and user id always give the same answer, and raising rolloutPercent only adds users
(a user's bucket never changes). Flags are not authorization: enforce permissions separately.
Flag mappings use the shared JSON keys: key, enabled, allow, deny, rolloutPercent, variants.
"""
import re
from collections.abc import Mapping

from hashing import fnv1a32

_KEY = re.compile(r"[A-Za-z0-9._-]{1,100}")


def _validate(flag: Mapping):
    key = flag.get("key")
    if not isinstance(key, str) or not _KEY.fullmatch(key):
        raise ValueError("flag key must match [A-Za-z0-9._-]{1,100}")
    pct = flag.get("rolloutPercent", 100)
    if isinstance(pct, bool) or not isinstance(pct, (int, float)) or not 0 <= pct <= 100 \
            or round(pct * 100) != pct * 100:
        raise ValueError("rolloutPercent must be 0..100 with at most 2 decimals")
    variants = flag.get("variants") or []
    for v in variants:
        w = v.get("weight")
        if isinstance(w, bool) or not isinstance(w, int) or w < 1 or not isinstance(v.get("name"), str) \
                or not v["name"]:
            raise ValueError("variants need a non-empty name and a positive integer weight")
    return key, round(pct * 100), variants


def evaluate_flag(flag: Mapping, user_id: str) -> dict:
    """Return {"on", "reason", "bucket", "variant"}; reason is disabled, deny, allow, rollout or excluded."""
    key, threshold, variants = _validate(flag)
    bucket = fnv1a32(f"{key}:{user_id}".encode()) % 10000

    def result(on: bool, reason: str) -> dict:
        variant = None
        if on and variants:
            x = fnv1a32(f"{key}:variant:{user_id}".encode()) % sum(v["weight"] for v in variants)
            for v in variants:
                if x < v["weight"]:
                    variant = v["name"]
                    break
                x -= v["weight"]
        return {"on": on, "reason": reason, "bucket": bucket, "variant": variant}

    if not flag.get("enabled", True):
        return result(False, "disabled")
    if user_id in (flag.get("deny") or []):
        return result(False, "deny")
    if user_id in (flag.get("allow") or []):
        return result(True, "allow")
    if bucket < threshold:
        return result(True, "rollout")
    return result(False, "excluded")
