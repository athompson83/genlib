// SPDX-License-Identifier: Apache-2.0
/// Pagination helpers: page count, item offset and the page-number window of a pager (the MUI usePagination
/// algorithm with boundary and sibling counts). In [pageWindow] results a `null` entry is a gap (an ellipsis).
/// Invalid arguments throw [PaginationException].
library;

/// An out-of-range page, page size, sibling or boundary count.
class PaginationException implements Exception {
  final String message;
  const PaginationException(this.message);
  @override
  String toString() => 'PaginationException: $message';
}

/// Number of pages for [total] items (at least 1); [perPage] is 1..1000.
int pageCount(int total, int perPage) {
  if (total < 0 || perPage < 1 || perPage > 1000) throw const PaginationException('bad');
  final pages = (total + perPage - 1) ~/ perPage;
  return pages < 1 ? 1 : pages;
}

/// Zero-based item offset of 1-based [page].
int pageOffset(int page, int perPage) {
  if (page < 1 || perPage < 1 || perPage > 1000) throw const PaginationException('bad');
  return (page - 1) * perPage;
}

List<int> _range(int a, int b) => [for (var i = a; i <= b; i++) i];

/// Page numbers to show around [current] of [total]; `null` marks a gap. siblings 0..5, boundaries 1..5.
List<int?> pageWindow(int current, int total, {int siblings = 1, int boundaries = 1}) {
  if (total < 1 || current < 1 || current > total || siblings < 0 || siblings > 5 || boundaries < 1 || boundaries > 5) {
    throw const PaginationException('bad');
  }
  int min(int a, int b) => a < b ? a : b;
  int max(int a, int b) => a > b ? a : b;
  final start = _range(1, min(boundaries, total));
  final end = _range(max(total - boundaries + 1, boundaries + 1), total);
  final sStart = max(min(current - siblings, total - boundaries - siblings * 2 - 1), boundaries + 2);
  final sEnd = min(max(current + siblings, boundaries + siblings * 2 + 2), end.isNotEmpty ? end.first - 2 : total - 1);
  final items = <int?>[...start];
  if (sStart > boundaries + 2) {
    items.add(null);
  } else if (boundaries + 1 < total - boundaries) {
    items.add(boundaries + 1);
  }
  items.addAll(_range(sStart, sEnd));
  if (sEnd < total - boundaries - 1) {
    items.add(null);
  } else if (total - boundaries > boundaries) {
    items.add(total - boundaries);
  }
  items.addAll(end);
  // Small totals can repeat a page; keep first occurrences in order (gaps are always kept).
  final seen = <int>{};
  return [for (final x in items) if (x == null || seen.add(x)) x];
}
