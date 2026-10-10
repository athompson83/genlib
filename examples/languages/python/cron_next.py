# SPDX-License-Identifier: Apache-2.0
"""Next run time for a standard five-field cron expression, evaluated in UTC.

Fields: minute hour day-of-month month day-of-week (0 and 7 are Sunday). Each field is a
comma list of "*", "N" or "A-B" with an optional "/step" ("N/step" runs from N to the
maximum). Names, seconds and the "?", "L" and "W" extensions are not supported. As in
Vixie cron, when both day fields are restricted a day matches if either one matches.
"""
import re
from datetime import datetime, timedelta, timezone

_FIELDS = (("minute", 0, 59), ("hour", 0, 23), ("day-of-month", 1, 31), ("month", 1, 12),
           ("day-of-week", 0, 7))
_ITEM = re.compile(r"(\*|[0-9]{1,2}(?:-[0-9]{1,2})?)(?:/([0-9]{1,2}))?")
_ISO = re.compile(r"([0-9]{4})-([0-9]{2})-([0-9]{2})T([0-9]{2}):([0-9]{2})(?::([0-9]{2})(?:\.[0-9]+)?)?Z")
SEARCH_YEARS = 5


def _parse_field(text: str, name: str, low: int, high: int) -> frozenset:
    values = set()
    for item in text.split(","):
        match = _ITEM.fullmatch(item)
        if not match:
            raise ValueError(f"invalid {name} field: {text!r}")
        span, step_text = match.groups()
        step = int(step_text) if step_text else 1
        if step < 1:
            raise ValueError(f"{name} step must be >= 1")
        if span == "*":
            start, end = low, high
        elif "-" in span:
            start, end = (int(x) for x in span.split("-"))
        else:
            start = int(span)
            end = high if step_text else start
        if not low <= start <= high or not low <= end <= high or start > end:
            raise ValueError(f"{name} value out of range {low}-{high}: {item!r}")
        values.update(range(start, end + 1, step))
    return frozenset(values)


def parse_cron(expression: str) -> tuple:
    if not isinstance(expression, str):
        raise ValueError("cron expression must be a string")
    parts = expression.split()
    if len(parts) != 5:
        raise ValueError("cron expression must have exactly 5 fields")
    sets = [_parse_field(part, *spec) for part, spec in zip(parts, _FIELDS)]
    dow = frozenset(0 if d == 7 else d for d in sets[4])
    return sets[0], sets[1], sets[2], sets[3], dow, not parts[2].startswith("*"), not parts[4].startswith("*")


def _parse_after(text: str) -> datetime:
    match = _ISO.fullmatch(text) if isinstance(text, str) else None
    if not match:
        raise ValueError("after must be an ISO 8601 UTC time like 2026-10-10T12:00:00Z")
    y, mo, d, h, mi = (int(g) for g in match.groups()[:5])
    s = int(match.group(6) or 0)
    if s > 59:
        raise ValueError("after has an invalid second")
    return datetime(y, mo, d, h, mi, tzinfo=timezone.utc)  # raises ValueError for invalid dates


def next_run(expression: str, after_iso_utc: str) -> str:
    """First matching minute strictly after the given time, as YYYY-MM-DDTHH:MM:00Z."""
    minutes, hours, doms, months, dows, dom_restricted, dow_restricted = parse_cron(expression)
    start = _parse_after(after_iso_utc)
    t = start + timedelta(minutes=1)
    limit = start.replace(year=start.year + SEARCH_YEARS, day=min(start.day, 28))
    while t <= limit:
        if t.month not in months:
            t = (t.replace(day=1, hour=0, minute=0) + timedelta(days=32)).replace(day=1)
            continue
        dom_ok, dow_ok = t.day in doms, (t.weekday() + 1) % 7 in dows
        day_ok = (dom_ok or dow_ok) if dom_restricted and dow_restricted else (dom_ok and dow_ok)
        if not day_ok:
            t = t.replace(hour=0, minute=0) + timedelta(days=1)
            continue
        if t.hour not in hours:
            t = t.replace(minute=0) + timedelta(hours=1)
            continue
        if t.minute not in minutes:
            t += timedelta(minutes=1)
            continue
        return t.strftime("%Y-%m-%dT%H:%M:00Z")
    raise ValueError(f"no run within {SEARCH_YEARS} years")
