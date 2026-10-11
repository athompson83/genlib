// SPDX-License-Identifier: Apache-2.0
// Integer half-open intervals [start, end) with start < end. Every list result is sorted, non-overlapping and has
// adjacent intervals merged. Touching intervals do not overlap.

public enum IntervalMergeError: Error, Equatable {
    case invalidInterval(String)
}

public enum IntervalMerge {
    /// A half-open interval [start, end).
    public struct Interval: Equatable, Comparable {
        public let start: Int64
        public let end: Int64
        public init(_ start: Int64, _ end: Int64) { self.start = start; self.end = end }
        public static func < (a: Interval, b: Interval) -> Bool { a.start != b.start ? a.start < b.start : a.end < b.end }
    }

    private static func validate(_ xs: [Interval]) throws {
        for x in xs where x.start >= x.end { throw IntervalMergeError.invalidInterval("bad interval [\(x.start), \(x.end))") }
    }

    /// Sorts and merges overlapping or adjacent intervals.
    public static func merge(_ xs: [Interval]) throws -> [Interval] {
        try validate(xs)
        var out: [Interval] = []
        for x in xs.sorted() {
            if let last = out.last, x.start <= last.end {
                out[out.count - 1] = Interval(last.start, Swift.max(last.end, x.end))
            } else {
                out.append(x)
            }
        }
        return out
    }

    /// The parts covered by both a and b.
    public static func intersect(_ a: [Interval], _ b: [Interval]) throws -> [Interval] {
        let x = try merge(a), y = try merge(b)
        var out: [Interval] = [], i = 0, j = 0
        while i < x.count && j < y.count {
            let s = Swift.max(x[i].start, y[j].start), e = Swift.min(x[i].end, y[j].end)
            if s < e { out.append(Interval(s, e)) }
            if x[i].end < y[j].end { i += 1 } else { j += 1 }
        }
        return out.isEmpty ? out : try merge(out)
    }

    /// The parts of a not covered by b.
    public static func subtract(_ a: [Interval], _ b: [Interval]) throws -> [Interval] {
        let x = try merge(a), y = try merge(b)
        var out: [Interval] = []
        for iv in x {
            var cur = iv.start
            for other in y {
                if other.end <= cur || other.start >= iv.end { continue }
                if other.start > cur { out.append(Interval(cur, other.start)) }
                cur = Swift.max(cur, other.end)
                if cur >= iv.end { break }
            }
            if cur < iv.end { out.append(Interval(cur, iv.end)) }
        }
        return out
    }

    /// The parts of [lo, hi) not covered by xs; requires lo < hi.
    public static func gaps(_ xs: [Interval], lo: Int64, hi: Int64) throws -> [Interval] {
        guard lo < hi else { throw IntervalMergeError.invalidInterval("bad bounds") }
        return try subtract([Interval(lo, hi)], xs)
    }

    /// The covered length after merging.
    public static func total(_ xs: [Interval]) throws -> Int64 { try merge(xs).reduce(0) { $0 + $1.end - $1.start } }

    /// True when x and y share at least one point (touching is not overlapping).
    public static func overlaps(_ x: Interval, _ y: Interval) throws -> Bool {
        try validate([x, y])
        return x.start < y.end && y.start < x.end
    }

    /// True when some interval contains p.
    public static func contains(_ xs: [Interval], _ p: Int64) throws -> Bool { try merge(xs).contains { $0.start <= p && p < $0.end } }
}
