# SPDX-License-Identifier: Apache-2.0
"""RFC 5545 VCALENDAR writer for publishing events (iCalendar feeds and .ics downloads).

Events are mappings with uid, dtstamp, start, end, summary and optional description, location
and url. Times are UTC "YYYY-MM-DDTHH:MM:SSZ" or all-day dates "YYYY-MM-DD".
"""
import re
from collections.abc import Mapping, Sequence
from datetime import date, datetime

_UTC = re.compile(r"(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})Z")
_DATE = re.compile(r"(\d{4})-(\d{2})-(\d{2})")
_URL = re.compile(r"https?://[^\s/?#]+[^\s]*", re.IGNORECASE)
_KEYS = {"uid", "dtstamp", "start", "end", "summary", "description", "location", "url"}


def _escape(text: str) -> str:
    text = text.replace("\\", "\\\\").replace(";", "\\;").replace(",", "\\,")
    return text.replace("\r\n", "\\n").replace("\n", "\\n")


def _fold(line: str) -> str:
    data = line.encode("utf-8")
    parts, limit, start = [], 75, 0
    while len(data) - start > limit:
        end = start + limit
        while data[end] & 0xC0 == 0x80:  # never split a UTF-8 sequence
            end -= 1
        parts.append(data[start:end])
        start, limit = end, 74
    parts.append(data[start:])
    return "\r\n ".join(p.decode("utf-8") for p in parts) + "\r\n"


def _when(value, field: str) -> tuple[str, object]:
    """Returns ("utc"|"date", comparable value); validates the calendar date."""
    if isinstance(value, str):
        m = _UTC.fullmatch(value)
        if m:
            try:
                return "utc", datetime(*map(int, m.groups()))
            except ValueError:
                pass
        m = _DATE.fullmatch(value)
        if m:
            try:
                return "date", date(*map(int, m.groups()))
            except ValueError:
                pass
    raise ValueError(f"{field} must be YYYY-MM-DDTHH:MM:SSZ or YYYY-MM-DD: {value!r}")


def _text(event: Mapping, key: str, required: bool) -> str | None:
    value = event.get(key)
    if value is None and not required:
        return None
    if not isinstance(value, str) or (required and not value):
        raise ValueError(f"{key} must be a non-empty string")
    return value


def _format(kind: str, value) -> str:
    return value.strftime("%Y%m%dT%H%M%SZ") if kind == "utc" else value.strftime("%Y%m%d")


def ics_calendar(events: Sequence[Mapping], prod_id: str) -> str:
    """Serializes events to a CRLF-terminated, folded VCALENDAR string."""
    if not isinstance(prod_id, str) or not prod_id:
        raise ValueError("prod_id must be a non-empty string")
    lines = ["BEGIN:VCALENDAR", "VERSION:2.0", f"PRODID:{_escape(prod_id)}", "CALSCALE:GREGORIAN",
             "METHOD:PUBLISH"]
    for event in events:
        if not isinstance(event, Mapping):
            raise TypeError("each event must be a mapping")
        unknown = set(event) - _KEYS
        if unknown:
            raise ValueError(f"unknown event keys {sorted(unknown)}")
        uid, summary = _text(event, "uid", True), _text(event, "summary", True)
        stamp_kind, stamp = _when(event.get("dtstamp"), "dtstamp")
        if stamp_kind != "utc":
            raise ValueError("dtstamp must be a UTC time")
        start_kind, start = _when(event.get("start"), "start")
        end_kind, end = _when(event.get("end"), "end")
        if start_kind != end_kind:
            raise ValueError("start and end must both be UTC times or both be dates")
        if end <= start:
            raise ValueError("end must be after start")
        param = ";VALUE=DATE" if start_kind == "date" else ""
        lines += ["BEGIN:VEVENT", f"UID:{_escape(uid)}", f"DTSTAMP:{_format('utc', stamp)}",
                  f"DTSTART{param}:{_format(start_kind, start)}", f"DTEND{param}:{_format(end_kind, end)}",
                  f"SUMMARY:{_escape(summary)}"]
        for key, name in (("description", "DESCRIPTION"), ("location", "LOCATION")):
            value = _text(event, key, False)
            if value is not None:
                lines.append(f"{name}:{_escape(value)}")
        url = _text(event, "url", False)
        if url is not None:
            if not _URL.fullmatch(url):
                raise ValueError(f"url must be an absolute http(s) URL: {url!r}")
            lines.append(f"URL:{url}")
        lines.append("END:VEVENT")
    lines.append("END:VCALENDAR")
    return "".join(_fold(line) for line in lines)
