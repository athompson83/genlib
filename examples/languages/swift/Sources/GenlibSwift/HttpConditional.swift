// SPDX-License-Identifier: Apache-2.0
// ETags and conditional requests (RFC 9110 section 13). evaluateConditional applies the preconditions in the order of
// section 13.2.2 and returns 200 (proceed), 304 (Not Modified) or 412 (Precondition Failed). Dates must be exact
// IMF-fixdate ("Wed, 21 Oct 2026 07:28:00 GMT"); any other date form is ignored. Hand-parsed, no DateFormatter.

public enum EtagList: Equatable {
    case any
    case tags([String])
}

public struct ConditionalRequest {
    public var method: String
    public var etag: String?
    public var lastModified: Int64?  // unix seconds
    public var ifMatch: String?
    public var ifNoneMatch: String?
    public var ifModifiedSince: String?
    public var ifUnmodifiedSince: String?

    public init(method: String, etag: String? = nil, lastModified: Int64? = nil, ifMatch: String? = nil,
                ifNoneMatch: String? = nil, ifModifiedSince: String? = nil, ifUnmodifiedSince: String? = nil) {
        self.method = method; self.etag = etag; self.lastModified = lastModified; self.ifMatch = ifMatch
        self.ifNoneMatch = ifNoneMatch; self.ifModifiedSince = ifModifiedSince; self.ifUnmodifiedSince = ifUnmodifiedSince
    }
}

public enum HttpConditional {
    private static func trim(_ s: ArraySlice<Unicode.Scalar>) -> ArraySlice<Unicode.Scalar> {
        var a = s.startIndex, b = s.endIndex
        while a < b, s[a] == " " || s[a] == "\t" { a += 1 }
        while b > a, s[b - 1] == " " || s[b - 1] == "\t" { b -= 1 }
        return s[a..<b]
    }

    private static func isEtag(_ p: ArraySlice<Unicode.Scalar>) -> Bool {
        var s = p
        if s.starts(with: ["W", "/"]) { s = s.dropFirst(2) }
        guard s.count >= 2, s.first == "\"", s.last == "\"" else { return false }
        return s.dropFirst().dropLast().allSatisfy { v in
            let x = v.value
            return x == 0x21 || (0x23...0x7E).contains(x) || (0x80...0xFF).contains(x)
        }
    }

    /// "*" or the valid entity tags of an If-Match / If-None-Match header (invalid items are ignored).
    public static func parseEtags(_ header: String) -> EtagList {
        let h = trim(Array(header.unicodeScalars)[...])
        if h.elementsEqual(["*"]) { return .any }
        return .tags(h.split(separator: ",", omittingEmptySubsequences: false).map(trim).filter(isEtag)
            .map { String(String.UnicodeScalarView($0)) })
    }

    private static func opaque(_ e: String) -> [Unicode.Scalar] {
        let s = Array(e.unicodeScalars)
        return s.starts(with: ["W", "/"]) ? Array(s.dropFirst(2)) : s
    }

    /// Strong comparison: neither tag is weak and both are identical.
    public static func strongMatch(_ a: String, _ b: String) -> Bool {
        let x = Array(a.unicodeScalars), y = Array(b.unicodeScalars)
        return !x.starts(with: ["W", "/"]) && !y.starts(with: ["W", "/"]) && x == y
    }

    /// Weak comparison: identical after removing a leading "W/".
    public static func weakMatch(_ a: String, _ b: String) -> Bool { opaque(a) == opaque(b) }

    private static let days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
    private static let months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

    static func daysFromCivil(_ y0: Int, _ m: Int, _ d: Int) -> Int {
        let y = m <= 2 ? y0 - 1 : y0
        let era = (y >= 0 ? y : y - 399) / 400
        let yoe = y - era * 400
        let doy = (153 * (m + (m > 2 ? -3 : 9)) + 2) / 5 + d - 1
        let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy
        return era * 146097 + doe - 719468
    }

