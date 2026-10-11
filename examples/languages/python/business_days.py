# SPDX-License-Identifier: Apache-2.0
"""Business days over ISO dates (YYYY-MM-DD), proleptic Gregorian, configurable weekend and holidays.

Weekend days are MO..SU codes (default SA, SU) and cannot cover all seven days.
"""
import datetime as dt
import re
from collections.abc import Iterable

WEEKDAYS = ("MO", "TU", "WE", "TH", "FR", "SA", "SU")
MAX_STEPS = 100000
_ISO = re.compile(r"[0-9]{4}-[0-9]{2}-[0-9]{2}")


def _date(text: str) -> dt.date:
    if not isinstance(text, str) or not _ISO.fullmatch(text):
        raise ValueError("date must be YYYY-MM-DD")
    try:
        return dt.date.fromisoformat(text)
    except ValueError:
        raise ValueError(f"invalid date: {text!r}") from None


def _config(holidays: Iterable[str], weekend: Iterable[str]) -> tuple[set[dt.date], set[int]]:
    days = set()
    for code in weekend:
        if code not in WEEKDAYS:
            raise ValueError("weekend days are MO..SU")
        days.add(WEEKDAYS.index(code))
    if len(days) == 7:
        raise ValueError("weekend cannot be every day")
    return {_date(h) for h in holidays}, days


def is_business_day(date: str, holidays: Iterable[str] = (), weekend: Iterable[str] = ("SA", "SU")) -> bool:
    """True when date is neither a weekend day nor a holiday."""
    hol, wk = _config(holidays, weekend)
    d = _date(date)
    return d.weekday() not in wk and d not in hol


def add_business_days(date: str, n: int, holidays: Iterable[str] = (), weekend: Iterable[str] = ("SA", "SU")) -> str:
    """The date n business days after date (before when n < 0); n = 0 rolls forward to a business day."""
    if isinstance(n, bool) or not isinstance(n, int) or abs(n) > MAX_STEPS:
        raise ValueError(f"n must be an integer within +-{MAX_STEPS}")
    hol, wk = _config(holidays, weekend)
    d = _date(date)

    def ok(x: dt.date) -> bool:
        return x.weekday() not in wk and x not in hol

    if n == 0:
        while not ok(d):
            d += dt.timedelta(days=1)
        return d.isoformat()
    step = dt.timedelta(days=1 if n > 0 else -1)
    left = abs(n)
    while left:
        d += step
        if ok(d):
            left -= 1
    return d.isoformat()


def business_days_between(start: str, end: str, holidays: Iterable[str] = (), weekend: Iterable[str] = ("SA", "SU")) -> int:
    """Business days in [start, end) (start counted, end not); negative when end is before start."""
    hol, wk = _config(holidays, weekend)
    a, b = _date(start), _date(end)
    sign = 1
    if b < a:
        a, b, sign = b, a, -1
    full, rem = divmod((b - a).days, 7)
    count = full * (7 - len(wk))
    for i in range(rem):
        if (a + dt.timedelta(days=full * 7 + i)).weekday() not in wk:
            count += 1
    count -= sum(1 for h in hol if a <= h < b and h.weekday() not in wk)
    return sign * count
