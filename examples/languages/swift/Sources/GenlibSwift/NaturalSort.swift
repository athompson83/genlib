// SPDX-License-Identifier: Apache-2.0
// Natural sort ("file2" < "file10"): runs of ASCII digits compare by numeric value (any length), other runs by ASCII
// case-folded code points, a digit run sorts before a text run; deterministic tie-breaks make it a total order.
// Compares Unicode scalars, not Swift Characters (whose equality is canonical equivalence).

public enum NaturalSort {
    private struct Run { let digit: Bool; let points: [UInt32] }

    private static func isDigit(_ v: UInt32) -> Bool { v >= 0x30 && v <= 0x39 }

    private static func runs(_ s: [UInt32]) -> [Run] {
        var out: [Run] = [], i = 0
        while i < s.count {
            var j = i
            let digit = isDigit(s[i])
            while j < s.count && isDigit(s[j]) == digit { j += 1 }
            out.append(Run(digit: digit, points: Array(s[i..<j]))); i = j
        }
        return out
    }

    private static func cmp<T: Comparable>(_ x: T, _ y: T) -> Int { x < y ? -1 : (x > y ? 1 : 0) }

    private static func lex(_ x: [UInt32], _ y: [UInt32]) -> Int {
        for (p, q) in zip(x, y) where p != q { return p < q ? -1 : 1 }
        return cmp(x.count, y.count)
    }

    private static func fold(_ s: [UInt32]) -> [UInt32] { s.map { $0 >= 0x41 && $0 <= 0x5A ? $0 + 32 : $0 } }

    private static func stripZeros(_ s: [UInt32]) -> [UInt32] {
        let t = Array(s.drop { $0 == 0x30 })
        return t.isEmpty ? [0x30] : t
    }

    /// -1, 0 or 1: run by run (digits by value, before text; text by ASCII case-folded code points), then fewer runs,
    /// then fewer leading zeros, then plain code point order of the whole strings.
    public static func compare(_ a: String, _ b: String) -> Int {
        let pa = a.unicodeScalars.map(\.value), pb = b.unicodeScalars.map(\.value)
        let ra = runs(pa), rb = runs(pb)
        for (x, y) in zip(ra, rb) {
            var c: Int
            if x.digit && y.digit {
                let na = stripZeros(x.points), nb = stripZeros(y.points)
                c = cmp(na.count, nb.count)
                if c == 0 { c = lex(na, nb) }
            } else if x.digit != y.digit {
                c = x.digit ? -1 : 1
            } else {
                c = lex(fold(x.points), fold(y.points))
            }
            if c != 0 { return c }
        }
        let c = cmp(ra.count, rb.count)
        if c != 0 { return c }
        for (x, y) in zip(ra, rb) where x.digit && y.digit {
            let d = cmp(x.points.count, y.points.count)
            if d != 0 { return d }
        }
        return lex(pa, pb)
    }

    /// A new array sorted in natural order.
    public static func sorted(_ items: [String]) -> [String] {
        items.sorted { compare($0, $1) < 0 }
    }
}
