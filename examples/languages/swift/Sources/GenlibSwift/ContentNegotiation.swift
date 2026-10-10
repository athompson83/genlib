// SPDX-License-Identifier: Apache-2.0
// Accept and Accept-Language negotiation (RFC 9110 section 12.5, RFC 4647 basic filtering). Hand-parsed.
// For each available entry the MOST SPECIFIC matching range supplies its q; the entry with the highest q > 0 wins and
// ties go to the earlier available entry. A missing or blank header selects the first available entry.

public enum ContentNegotiation {
    private struct Item { let value: [UInt8]; let q: Int }  // q in thousandths

    private static func isTrimSpace(_ c: UInt8) -> Bool { c == 0x20 || c == 0x09 }
    private static func isWhitespace(_ c: UInt8) -> Bool { c == 0x20 || (0x09...0x0D).contains(c) || (0x1C...0x1F).contains(c) }
    private static func isDigit(_ c: UInt8) -> Bool { c >= 0x30 && c <= 0x39 }

    private static func trim(_ s: ArraySlice<UInt8>, _ space: (UInt8) -> Bool) -> ArraySlice<UInt8> {
        var a = s.startIndex, b = s.endIndex
        while a < b, space(s[a]) { a += 1 }
        while b > a, space(s[b - 1]) { b -= 1 }
        return s[a..<b]
    }

    /// q value `0(.d{0,3})?` or `1(.0{0,3})?` in thousandths, else nil.
    private static func qValue(_ v: ArraySlice<UInt8>) -> Int? {
        guard let first = v.first, first == 0x30 || first == 0x31 else { return nil }
        let rest = v.dropFirst()
        if rest.isEmpty { return first == 0x31 ? 1000 : 0 }
        let frac = rest.dropFirst()
        guard rest.first == 0x2E, frac.count <= 3, frac.allSatisfy(isDigit) else { return nil }
        if first == 0x31 { return frac.allSatisfy({ $0 == 0x30 }) ? 1000 : nil }
        var q = 0, scale = 100
        for c in frac { q += Int(c - 0x30) * scale; scale /= 10 }
        return q
    }

    private static func lowered(_ s: ArraySlice<UInt8>) -> [UInt8] {
        // ASCII lowering; the Kelvin sign (U+212A, E2 84 AA) lowers to "k" as in Unicode case mapping.
        var out: [UInt8] = [], i = s.startIndex
        while i < s.endIndex {
            let c = s[i]
            if c == 0xE2, i + 2 < s.endIndex, s[i + 1] == 0x84, s[i + 2] == 0xAA { out.append(0x6B); i += 3; continue }
            out.append((0x41...0x5A).contains(c) ? c + 32 : c)
            i += 1
        }
        return out
    }

    private static func parse(_ header: String) -> [Item] {
        var items: [Item] = []
        for part in Array(header.utf8).split(separator: 0x2C, omittingEmptySubsequences: false) {
            let p = trim(part, isTrimSpace)
            if p.isEmpty { continue }
            let bits = p.split(separator: 0x3B, omittingEmptySubsequences: false).map { trim($0, isTrimSpace) }
            var q: Int? = 1000
            for param in bits.dropFirst() {
                let eq = param.firstIndex(of: 0x3D)
                let key = trim(eq.map { param[param.startIndex..<$0] } ?? param, isWhitespace)
                guard lowered(key) == [0x71] else { continue }
                q = eq.flatMap { qValue(trim(param[($0 + 1)...], isWhitespace)) }
                if q == nil { break }
            }
            if let q = q { items.append(Item(value: lowered(bits[0]), q: q)) }
        }
        return items
    }

    private static func isBlank(_ s: String) -> Bool { s.utf8.allSatisfy(isWhitespace) }

    private static func best(_ available: [String], _ ranges: [Item], _ specificity: ([UInt8], [UInt8]) -> Int) -> String? {
        var winner: String? = nil, winnerQ = 0
        for a in available {
            let tag = lowered(Array(a.utf8)[...])
            var match: (spec: Int, q: Int)? = nil
            for r in ranges {
                let spec = specificity(r.value, tag)
                if spec > 0 && (match == nil || spec > match!.spec) { match = (spec, r.q) }
            }
            if let m = match, m.q > winnerQ { winner = a; winnerQ = m.q }
        }
        return winner
    }

    private static let tokenChars = Set(Array("!#$%&'*+.^_`|~0123456789abcdefghijklmnopqrstuvwxyz-".utf8))

    private static func splitMedia(_ v: [UInt8]) -> (ArraySlice<UInt8>, ArraySlice<UInt8>)? {
        let parts = v.split(separator: 0x2F, omittingEmptySubsequences: false)
        return parts.count == 2 ? (parts[0], parts[1]) : nil
    }

    /// Best available media type for an Accept header, or nil when none is acceptable.
    public static func negotiateMediaType(_ accept: String?, _ available: [String]) -> String? {
        guard let accept = accept, !isBlank(accept) else { return available.first }
        let ranges = parse(accept).filter { item in
            guard let (t, s) = splitMedia(item.value) else { return false }
            return !t.isEmpty && !s.isEmpty && t.allSatisfy(tokenChars.contains) && s.allSatisfy(tokenChars.contains)
        }
        return best(available, ranges) { range, tag in
            guard let (rt, rs) = splitMedia(range), let (t, s) = splitMedia(tag) else { return 0 }
            if rt.elementsEqual(t) && rs.elementsEqual(s) { return 3 }
            if rt.elementsEqual(t) && rs.elementsEqual([0x2A]) { return 2 }
            if rt.elementsEqual([0x2A]) && rs.elementsEqual([0x2A]) { return 1 }
            return 0
        }
    }

    private static func isLanguageRange(_ v: [UInt8]) -> Bool {
        if v == [0x2A] { return true }
        let subtags = v.split(separator: 0x2D, omittingEmptySubsequences: false)
        for (i, s) in subtags.enumerated() {
            guard (1...8).contains(s.count),
                  s.allSatisfy({ (0x61...0x7A).contains($0) || (i > 0 && isDigit($0)) }) else { return false }
        }
        return true
    }

    /// Best available language tag (original case) for an Accept-Language header, or nil when none is acceptable.
    public static func negotiateLanguage(_ acceptLanguage: String?, _ available: [String]) -> String? {
        guard let header = acceptLanguage, !isBlank(header) else { return available.first }
        let ranges = parse(header).filter { isLanguageRange($0.value) }
        return best(available, ranges) { range, tag in
            if range == [0x2A] { return 1 }
            if tag == range || (tag.starts(with: range) && tag.count > range.count && tag[range.count] == 0x2D) {
                return 2 + range.filter { $0 == 0x2D }.count
            }
            return 0
        }
    }
}
