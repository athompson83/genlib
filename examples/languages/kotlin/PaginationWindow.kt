// SPDX-License-Identifier: Apache-2.0

/**
 * Pagination math: page count, page offset and a page-number window with boundary pages, sibling pages around the
 * current page and gaps (the MUI usePagination layout). In a window, a null element is a gap (an ellipsis); every
 * other element is a 1-based page number. Invalid arguments throw IllegalArgumentException.
 */
object PaginationWindow {
    /** ceil(total/perPage), at least 1; total >= 0 and perPage 1..1000. */
    fun pageCount(total: Long, perPage: Int): Long {
        require(total >= 0 && perPage in 1..1000) { "bad" }
        return maxOf(1L, (total + perPage - 1) / perPage)
    }

    /** (page-1)*perPage for page >= 1 and perPage 1..1000. */
    fun pageOffset(page: Long, perPage: Int): Long {
        require(page >= 1 && perPage in 1..1000) { "bad" }
        return (page - 1) * perPage
    }

    /** Page numbers to show, with null for each gap; siblings 0..5, boundaries 1..5, 1 <= current <= total. */
    fun pageWindow(current: Int, total: Int, siblings: Int = 1, boundaries: Int = 1): List<Int?> {
        require(total >= 1 && current in 1..total && siblings in 0..5 && boundaries in 1..5) { "bad" }
        val start = (1..minOf(boundaries, total)).toList()
        val end = (maxOf(total - boundaries + 1, boundaries + 1)..total).toList()
        val sStart = maxOf(minOf(current - siblings, total - boundaries - siblings * 2 - 1), boundaries + 2)
        val sEnd = minOf(maxOf(current + siblings, boundaries + siblings * 2 + 2), if (end.isEmpty()) total - 1 else end[0] - 2)
        val items = ArrayList<Int?>(start)
        if (sStart > boundaries + 2) items.add(null)
        else if (boundaries + 1 < total - boundaries) items.add(boundaries + 1)
        items.addAll(sStart..sEnd)
        if (sEnd < total - boundaries - 1) items.add(null)
        else if (total - boundaries > boundaries) items.add(total - boundaries)
        items.addAll(end)
        // Small totals can repeat a page; keep first occurrences in order.
        val seen = HashSet<Int>()
        return items.filter { it == null || seen.add(it) }
    }
}
