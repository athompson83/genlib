# SPDX-License-Identifier: Apache-2.0
"""Server-sent events (WHATWG HTML "event stream" interpretation): incremental parser and formatter.

Text may arrive in arbitrary chunks (even splitting a CRLF). Events are dicts {"event", "data", "id"};
an unterminated final event is dropped, as the specification requires.
"""


class SseParser:
    """Incremental event-stream parser; ``retry`` holds the latest valid retry in milliseconds or None."""

    def __init__(self) -> None:
        self._buf: list[str] = []
        self._data: list[str] = []
        self._event = ""
        self._last_id = ""
        self._pending_cr = False
        self._first = True
        self.retry: int | None = None

    def feed(self, text: str) -> list[dict]:
        """Consume a chunk of stream text and return the events it completed."""
        out: list[dict] = []
        if self._first and text:
            if text.startswith("﻿"):
                text = text[1:]
            self._first = False
        for ch in text:
            if self._pending_cr:
                self._pending_cr = False
                if ch == "\n":
                    continue
            if ch == "\r":
                self._pending_cr = True
                self._line("".join(self._buf), out)
                self._buf = []
            elif ch == "\n":
                self._line("".join(self._buf), out)
                self._buf = []
            else:
                self._buf.append(ch)
        return out

    def _line(self, line: str, out: list[dict]) -> None:
        if line == "":
            if self._data:
                out.append({"event": self._event or "message", "data": "\n".join(self._data), "id": self._last_id})
            self._data = []
            self._event = ""
            return
        if line.startswith(":"):
            return
        field, sep, value = line.partition(":")
        if sep and value.startswith(" "):
            value = value[1:]
        if field == "data":
            self._data.append(value)
        elif field == "event":
            self._event = value
        elif field == "id":
            if "\x00" not in value:
                self._last_id = value
        elif field == "retry":
            if value and all("0" <= c <= "9" for c in value):
                self.retry = int(value)


def parse_sse(text: str) -> list[dict]:
    """All complete events in text (a parser fed once)."""
    return SseParser().feed(text)


def format_sse(data: str, event: str | None = None, id: str | None = None, retry: int | None = None) -> str:
    """One event as stream text: event, id, retry, then one data: line per line of data, then a blank line."""
    for name, value in (("event", event), ("id", id)):
        if value is not None and ("\r" in value or "\n" in value):
            raise ValueError(f"{name} must not contain line breaks")
    if id is not None and "\x00" in id:
        raise ValueError("id must not contain NUL")
    if retry is not None and (isinstance(retry, bool) or not isinstance(retry, int) or retry < 0):
        raise ValueError("retry must be a non-negative integer")
    out = []
    if event is not None:
        out.append("event: " + event)
    if id is not None:
        out.append("id: " + id)
    if retry is not None:
        out.append(f"retry: {retry}")
    for line in data.replace("\r\n", "\n").replace("\r", "\n").split("\n"):
        out.append("data: " + line)
    return "\n".join(out) + "\n\n"


def format_comment(text: str = "") -> str:
    """A comment line (keep-alive ping) that dispatches no event: ':\\n\\n' or ': text\\n\\n'."""
    if "\r" in text or "\n" in text:
        raise ValueError("comment must be one line")
    return ":" + (" " + text if text else "") + "\n\n"
