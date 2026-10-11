# SPDX-License-Identifier: Apache-2.0
"""ISO 8601 week dates: weeks start on Monday and week 1 contains the year's first Thursday.

Dates are proleptic Gregorian years 1..9999, computed with plain day-number arithmetic. Weekday is
1 (Monday) .. 7 (Sunday). Invalid dates and out-of-range weeks raise IsoWeekError.
"""
import datetime
import re


class IsoWeekError(ValueError):
    """Raised for an invalid calendar date or ISO week date."""


_PATTERN = re.compile(r"([0-9]{4})-?W([0-9]{2})(?:-?([1-7]))?")


def _ordinal(y: int, m: int, d: int) -> int:
    try:
        return datetime.date(y, m, d).toordinal()
    except (ValueError, TypeError, OverflowError) as e:
        raise IsoWeekError(f"invalid date: {e}") from None


def iso_week(year: int, month: int, day: int) -> tuple[int, int, int]:
    """(week_year, week, weekday) for a calendar date."""
    o = _ordinal(year, month, day)
    wd = (o - 1) % 7 + 1  # ordinal 1 (0001-01-01) is a Monday
    thursday = o + 4 - wd
    wy = datetime.date.fromordinal(thursday).year
    return (wy, (thursday - _ordinal(wy, 1, 1)) // 7 + 1, wd)


def weeks_in_year(year: int) -> int:
    """52 or 53: the number of ISO weeks in the given week-numbering year."""
    return iso_week(year, 12, 28)[1]


def from_iso_week(week_year: int, week: int, weekday: int) -> tuple[int, int, int]:
    """(year, month, day) for an ISO week date; week must be 1..weeks_in_year and weekday 1..7."""
    if not (1 <= week_year <= 9999) or not (1 <= weekday <= 7) or not (1 <= week <= weeks_in_year(week_year)):
        raise IsoWeekError("invalid ISO week date")
    jan4 = _ordinal(week_year, 1, 4)
    o = jan4 - (jan4 - 1) % 7 + (week - 1) * 7 + weekday - 1
    try:
        d = datetime.date.fromordinal(o)
    except (ValueError, OverflowError):
        raise IsoWeekError("ISO week date is outside years 1..9999") from None
    return (d.year, d.month, d.day)


def format_iso_week(year: int, month: int, day: int) -> str:
    """'YYYY-Www-D' for a calendar date."""
    a, b, c = iso_week(year, month, day)
    return f"{a:04d}-W{b:02d}-{c}"


def parse_iso_week(s: str) -> tuple[int, int, int]:
    """(year, month, day) for 'YYYY-Www-D', 'YYYYWwwD' or 'YYYY-Www' (weekday 1)."""
    m = _PATTERN.fullmatch(s)
    if not m:
        raise IsoWeekError("not an ISO week date")
    return from_iso_week(int(m.group(1)), int(m.group(2)), int(m.group(3) or 1))
