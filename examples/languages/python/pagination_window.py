# SPDX-License-Identifier: Apache-2.0
"""Page-number pagination math: page count, offsets and the page-button window with gaps.

page_window() follows MUI's usePagination: `boundaries` pages at each end, `siblings` pages on each
side of the current page, and a gap (None, render it as an ellipsis) where pages are skipped. A gap
never hides a single page: that page is shown instead. Small totals list every page once.
Limits: per_page 1..1000, total >= 0, current 1..total_pages, siblings 0..5, boundaries 1..5.
For keyset/cursor pagination over changing data use pagination.py or signed_cursors.py instead.
"""


class PaginationError(ValueError):
    """Raised for an out-of-range page, page size, total or window parameter."""


def _is_int(n) -> bool:
    return isinstance(n, int) and not isinstance(n, bool)


def page_count(total: int, per_page: int) -> int:
    """Number of pages for total items (at least 1)."""
    if not _is_int(total) or total < 0 or not _is_int(per_page) or not 1 <= per_page <= 1000:
        raise PaginationError("total must be >= 0 and per_page 1..1000")
    return max(1, -(-total // per_page))


def page_offset(page: int, per_page: int) -> int:
    """Zero-based offset of the first item on a 1-based page."""
    if not _is_int(page) or page < 1 or not _is_int(per_page) or not 1 <= per_page <= 1000:
        raise PaginationError("page must be >= 1 and per_page 1..1000")
    return (page - 1) * per_page


def _rng(a: int, b: int) -> list[int]:
    return list(range(a, b + 1)) if b >= a else []


def page_window(current: int, total: int, siblings: int = 1, boundaries: int = 1) -> list[int | None]:
    """Page numbers to show, with None for each gap (ellipsis)."""
    for v in (current, total, siblings, boundaries):
        if not _is_int(v):
            raise PaginationError("window arguments must be integers")
    if total < 1 or not 1 <= current <= total or not 0 <= siblings <= 5 or not 1 <= boundaries <= 5:
        raise PaginationError("window arguments out of range")
    start = _rng(1, min(boundaries, total))
    end = _rng(max(total - boundaries + 1, boundaries + 1), total)
    s_start = max(min(current - siblings, total - boundaries - siblings * 2 - 1), boundaries + 2)
    s_end = min(max(current + siblings, boundaries + siblings * 2 + 2), end[0] - 2 if end else total - 1)
    items: list[int | None] = list(start)
    if s_start > boundaries + 2:
        items.append(None)
    elif boundaries + 1 < total - boundaries:
        items.append(boundaries + 1)
    items += _rng(s_start, s_end)
    if s_end < total - boundaries - 1:
        items.append(None)
    elif total - boundaries > boundaries:
        items.append(total - boundaries)
    items += end
    seen: set[int] = set()
    out: list[int | None] = []
    for x in items:
        if x is None or x not in seen:
            out.append(x)
        if x is not None:
            seen.add(x)
    return out
