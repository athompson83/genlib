// SPDX-License-Identifier: Apache-2.0
// Pagination helpers: page count, item offset and the page-number window of a pager (the MUI usePagination algorithm
// with boundary and sibling counts). In window results a nil entry is a gap (an ellipsis).

public enum PaginationWindowError: Error, Equatable {
    case invalidArgument(String)
}

public enum PaginationWindow {
    /// Number of pages for total items (at least 1); perPage is 1...1000.
    public static func pageCount(_ total: Int, perPage: Int) throws -> Int {
        guard total >= 0, (1...1000).contains(perPage) else { throw PaginationWindowError.invalidArgument("bad") }
        return max(1, (total + perPage - 1) / perPage)
    }

    /// Zero-based item offset of a 1-based page.
    public static func pageOffset(_ page: Int, perPage: Int) throws -> Int {
        guard page >= 1, (1...1000).contains(perPage) else { throw PaginationWindowError.invalidArgument("bad") }
        return (page - 1) * perPage
    }

    private static func range(_ a: Int, _ b: Int) -> [Int?] { b >= a ? (a...b).map { $0 } : [] }

    /// Page numbers to show around current of total; nil marks a gap. siblings 0...5, boundaries 1...5.
    public static func window(current: Int, total: Int, siblings: Int = 1, boundaries: Int = 1) throws -> [Int?] {
        guard total >= 1, (1...total).contains(current), (0...5).contains(siblings), (1...5).contains(boundaries) else {
            throw PaginationWindowError.invalidArgument("bad")
        }
        let start = range(1, min(boundaries, total))
        let end = range(max(total - boundaries + 1, boundaries + 1), total)
        let sStart = max(min(current - siblings, total - boundaries - siblings * 2 - 1), boundaries + 2)
        let sEnd = min(max(current + siblings, boundaries + siblings * 2 + 2), end.first.map { $0! - 2 } ?? total - 1)
        var items = start
        if sStart > boundaries + 2 { items.append(nil) } else if boundaries + 1 < total - boundaries { items.append(boundaries + 1) }
        items += range(sStart, sEnd)
        if sEnd < total - boundaries - 1 { items.append(nil) } else if total - boundaries > boundaries { items.append(total - boundaries) }
        items += end
        // Small totals can repeat a page; keep first occurrences in order (gaps are always kept).
        var seen = Set<Int>()
        return items.filter { x in x.map { seen.insert($0).inserted } ?? true }
    }
}
