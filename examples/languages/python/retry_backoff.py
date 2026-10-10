# SPDX-License-Identifier: Apache-2.0
"""Retry delays: exponential backoff with full jitter, and Retry-After header parsing.

Pure functions; the caller injects the random fraction and the current time.
"""
from email.utils import parsedate_to_datetime
import re

_SECONDS = re.compile(r"[0-9]+")
_IMF_FIXDATE = re.compile(r"(Mon|Tue|Wed|Thu|Fri|Sat|Sun), [0-9]{2} "
                          r"(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) [0-9]{4} "
                          r"[0-9]{2}:[0-9]{2}:[0-9]{2} GMT")


def _int(value: object, name: str) -> int:
    if isinstance(value, bool) or not isinstance(value, int):
        raise TypeError(f"{name} must be an integer")
    return value


def backoff_delay(attempt: int, base_ms: int, cap_ms: int, random_fraction: float) -> int:
    """floor(random_fraction * min(cap_ms, base_ms * 2**attempt)) ("full jitter")."""
    if _int(attempt, "attempt") < 0:
        raise ValueError("attempt must be >= 0")
    if _int(base_ms, "base_ms") <= 0:
        raise ValueError("base_ms must be > 0")
    if _int(cap_ms, "cap_ms") < base_ms:
        raise ValueError("cap_ms must be >= base_ms")
    if isinstance(random_fraction, bool) or not isinstance(random_fraction, (int, float)) \
            or not 0 <= random_fraction < 1:
        raise ValueError("random_fraction must be in [0, 1)")
    # Cap before multiplying so huge attempts never build huge numbers.
    ceiling = cap_ms if attempt >= cap_ms.bit_length() else min(cap_ms, base_ms << attempt)
    return int(random_fraction * ceiling)


def retry_after_ms(header_value: str, now_ms: int) -> int:
    """Delay in ms from a Retry-After value: delta-seconds or an IMF-fixdate (never negative).

    Raises ValueError for any other value.
    """
    _int(now_ms, "now_ms")
    if not isinstance(header_value, str):
        raise ValueError("Retry-After must be a string")
    value = header_value.strip()
    if _SECONDS.fullmatch(value):
        return int(value) * 1000
    if _IMF_FIXDATE.fullmatch(value):
        try:
            when = parsedate_to_datetime(value)
        except (TypeError, ValueError) as error:
            raise ValueError("Retry-After date is invalid") from error
        if when.strftime("%a, %d %b %Y %H:%M:%S GMT") != value:
            raise ValueError("Retry-After date is invalid")
        return max(0, int(when.timestamp()) * 1000 - now_ms)
    raise ValueError("Retry-After must be delta-seconds or an IMF-fixdate")
