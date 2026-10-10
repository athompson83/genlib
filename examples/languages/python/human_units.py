# SPDX-License-Identifier: Apache-2.0
"""Human-readable units: byte sizes (SI and IEC), byte-size parsing, durations and relative times.

All rounding is round-half-up in integer arithmetic, so results never depend on float formatting.
"""
import re

_SI = ("B", "kB", "MB", "GB", "TB", "PB", "EB")
_IEC = ("B", "KiB", "MiB", "GiB", "TiB", "PiB", "EiB")
_PARSE = re.compile(r"\s*([0-9]+)(?:\.([0-9]+))?\s*([A-Za-z]*)\s*", re.ASCII)
_UNITS = {"": 1, "b": 1, "kb": 1000, "mb": 1000**2, "gb": 1000**3, "tb": 1000**4, "pb": 1000**5,
          "eb": 1000**6, "kib": 1024, "mib": 1024**2, "gib": 1024**3, "tib": 1024**4, "pib": 1024**5,
          "eib": 1024**6}
_MAX = 2**63 - 1


def _round_div(n: int, d: int) -> int:
    return (2 * n + d) // (2 * d)


def _int(value, what: str) -> int:
    if isinstance(value, bool) or not isinstance(value, int):
        raise ValueError(f"{what} must be an integer")
    return value


def format_bytes(n: int, base: str = "si", decimals: int = 1) -> str:
    """format_bytes(1536, "iec") == "1.5 KiB"; trailing zeros are dropped."""
    if _int(n, "n") < 0 or not 0 <= _int(decimals, "decimals") <= 3:
        raise ValueError("n must be >= 0 and decimals 0..3")
    if base not in ("si", "iec"):
        raise ValueError("base must be 'si' or 'iec'")
    units, step = (_SI, 1000) if base == "si" else (_IEC, 1024)
    if n < step:
        return f"{n} B"
    i = 1
    while i < 6 and n >= step ** (i + 1):
        i += 1
    scale = 10**decimals
    v = _round_div(n * scale, step**i)
    if v >= step * scale and i < 6:
        i += 1
        v = _round_div(n * scale, step**i)
    whole, frac = divmod(v, scale)
    text = str(whole)
    if decimals:
        text += ("." + str(frac).rjust(decimals, "0")).rstrip("0").rstrip(".")
    return f"{text} {units[i]}"


def parse_bytes(text: str) -> int:
    """"1.5 GiB" -> 1610612736; units are case-insensitive; raises ValueError above 2^63-1."""
    m = _PARSE.fullmatch(text) if isinstance(text, str) else None
    if not m or m.group(3).lower() not in _UNITS:
        raise ValueError(f"invalid byte size: {text!r}")
    frac = m.group(2) or ""
    result = _round_div(int(m.group(1) + frac) * _UNITS[m.group(3).lower()], 10 ** len(frac))
    if result > _MAX:
        raise ValueError("byte size exceeds 2^63-1")
    return result


def format_duration(ms: int) -> str:
    """Two largest non-zero units of d, h, m, s ("1h 2m"); below one second "<ms>ms"."""
    if _int(ms, "ms") < 0:
        raise ValueError("ms must be >= 0")
    if ms < 1000:
        return f"{ms}ms"
    s, parts = ms // 1000, []
    for name, size in (("d", 86400), ("h", 3600), ("m", 60), ("s", 1)):
        q, s = divmod(s, size)
        if q:
            parts.append(f"{q}{name}")
    return " ".join(parts[:2])


def _phrase(a: int):
    if a < 45:
        return None
    if a < 90:
        return "a minute"
    if a < 45 * 60:
        return f"{_round_div(a, 60)} minutes"
    if a < 90 * 60:
        return "an hour"
    if a < 22 * 3600:
        return f"{_round_div(a, 3600)} hours"
    if a < 36 * 3600:
        return "a day"
    if a < 26 * 86400:
        return f"{_round_div(a, 86400)} days"
    if a < 46 * 86400:
        return "a month"
    if a < 320 * 86400:
        return f"{_round_div(a, 2629746)} months"  # average Gregorian month
    if a < 548 * 86400:
        return "a year"
    return f"{_round_div(a, 31556952)} years"  # average Gregorian year


def relative_time(delta_seconds: int) -> str:
    """Positive deltas are in the future ("in 3 hours"), negative in the past ("3 hours ago")."""
    p = _phrase(abs(_int(delta_seconds, "delta_seconds")))
    if p is None:
        return "just now"
    return f"in {p}" if delta_seconds > 0 else f"{p} ago"
