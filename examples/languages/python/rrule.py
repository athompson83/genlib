# SPDX-License-Identifier: Apache-2.0
"""RFC 5545 recurrence rule expansion for a UTC subset.

Supported parts: FREQ (DAILY|WEEKLY|MONTHLY|YEARLY), INTERVAL, COUNT, UNTIL, BYDAY (ordinals such as
2TU or -1FR with MONTHLY or YEARLY), BYMONTHDAY and BYMONTH. Matches python-dateutil for every rule it
accepts; rejects BYSETPOS, WKST, BYHOUR and every other part with ValueError instead of ignoring them.
"""
import calendar
import datetime as dt
import re

WEEKDAYS = ("MO", "TU", "WE", "TH", "FR", "SA", "SU")
MAX_PERIODS = 100000
_ALLOWED = {"FREQ", "INTERVAL", "COUNT", "UNTIL", "BYDAY", "BYMONTHDAY", "BYMONTH"}
_DTSTART = re.compile(r"([0-9]{4})-([0-9]{2})-([0-9]{2})T([0-9]{2}):([0-9]{2}):([0-9]{2})Z")
_UNTIL = re.compile(r"([0-9]{4})([0-9]{2})([0-9]{2})T([0-9]{2})([0-9]{2})([0-9]{2})Z")
_BYDAY = re.compile(r"([+-]?[0-9]{1,2})?(MO|TU|WE|TH|FR|SA|SU)")


def _datetime(m, label: str) -> dt.datetime:
    try:
        return dt.datetime(*(int(g) for g in m.groups()))
    except ValueError:
        raise ValueError(f"invalid {label}") from None


def _number(text: str, lo: int, hi: int, signed: bool, label: str) -> int:
    if not re.fullmatch(r"[+-]?[0-9]{1,4}" if signed else r"\+?[0-9]{1,4}", text) or not lo <= abs(int(text)) <= hi:
        raise ValueError(f"invalid {label}: {text!r}")
    return int(text)


def parse_rule(rule: str) -> dict:
    parts = {}
    for piece in rule.split(";"):
        if "=" not in piece:
            raise ValueError(f"malformed rule part: {piece!r}")
        key, value = piece.split("=", 1)
        if key in parts:
            raise ValueError(f"duplicate rule part: {key}")
        parts[key] = value
    unsupported = set(parts) - _ALLOWED
    if unsupported:
        raise ValueError(f"unsupported rule parts: {', '.join(sorted(unsupported))}")
    freq = parts.get("FREQ")
    if freq not in ("DAILY", "WEEKLY", "MONTHLY", "YEARLY"):
        raise ValueError("FREQ must be DAILY, WEEKLY, MONTHLY or YEARLY")
    if "COUNT" in parts and "UNTIL" in parts:
        raise ValueError("COUNT and UNTIL cannot both be set")
    r = {"freq": freq, "interval": 1, "count": None, "until": None, "byday": [], "bymonthday": [], "bymonth": []}
    if "INTERVAL" in parts:
        r["interval"] = _number(parts["INTERVAL"], 1, 9999, False, "INTERVAL")
    if "COUNT" in parts:
        r["count"] = _number(parts["COUNT"], 1, 9999, False, "COUNT")
    if "UNTIL" in parts:
        m = _UNTIL.fullmatch(parts["UNTIL"])
        if not m:
            raise ValueError("UNTIL must be YYYYMMDDTHHMMSSZ")
        r["until"] = _datetime(m, "UNTIL")
    if "BYDAY" in parts:
        max_ordinal = 5 if freq == "MONTHLY" or (freq == "YEARLY" and "BYMONTH" in parts) else 53
        for item in parts["BYDAY"].split(","):
            m = _BYDAY.fullmatch(item)
            if not m:
                raise ValueError(f"invalid BYDAY: {item!r}")
            n = int(m.group(1)) if m.group(1) else 0
            if m.group(1) and (n == 0 or abs(n) > max_ordinal or freq not in ("MONTHLY", "YEARLY")):
                raise ValueError(f"invalid BYDAY ordinal: {item!r}")
            r["byday"].append((n, WEEKDAYS.index(m.group(2))))
        if any(n for n, _ in r["byday"]) and not all(n for n, _ in r["byday"]):
            raise ValueError("BYDAY cannot mix plain and ordinal weekdays")
    if "BYMONTHDAY" in parts:
        r["bymonthday"] = [_number(x, 1, 31, True, "BYMONTHDAY") for x in parts["BYMONTHDAY"].split(",")]
    if "BYMONTH" in parts:
        r["bymonth"] = [_number(x, 1, 12, False, "BYMONTH") for x in parts["BYMONTH"].split(",")]
    return r


