# SPDX-License-Identifier: Apache-2.0
"""RFC 5545 recurrence rule expansion for a UTC subset.

Supported parts: FREQ (DAILY|WEEKLY|MONTHLY|YEARLY), INTERVAL, COUNT, UNTIL, BYDAY, BYMONTHDAY
(MONTHLY) and BYMONTH (YEARLY). Anything else raises ValueError rather than being silently ignored.
"""
import calendar
import datetime as dt
import re

WEEKDAYS = ("MO", "TU", "WE", "TH", "FR", "SA", "SU")
MAX_PERIODS = 100000
_ALLOWED = {"FREQ", "INTERVAL", "COUNT", "UNTIL", "BYDAY", "BYMONTHDAY", "BYMONTH"}
_DTSTART = re.compile(r"([0-9]{4})-([0-9]{2})-([0-9]{2})T([0-9]{2}):([0-9]{2}):([0-9]{2})Z")
_UNTIL = re.compile(r"([0-9]{4})([0-9]{2})([0-9]{2})T([0-9]{2})([0-9]{2})([0-9]{2})Z")
_BYDAY = re.compile(r"([+-]?[1-5])?(MO|TU|WE|TH|FR|SA|SU)")


def _datetime(m, label: str) -> dt.datetime:
    try:
        return dt.datetime(*(int(g) for g in m.groups()))
    except ValueError:
        raise ValueError(f"invalid {label}") from None


def _number(text: str, lo: int, hi: int, signed: bool, label: str) -> int:
    if not re.fullmatch(r"[+-]?[0-9]{1,4}" if signed else r"[0-9]{1,4}", text) or not lo <= abs(int(text)) <= hi:
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
        if freq in ("DAILY", "YEARLY"):
            raise ValueError("BYDAY is supported only with WEEKLY or MONTHLY")
        for item in parts["BYDAY"].split(","):
            m = _BYDAY.fullmatch(item)
            if not m:
                raise ValueError(f"invalid BYDAY: {item!r}")
            n = int(m.group(1)) if m.group(1) else 0
            if n and freq != "MONTHLY":
                raise ValueError("BYDAY ordinals are supported only with MONTHLY")
            r["byday"].append((n, WEEKDAYS.index(m.group(2))))
    if "BYMONTHDAY" in parts:
        if freq != "MONTHLY":
            raise ValueError("BYMONTHDAY is supported only with MONTHLY")
        if r["byday"]:
            raise ValueError("BYDAY and BYMONTHDAY cannot be combined")
        r["bymonthday"] = [_number(x, 1, 31, True, "BYMONTHDAY") for x in parts["BYMONTHDAY"].split(",")]
    if "BYMONTH" in parts:
        if freq != "YEARLY":
            raise ValueError("BYMONTH is supported only with YEARLY")
        r["bymonth"] = [_number(x, 1, 12, False, "BYMONTH") for x in parts["BYMONTH"].split(",")]
    return r


def _candidates(r: dict, s: dt.datetime, k: int):
    t = s.time()
    if r["freq"] == "DAILY":
        return [dt.datetime.combine(s.date() + dt.timedelta(days=k * r["interval"]), t)]
    if r["freq"] == "WEEKLY":
        monday = s.date() - dt.timedelta(days=s.weekday()) + dt.timedelta(weeks=k * r["interval"])
        days = sorted({wd for _, wd in r["byday"]}) if r["byday"] else [s.weekday()]
        return [dt.datetime.combine(monday + dt.timedelta(days=wd), t) for wd in days]
    if r["freq"] == "MONTHLY":
        index = s.month - 1 + k * r["interval"]
        year, month = s.year + index // 12, index % 12 + 1
        if year > 9999:
            return None
        last = calendar.monthrange(year, month)[1]
        days = set()
        if r["byday"]:
            for n, wd in r["byday"]:
                matching = [d for d in range(1, last + 1) if calendar.weekday(year, month, d) == wd]
                if n == 0:
                    days.update(matching)
                elif abs(n) <= len(matching):
                    days.add(matching[n - 1] if n > 0 else matching[n])
        elif r["bymonthday"]:
            for md in r["bymonthday"]:
                d = md if md > 0 else last + md + 1
                if 1 <= d <= last:
                    days.add(d)
        elif s.day <= last:
            days.add(s.day)
        return [dt.datetime.combine(dt.date(year, month, d), t) for d in days]
    year = s.year + k * r["interval"]
    if year > 9999:
        return None
    return [dt.datetime.combine(dt.date(year, mo, s.day), t)
            for mo in (r["bymonth"] or [s.month]) if s.day <= calendar.monthrange(year, mo)[1]]


def expand_rrule(dtstart: str, rule: str, limit: int = 50) -> "list[str]":
    """Occurrences as YYYY-MM-DDTHH:MM:SSZ, in time order, at most `limit` (1..1000)."""
    if isinstance(limit, bool) or not isinstance(limit, int) or not 1 <= limit <= 1000:
        raise ValueError("limit must be an integer from 1 to 1000")
    m = _DTSTART.fullmatch(dtstart) if isinstance(dtstart, str) else None
    if not m:
        raise ValueError("dtstart must be YYYY-MM-DDTHH:MM:SSZ")
    s = _datetime(m, "dtstart")
    r = parse_rule(rule)
    out = []
    for k in range(MAX_PERIODS):
        try:
            cands = _candidates(r, s, k)
        except OverflowError:  # past year 9999
            break
        if cands is None:
            break
        done = False
        for c in sorted(cands):
            if c < s:
                continue
            if r["until"] is not None and c > r["until"]:
                done = True
                break
            out.append(c)
            if (r["count"] is not None and len(out) >= r["count"]) or len(out) >= limit:
                done = True
                break
        if done:
            break
    return [f"{x.year:04d}-{x.month:02d}-{x.day:02d}T{x.hour:02d}:{x.minute:02d}:{x.second:02d}Z" for x in out]
