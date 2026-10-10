# SPDX-License-Identifier: Apache-2.0
"""ETags and conditional requests (RFC 9110 section 13), evaluated in the RFC 13.2.2 order.

evaluate_conditional returns 200 (proceed), 304 (Not Modified) or 412 (Precondition Failed).
Dates are IMF-fixdate only ("Wed, 21 Oct 2026 07:28:00 GMT"); other formats are ignored.
"""
import calendar
import datetime as dt
import re

_ETAG = re.compile(r'(?:W/)?"[\x21\x23-\x7e\x80-\xff]*"')
_DATE = re.compile(r"([A-Z][a-z]{2}), ([0-9]{2}) ([A-Z][a-z]{2}) ([0-9]{4}) ([0-9]{2}):([0-9]{2}):([0-9]{2}) GMT")
DAYS = ("Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun")
MONTHS = ("Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec")


def parse_etags(header: str):
    """Return "*" or the list of valid entity tags in the header (invalid items ignored)."""
    h = header.strip(" \t")
    if h == "*":
        return "*"
    return [p.strip(" \t") for p in h.split(",") if _ETAG.fullmatch(p.strip(" \t"))]


def _opaque(tag: str) -> str:
    return tag[2:] if tag.startswith("W/") else tag


def strong_match(a: str, b: str) -> bool:
    return not a.startswith("W/") and not b.startswith("W/") and a == b


def weak_match(a: str, b: str) -> bool:
    return _opaque(a) == _opaque(b)


def format_http_date(seconds: int) -> str:
    d = dt.datetime.fromtimestamp(seconds, dt.timezone.utc)
    return (f"{DAYS[d.weekday()]}, {d.day:02d} {MONTHS[d.month - 1]} {d.year:04d} "
            f"{d.hour:02d}:{d.minute:02d}:{d.second:02d} GMT")


def parse_http_date(text: str):
    """Unix seconds for an exact IMF-fixdate, else None."""
    m = _DATE.fullmatch(text)
    if not m or m.group(3) not in MONTHS:
        return None
    year, month, day = int(m.group(4)), MONTHS.index(m.group(3)) + 1, int(m.group(2))
    hour, minute, second = int(m.group(5)), int(m.group(6)), int(m.group(7))
    if year < 1 or not 1 <= day <= calendar.monthrange(year, month)[1] or hour > 23 or minute > 59 or second > 59:
        return None
    seconds = calendar.timegm((year, month, day, hour, minute, second, 0, 0, 0))
    if DAYS[dt.date(year, month, day).weekday()] != m.group(1):
        return None
    return seconds


def evaluate_conditional(method, etag=None, last_modified=None, if_match=None, if_none_match=None,
                         if_modified_since=None, if_unmodified_since=None) -> int:
    safe = method in ("GET", "HEAD")
    if if_match is not None:
        tags = parse_etags(if_match)
        if tags == "*":
            if etag is None:
                return 412
        elif etag is None or not any(strong_match(t, etag) for t in tags):
            return 412
    elif if_unmodified_since is not None and last_modified is not None:
        d = parse_http_date(if_unmodified_since)
        if d is not None and last_modified > d:
            return 412
    if if_none_match is not None:
        tags = parse_etags(if_none_match)
        if tags == "*":
            hit = etag is not None
        else:
            hit = etag is not None and any(weak_match(t, etag) for t in tags)
        if hit:
            return 304 if safe else 412
    elif if_modified_since is not None and safe and last_modified is not None:
        d = parse_http_date(if_modified_since)
        if d is not None and last_modified <= d:
            return 304
    return 200
