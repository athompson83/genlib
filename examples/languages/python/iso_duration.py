# SPDX-License-Identifier: Apache-2.0
"""ISO 8601 durations: parse "P1Y2M3DT4H5M6.5S", exact length in milliseconds and formatting.

Years and months have no fixed length, so duration_milliseconds refuses them; add those to a
calendar date instead. Weeks are 7 days and days are 24 hours (no DST adjustment).
"""
import re
from typing import TypedDict

_DUR = re.compile(r"P(?:([0-9]+)Y)?(?:([0-9]+)M)?(?:([0-9]+)W)?(?:([0-9]+)D)?"
                  r"(?:T(?:([0-9]+)H)?(?:([0-9]+)M)?(?:([0-9]+)(?:\.([0-9]{1,3}))?S)?)?")
_MAX_I64 = (1 << 63) - 1


class Duration(TypedDict):
    years: int
    months: int
    weeks: int
    days: int
    hours: int
    minutes: int
    milliseconds: int


def parse_duration(s: str) -> Duration:
    if not isinstance(s, str) or not s.isascii():
        raise ValueError("invalid ISO 8601 duration")
    m = _DUR.fullmatch(s)
    if not m or s.endswith("T"):
        raise ValueError(f"invalid ISO 8601 duration: {s!r}")
    y, mo, w, d, h, mi, sec, frac = m.groups()
    if all(g is None for g in (y, mo, w, d, h, mi, sec)):
        raise ValueError(f"ISO 8601 duration needs at least one component: {s!r}")
    ms = (int(sec) * 1000 if sec else 0) + (int(frac.ljust(3, "0")) if frac else 0)
    out: Duration = {"years": int(y or 0), "months": int(mo or 0), "weeks": int(w or 0), "days": int(d or 0),
                     "hours": int(h or 0), "minutes": int(mi or 0), "milliseconds": ms}
    if any(v > _MAX_I64 for v in out.values()):
        raise ValueError("duration component exceeds 64-bit range")
    return out


def duration_milliseconds(parsed: Duration) -> int:
    if parsed["years"] or parsed["months"]:
        raise ValueError("years and months have no exact length; apply them to a calendar date")
    total = ((((parsed["weeks"] * 7 + parsed["days"]) * 24 + parsed["hours"]) * 60 + parsed["minutes"]) * 60) * 1000 \
        + parsed["milliseconds"]
    if total > _MAX_I64:
        raise ValueError("duration exceeds 64-bit milliseconds")
    return total


def format_duration(ms: int) -> str:
    """Days, hours, minutes and seconds (up to 3 fractional digits); 0 -> "PT0S"."""
    if isinstance(ms, bool) or not isinstance(ms, int) or ms < 0:
        raise ValueError("milliseconds must be a non-negative integer")
    days, r = divmod(ms, 86_400_000)
    hours, r = divmod(r, 3_600_000)
    minutes, r = divmod(r, 60_000)
    seconds, frac = divmod(r, 1000)
    time = (f"{hours}H" if hours else "") + (f"{minutes}M" if minutes else "")
    if seconds or frac:
        time += str(seconds) + (("." + f"{frac:03d}".rstrip("0")) if frac else "") + "S"
    out = "P" + (f"{days}D" if days else "") + ("T" + time if time else "")
    return out if out != "P" else "PT0S"