def _period(r: dict, s: dt.datetime, k: int):
    """Dates of period k (consecutive days), or None past year 9999."""
    if r["freq"] in ("DAILY", "WEEKLY"):
        if r["freq"] == "DAILY":
            first, length = s.toordinal() + k * r["interval"], 1
        else:
            first, length = s.toordinal() - s.weekday() + 7 * k * r["interval"], 7
        last_ok = dt.date.max.toordinal()
        return [dt.date.fromordinal(o) for o in range(first, min(first + length, last_ok + 1))] or None
    if r["freq"] == "MONTHLY":
        index = s.month - 1 + k * r["interval"]
        year, month = s.year + index // 12, index % 12 + 1
        if year > 9999:
            return None
        return [dt.date(year, month, d) for d in range(1, calendar.monthrange(year, month)[1] + 1)]
    year = s.year + k * r["interval"]
    if year > 9999:
        return None
    first = dt.date(year, 1, 1).toordinal()
    return [dt.date.fromordinal(first + i) for i in range(366 if calendar.isleap(year) else 365)]


def _ordinal_hits(r: dict, days) -> set:
    """Dates chosen by ordinal BYDAY items, counted within the month or within the whole period."""
    by_month = r["freq"] == "MONTHLY" or bool(r["bymonth"])
    scopes = {}
    for d in days:
        scopes.setdefault(d.month if by_month else 0, [[] for _ in range(7)])[d.weekday()].append(d)
    hits = set()
    for scope in scopes.values():
        for n, wd in r["byday"]:
            matching = scope[wd]
            if abs(n) <= len(matching):
                hits.add(matching[n - 1] if n > 0 else matching[n])
    return hits


def expand_rrule(dtstart: str, rule: str, limit: int = 50) -> "list[str]":
    """Occurrences as YYYY-MM-DDTHH:MM:SSZ, in time order, at most `limit` (1..1000)."""
    if isinstance(limit, bool) or not isinstance(limit, int) or not 1 <= limit <= 1000:
        raise ValueError("limit must be an integer from 1 to 1000")
    m = _DTSTART.fullmatch(dtstart) if isinstance(dtstart, str) else None
    if not m:
        raise ValueError("dtstart must be YYYY-MM-DDTHH:MM:SSZ")
    s = _datetime(m, "dtstart")
    r = parse_rule(rule)
    t = s.time()
    # python-dateutil defaults when neither BYDAY nor BYMONTHDAY is given.
    plain = {wd for n, wd in r["byday"] if n == 0}
    bymonthday, bymonth = r["bymonthday"], r["bymonth"]
    if not r["byday"] and not bymonthday:
        if r["freq"] == "WEEKLY":
            plain = {s.weekday()}
        if r["freq"] in ("MONTHLY", "YEARLY"):
            bymonthday = [s.day]
        if r["freq"] == "YEARLY" and not bymonth:
            bymonth = [s.month]
    ordinal = any(n for n, _ in r["byday"])
    out = []

    def done():
        return [f"{x.year:04d}-{x.month:02d}-{x.day:02d}T{x.hour:02d}:{x.minute:02d}:{x.second:02d}Z" for x in out]

    for k in range(MAX_PERIODS):
        try:
            days = _period(r, s, k)
        except (OverflowError, ValueError):  # past year 9999
            break
        if days is None:
            break
        if r["until"] is not None and dt.datetime.combine(days[0], t) > r["until"]:
            break
        hits = _ordinal_hits(r, days) if ordinal else None
        for d in days:
            if bymonth and d.month not in bymonth:
                continue
            if bymonthday:
                last = calendar.monthrange(d.year, d.month)[1]
                if not any(d.day == (x if x > 0 else last + x + 1) for x in bymonthday):
                    continue
            if (d not in hits) if hits is not None else (plain and d.weekday() not in plain):
                continue
            c = dt.datetime.combine(d, t)
            if c < s:
                continue
            if r["until"] is not None and c > r["until"]:
                return done()
            out.append(c)
            if (r["count"] is not None and len(out) >= r["count"]) or len(out) >= limit:
                return done()
        if days[-1] == dt.date.max:
            break
    return done()
