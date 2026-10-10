"""Pure Python pagination primitives. No network or provider assumptions."""
from dataclasses import dataclass
from typing import Generic, TypeVar
T = TypeVar("T")
@dataclass(frozen=True)
class Page(Generic[T]):
    items: tuple[T, ...]
    next_cursor: str | None

def bounded_limit(requested: int, *, maximum: int = 100) -> int:
    if isinstance(requested, bool) or not isinstance(requested, int):
        raise TypeError("limit must be an integer")
    if not 1 <= maximum <= 1000:
        raise ValueError("maximum must be between 1 and 1000")
    if not 1 <= requested <= maximum:
        raise ValueError("limit outside permitted range")
    return requested

def encode_cursor(offset: int) -> str:
    if isinstance(offset, bool) or not isinstance(offset, int) or offset < 0:
        raise ValueError("offset must be a nonnegative integer")
    return str(offset)

def decode_cursor(cursor: str | None, *, maximum_offset: int = 1_000_000) -> int:
    if cursor is None:
        return 0
    if not isinstance(cursor, str) or not cursor or not cursor.isascii() or not cursor.isdecimal():
        raise ValueError("invalid cursor")
    value = int(cursor)
    if value > maximum_offset:
        raise ValueError("cursor exceeds configured bound")
    return value

def paginate(items: list[T], *, limit: int, cursor: str | None = None) -> Page[T]:
    size = bounded_limit(limit)
    offset = decode_cursor(cursor)
    page = tuple(items[offset:offset + size])
    next_offset = offset + len(page)
    return Page(page, encode_cursor(next_offset) if next_offset < len(items) else None)
