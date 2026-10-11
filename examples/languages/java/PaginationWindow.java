// SPDX-License-Identifier: Apache-2.0

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

/**
 * Pagination math: page count, page offset and a page-number window with boundary pages, sibling pages around the
 * current page and gaps (the MUI usePagination layout). In a window, a null element is a gap (an ellipsis); every
 * other element is a 1-based page number. Invalid arguments throw IllegalArgumentException.
 */
public final class PaginationWindow {
    private PaginationWindow() {}

    /** ceil(total/perPage), at least 1; total >= 0 and perPage 1..1000. */
    public static long pageCount(long total, int perPage) {
        if (total < 0 || perPage < 1 || perPage > 1000) throw new IllegalArgumentException("bad");
        return Math.max(1, (total + perPage - 1) / perPage);
    }

    /** (page-1)*perPage for page >= 1 and perPage 1..1000. */
    public static long pageOffset(long page, int perPage) {
        if (page < 1 || perPage < 1 || perPage > 1000) throw new IllegalArgumentException("bad");
        return (page - 1) * perPage;
    }

    private static void range(List<Integer> out, int a, int b) { for (int i = a; i <= b; i++) out.add(i); }

    /** Page numbers to show, with null for each gap; siblings 0..5, boundaries 1..5, 1 <= current <= total. */
    public static List<Integer> pageWindow(int current, int total, int siblings, int boundaries) {
        if (total < 1 || current < 1 || current > total || siblings < 0 || siblings > 5 || boundaries < 1 || boundaries > 5) {
            throw new IllegalArgumentException("bad");
        }
        List<Integer> start = new ArrayList<>();
        range(start, 1, Math.min(boundaries, total));
        List<Integer> end = new ArrayList<>();
        range(end, Math.max(total - boundaries + 1, boundaries + 1), total);
        int sStart = Math.max(Math.min(current - siblings, total - boundaries - siblings * 2 - 1), boundaries + 2);
        int sEnd = Math.min(Math.max(current + siblings, boundaries + siblings * 2 + 2), end.isEmpty() ? total - 1 : end.get(0) - 2);
        List<Integer> items = new ArrayList<>(start);
        if (sStart > boundaries + 2) items.add(null);
        else if (boundaries + 1 < total - boundaries) items.add(boundaries + 1);
        range(items, sStart, sEnd);
        if (sEnd < total - boundaries - 1) items.add(null);
        else if (total - boundaries > boundaries) items.add(total - boundaries);
        items.addAll(end);
        // Small totals can repeat a page; keep first occurrences in order.
        Set<Integer> seen = new HashSet<>();
        List<Integer> out = new ArrayList<>();
        for (Integer x : items) if (x == null || seen.add(x)) out.add(x);
        return out;
    }

    /** pageWindow with one sibling and one boundary page. */
    public static List<Integer> pageWindow(int current, int total) { return pageWindow(current, total, 1, 1); }
}
