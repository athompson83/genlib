// SPDX-License-Identifier: Apache-2.0
namespace Genlib.Validation;

/// <summary>
/// Pagination helpers: page counts, offsets and a page-number window with ellipsis gaps (the MUI usePagination algorithm).
/// In <see cref="PageWindow"/> results a gap is represented by <c>null</c>. Bad arguments throw <see cref="ArgumentException"/>.
/// </summary>
public static class PaginationWindow {
    /// <summary>ceil(total/perPage), at least 1; total &gt;= 0 and perPage 1..1000.</summary>
    public static long PageCount(long totalItems, int perPage) {
        if (totalItems < 0 || perPage is < 1 or > 1000) throw new ArgumentException("bad");
        return Math.Max(1, totalItems / perPage + (totalItems % perPage != 0 ? 1 : 0));
    }

    /// <summary>The zero-based item offset (page-1)*perPage for page &gt;= 1 and perPage 1..1000.</summary>
    public static long PageOffset(long page, int perPage) {
        if (page < 1 || perPage is < 1 or > 1000) throw new ArgumentException("bad");
        return checked((page - 1) * perPage);
    }

    /// <summary>
    /// Page numbers to show for <paramref name="current"/> of <paramref name="totalPages"/>, with <c>null</c> for each ellipsis gap;
    /// siblings 0..5 pages either side of the current page and boundaries 1..5 pages at each end.
    /// </summary>
    public static List<int?> PageWindow(int current, int totalPages, int siblings = 1, int boundaries = 1) {
        int total = totalPages;
        if (total < 1 || current < 1 || current > total || siblings is < 0 or > 5 || boundaries is < 1 or > 5) throw new ArgumentException("bad");
        static IEnumerable<int?> Range(int a, int b) { for (int x = a; x <= b; x++) yield return x; }
        var start = Range(1, Math.Min(boundaries, total)).ToList();
        var end = Range(Math.Max(total - boundaries + 1, boundaries + 1), total).ToList();
        int sStart = Math.Max(Math.Min(current - siblings, total - boundaries - siblings * 2 - 1), boundaries + 2);
        int sEnd = Math.Min(Math.Max(current + siblings, boundaries + siblings * 2 + 2), end.Count > 0 ? end[0]!.Value - 2 : total - 1);
        var items = new List<int?>(start);
        if (sStart > boundaries + 2) items.Add(null);
        else if (boundaries + 1 < total - boundaries) items.Add(boundaries + 1);
        items.AddRange(Range(sStart, sEnd));
        if (sEnd < total - boundaries - 1) items.Add(null);
        else if (total - boundaries > boundaries) items.Add(total - boundaries);
        items.AddRange(end);
        // Small totals can repeat a page; keep first occurrences in order.
        var seen = new HashSet<int>();
        var output = new List<int?>();
        foreach (var x in items) {
            if (x is null) output.Add(null);
            else if (seen.Add(x.Value)) output.Add(x);
        }
        return output;
    }
}
