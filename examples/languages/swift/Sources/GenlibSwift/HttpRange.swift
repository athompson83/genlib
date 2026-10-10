// SPDX-License-Identifier: Apache-2.0
// HTTP Range / Content-Range for byte ranges (RFC 9110 section 14). Hand-parsed with 64-bit sizes.
// .none: no or unusable header (serve 200 with the full body). .unsatisfiable: respond 416 with its Content-Range.
// .ranges: inclusive ranges in header order (not merged); serve 206.

public struct ByteRange: Equatable {
    public let start: Int64
    public let end: Int64
    public init(_ start: Int64, _ end: Int64) { self.start = start; self.end = end }
}

public enum RangeResult: Equatable {
    case none
    case unsatisfiable(contentRange: String)
    case ranges([ByteRange])
}

public enum HttpRange {
    public static let maxSpecs = 100

    private static func isDigit(_ c: UInt8) -> Bool { c >= 0x30 && c <= 0x39 }
    private static func isAlpha(_ c: UInt8) -> Bool { (c | 0x20) >= 0x61 && (c | 0x20) <= 0x7A }

    private static func trimmed(_ s: ArraySlice<UInt8>) -> ArraySlice<UInt8> {
        var a = s.startIndex, b = s.endIndex
        while a < b, s[a] == 0x20 || s[a] == 0x09 { a += 1 }
        while b > a, s[b - 1] == 0x20 || s[b - 1] == 0x09 { b -= 1 }
        return s[a..<b]
    }

    /// Decimal digits -> value, saturating at Int64.max (larger numbers behave like "past the end").
    private static func decimal(_ d: ArraySlice<UInt8>) -> Int64 {
        var v: Int64 = 0
        for c in d {
            let (m, o1) = v.multipliedReportingOverflow(by: 10)
            let (n, o2) = m.addingReportingOverflow(Int64(c - 0x30))
            if o1 || o2 { return Int64.max }
            v = n
        }
        return v
    }

    /// Exact numeric comparison of two decimal digit strings: true when a < b.
    private static func lessThan(_ a: ArraySlice<UInt8>, _ b: ArraySlice<UInt8>) -> Bool {
        let x = a.drop(while: { $0 == 0x30 }), y = b.drop(while: { $0 == 0x30 })
        if x.count != y.count { return x.count < y.count }
        return x.lexicographicallyPrecedes(y)
    }

    /// Parses a Range header against a representation of `size` bytes.
    public static func parseRange(_ header: String?, size: Int64) -> RangeResult {
        guard let header = header else { return .none }
        let b = Array(header.utf8)
        var i = 0
        while i < b.count, b[i] == 0x20 || b[i] == 0x09 { i += 1 }
        let unitStart = i
        while i < b.count, isAlpha(b[i]) { i += 1 }
        guard i > unitStart, i < b.count, b[i] == 0x3D,
              String(decoding: b[unitStart..<i].map { $0 | 0x20 }, as: UTF8.self) == "bytes" else { return .none }
        let specs = b[(i + 1)...].split(separator: 0x2C, omittingEmptySubsequences: false).map(trimmed)
        guard specs.count <= maxSpecs, !specs.contains(where: { $0.isEmpty }) else { return .none }
        var out: [ByteRange] = []
        for p in specs {
            guard let dash = p.firstIndex(of: 0x2D) else { return .none }
            let first = p[p.startIndex..<dash], last = p[(dash + 1)...]
            guard first.allSatisfy(isDigit), last.allSatisfy(isDigit), !(first.isEmpty && last.isEmpty) else { return .none }
            if first.isEmpty {
                let n = decimal(last)
                if n == 0 || size == 0 { continue }
                out.append(ByteRange(n >= size ? 0 : size - n, size - 1))
            } else {
                if !last.isEmpty && lessThan(last, first) { return .none }
                let a = decimal(first)
                if a >= size { continue }
                out.append(ByteRange(a, last.isEmpty ? size - 1 : min(decimal(last), size - 1)))
            }
        }
        return out.isEmpty ? .unsatisfiable(contentRange: "bytes */\(size)") : .ranges(out)
    }

    /// Content-Range value for one served range: "bytes start-end/size".
    public static func contentRange(_ start: Int64, _ end: Int64, _ size: Int64) -> String { "bytes \(start)-\(end)/\(size)" }
}