    static func civilFromDays(_ z0: Int) -> (year: Int, month: Int, day: Int) {
        let z = z0 + 719468
        let era = (z >= 0 ? z : z - 146096) / 146097
        let doe = z - era * 146097
        let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365
        let doy = doe - (365 * yoe + yoe / 4 - yoe / 100)
        let mp = (5 * doy + 2) / 153
        let d = doy - (153 * mp + 2) / 5 + 1
        let m = mp + (mp < 10 ? 3 : -9)
        return (yoe + era * 400 + (m <= 2 ? 1 : 0), m, d)
    }

    private static func pad(_ v: Int, _ width: Int) -> String {
        let s = String(v)
        return String(repeating: "0", count: max(0, width - s.count)) + s
    }

    /// IMF-fixdate for unix seconds (years 1-9999), or nil outside that range.
    public static func formatHttpDate(_ unixSeconds: Int64) -> String? {
        let (dayNumber, secs) = (Int(unixSeconds.floorDiv(86400)), Int(unixSeconds - unixSeconds.floorDiv(86400) * 86400))
        let (y, m, d) = civilFromDays(dayNumber)
        guard (1...9999).contains(y) else { return nil }
        let wd = ((dayNumber + 3) % 7 + 7) % 7
        return "\(days[wd]), \(pad(d, 2)) \(months[m - 1]) \(pad(y, 4)) \(pad(secs / 3600, 2)):\(pad(secs / 60 % 60, 2)):\(pad(secs % 60, 2)) GMT"
    }

    /// Unix seconds of an exact IMF-fixdate, or nil for anything that does not round-trip.
    public static func parseHttpDate(_ s: String) -> Int64? {
        let b = Array(s.utf8)
        guard b.count == 29 else { return nil }
        func num(_ from: Int, _ len: Int) -> Int? {
            var v = 0
            for c in b[from..<(from + len)] { guard c >= 0x30 && c <= 0x39 else { return nil }; v = v * 10 + Int(c - 0x30) }
            return v
        }
        guard let d = num(5, 2), let y = num(12, 4), let hh = num(17, 2), let mi = num(20, 2), let ss = num(23, 2),
              let m = months.firstIndex(of: String(decoding: b[8..<11], as: UTF8.self)),
              y >= 1, d >= 1, d <= 31, hh <= 23, mi <= 59, ss <= 59 else { return nil }
        let t = Int64(daysFromCivil(y, m + 1, d)) * 86400 + Int64(hh * 3600 + mi * 60 + ss)
        return formatHttpDate(t) == s ? t : nil
    }

    /// 200, 304 or 412 for a request against the current representation (RFC 9110 13.2.2 order).
    public static func evaluateConditional(_ r: ConditionalRequest) -> Int {
        let safe = r.method == "GET" || r.method == "HEAD"
        if let ifMatch = r.ifMatch {
            switch parseEtags(ifMatch) {
            case .any: if r.etag == nil { return 412 }
            case .tags(let tags):
                guard let etag = r.etag, tags.contains(where: { strongMatch($0, etag) }) else { return 412 }
            }
        } else if let ius = r.ifUnmodifiedSince, let lm = r.lastModified, let date = parseHttpDate(ius), lm > date {
            return 412
        }
        if let inm = r.ifNoneMatch {
            let hit: Bool
            switch parseEtags(inm) {
            case .any: hit = r.etag != nil
            case .tags(let tags): hit = r.etag.map { etag in tags.contains { weakMatch($0, etag) } } ?? false
            }
            if hit { return safe ? 304 : 412 }
        } else if safe, let ims = r.ifModifiedSince, let lm = r.lastModified, let date = parseHttpDate(ims), lm <= date {
            return 304
        }
        return 200
    }
}

extension Int64 {
    fileprivate func floorDiv(_ d: Int64) -> Int64 {
        let q = self / d
        return (self % d != 0 && (self < 0) != (d < 0)) ? q - 1 : q
    }
}
