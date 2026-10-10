// SPDX-License-Identifier: Apache-2.0
// RFC 5545 recurrence-rule subset in UTC: FREQ (DAILY|WEEKLY|MONTHLY|YEARLY), INTERVAL, COUNT, UNTIL, BYDAY (plain
// weekdays with any FREQ; ordinals with MONTHLY or YEARLY), BYMONTHDAY and BYMONTH, in any combination. Expansion follows
// python-dateutil's model and matches python-dateutil for every rule it accepts; rejects BYSETPOS, WKST, BYHOUR and other
// parts rather than ignoring them. Plain civil-date math (no Calendar/DateFormatter).

public enum RRuleError: Error, Equatable {
    case invalidArgument(String)
}

public enum RRule {
    public static let maxLimit = 1000
    public static let maxPeriods = 100_000

    private enum Freq: String { case daily = "DAILY", weekly = "WEEKLY", monthly = "MONTHLY", yearly = "YEARLY" }

    private struct Rule {
        var freq: Freq
        var interval = 1
        var count: Int? = nil
        var until: Int64? = nil
        var byDay: [(ordinal: Int, weekday: Int)] = []
        var byMonthDay: [Int] = []
        var byMonth: [Int] = []
    }

    private static let weekdays = ["MO", "TU", "WE", "TH", "FR", "SA", "SU"]

    private static func fail(_ message: String) -> RRuleError { .invalidArgument(message) }

    private static func digits(_ s: ArraySlice<UInt8>) -> Int? {
        guard !s.isEmpty, s.allSatisfy({ $0 >= 0x30 && $0 <= 0x39 }) else { return nil }
        return s.reduce(0) { $0 * 10 + Int($1 - 0x30) }
    }

    /// `[+-]?[0-9]{1,4}` with |value| in lo...hi (negative only when allowed).
    private static func number(_ s: String, _ lo: Int, _ hi: Int, negative: Bool, _ part: String) throws -> Int {
        var b = Array(s.utf8)[...], sign = 1
        if b.first == 0x2B || b.first == 0x2D { if b.first == 0x2D { sign = -1 }; b = b.dropFirst() }
        guard b.count <= 4, let v = digits(b), (lo...hi).contains(v), negative || sign > 0 else { throw fail("invalid \(part) value: \(s)") }
        return sign * v
    }

    private static func daysInMonth(_ y: Int, _ m: Int) -> Int {
        HttpConditional.daysFromCivil(m == 12 ? y + 1 : y, m == 12 ? 1 : m + 1, 1) - HttpConditional.daysFromCivil(y, m, 1)
    }

    /// Seconds since the epoch for validated civil fields, or nil when out of range.
    private static func timestamp(_ y: Int, _ mo: Int, _ d: Int, _ h: Int, _ mi: Int, _ s: Int) -> Int64? {
        guard (1...9999).contains(y), (1...12).contains(mo), d >= 1, d <= daysInMonth(y, mo), h <= 23, mi <= 59, s <= 59 else { return nil }
        return Int64(HttpConditional.daysFromCivil(y, mo, d)) * 86400 + Int64(h * 3600 + mi * 60 + s)
    }

    /// Parses fixed-width digit fields (runs of Y, M, D, h, m, s) between literal bytes, e.g. "YYYY-MM-DDThh:mm:ssZ".
    private static func fixed(_ text: String, _ layout: String) -> Int64? {
        let b = Array(text.utf8), l = Array(layout.utf8)
        guard b.count == l.count else { return nil }
        var fields: [Int] = [], i = 0
        while i < l.count {
            if "YMDhms".utf8.contains(l[i]) {
                var j = i
                while j < l.count && l[j] == l[i] { j += 1 }
                guard let v = digits(b[i..<j]) else { return nil }
                fields.append(v); i = j
            } else {
                guard b[i] == l[i] else { return nil }
                i += 1
            }
        }
        return timestamp(fields[0], fields[1], fields[2], fields[3], fields[4], fields[5])
    }

    private static func parseRule(_ rule: String) throws -> Rule {
        var parts: [String: String] = [:]
        for p in rule.split(separator: ";", omittingEmptySubsequences: false) {
            guard let eq = p.firstIndex(of: "=") else { throw fail("malformed rule part: \(p)") }
            let k = String(p[..<eq]), v = String(p[p.index(after: eq)...])
            guard parts[k] == nil else { throw fail("duplicate rule part: \(k)") }
            parts[k] = v
        }
        let allowed: Set<String> = ["FREQ", "INTERVAL", "COUNT", "UNTIL", "BYDAY", "BYMONTHDAY", "BYMONTH"]
        if let unknown = parts.keys.first(where: { !allowed.contains($0) }) { throw fail("unsupported rule part: \(unknown)") }
        guard let f = parts["FREQ"] else { throw fail("FREQ is required") }
        guard let freq = Freq(rawValue: f) else { throw fail("unsupported FREQ: \(f)") }
        if parts["COUNT"] != nil && parts["UNTIL"] != nil { throw fail("COUNT and UNTIL cannot both be set") }
        var r = Rule(freq: freq)
        if let v = parts["INTERVAL"] { r.interval = try number(v, 1, 9999, negative: false, "INTERVAL") }
        if let v = parts["COUNT"] { r.count = try number(v, 1, 9999, negative: false, "COUNT") }
        if let v = parts["UNTIL"] {
            guard let u = fixed(v, "YYYYMMDDThhmmssZ") else { throw fail("UNTIL must be YYYYMMDDTHHMMSSZ") }
            r.until = u
        }
        if let v = parts["BYDAY"] {
            let ordinalLimit = freq == .monthly || (freq == .yearly && parts["BYMONTH"] != nil) ? 5 : 53
            for d in v.split(separator: ",", omittingEmptySubsequences: false) {
                let b = Array(d.utf8)
                guard b.count >= 2, let wd = weekdays.firstIndex(of: String(decoding: b.suffix(2), as: UTF8.self)) else {
                    throw fail("invalid BYDAY value: \(d)")
                }
                var n = 0
                if b.count > 2 {
                    var o = b.dropLast(2), sign = 1
                    if o.first == 0x2B || o.first == 0x2D { if o.first == 0x2D { sign = -1 }; o = o.dropFirst() }
                    guard (1...2).contains(o.count), let x = digits(o) else { throw fail("invalid BYDAY value: \(d)") }
                    guard freq == .monthly || freq == .yearly else { throw fail("BYDAY ordinals require FREQ=MONTHLY or YEARLY") }
                    guard (1...ordinalLimit).contains(x) else { throw fail("BYDAY ordinal out of range: \(d)") }
                    n = sign * x
                }
                r.byDay.append((n, wd))
            }
            if r.byDay.contains(where: { $0.ordinal != 0 }) && r.byDay.contains(where: { $0.ordinal == 0 }) {
                throw fail("BYDAY cannot mix plain and ordinal weekdays")
            }
        }
        if let v = parts["BYMONTHDAY"] {
            r.byMonthDay = try v.split(separator: ",", omittingEmptySubsequences: false).map { try number(String($0), 1, 31, negative: true, "BYMONTHDAY") }
        }
        if let v = parts["BYMONTH"] {
            r.byMonth = try v.split(separator: ",", omittingEmptySubsequences: false).map { try number(String($0), 1, 12, negative: false, "BYMONTH") }
        }
        return r
    }

    private static func pad(_ v: Int, _ width: Int) -> String {
        let s = String(v)
        return String(repeating: "0", count: max(0, width - s.count)) + s
    }

    private static func format(_ t: Int64) -> String {
        let days = floorDiv(Int(t), 86400), secs = mod(Int(t), 86400)
        let (y, m, d) = HttpConditional.civilFromDays(days)
        return "\(pad(y, 4))-\(pad(m, 2))-\(pad(d, 2))T\(pad(secs / 3600, 2)):\(pad(secs / 60 % 60, 2)):\(pad(secs % 60, 2))Z"
    }

    private static func floorDiv(_ a: Int, _ b: Int) -> Int { a >= 0 ? a / b : -((-a + b - 1) / b) }
    private static func mod(_ a: Int, _ b: Int) -> Int { ((a % b) + b) % b }

    /// Occurrences (`YYYY-MM-DDTHH:MM:SSZ`) of `rule` starting at `dtstart` (same format), at most `limit` (1-1000).
    public static func expandRRule(_ dtstart: String, _ rule: String, limit: Int = 50) throws -> [String] {
        guard (1...maxLimit).contains(limit) else { throw fail("limit must be 1 to \(maxLimit)") }
        guard let start = fixed(dtstart, "YYYY-MM-DDThh:mm:ssZ") else { throw fail("dtstart must be YYYY-MM-DDTHH:MM:SSZ") }
        let r = try parseRule(rule)
        let startDay = floorDiv(Int(start), 86400), tod = Int64(mod(Int(start), 86400))
        let (sy, sm, sd) = HttpConditional.civilFromDays(startDay)
        let startWeekday = mod(startDay + 3, 7)  // 1970-01-01 was a Thursday; Monday = 0
        let lastDay = HttpConditional.daysFromCivil(9999, 12, 31)
        // dateutil defaults apply only when no day-level filter is given.
        var byDay = r.byDay, byMonthDay = r.byMonthDay, byMonth = r.byMonth
        if byDay.isEmpty && byMonthDay.isEmpty {
            switch r.freq {
            case .daily: break
            case .weekly: byDay = [(0, startWeekday)]
            case .monthly: byMonthDay = [sd]
            case .yearly: byMonthDay = [sd]; if byMonth.isEmpty { byMonth = [sm] }
            }
        }
        let monthScope = r.freq == .monthly || (r.freq == .yearly && !r.byMonth.isEmpty)
        var monthSet = [Bool](repeating: byMonth.isEmpty, count: 13)
        for m in byMonth { monthSet[m] = true }

        /// Whether a civil day passes every filter; `doy`/`ylen` give its position in the year for year-scoped ordinals.
        func matches(_ day: Int, _ y: Int, _ m: Int, _ d: Int, _ nd: Int, _ doy: Int, _ ylen: Int) -> Bool {
            if !monthSet[m] { return false }
            if !byMonthDay.isEmpty && !byMonthDay.contains(where: { d == ($0 > 0 ? $0 : nd + $0 + 1) }) { return false }
            if !byDay.isEmpty {
                let wd = mod(day + 3, 7)
                return byDay.contains { n, w in
                    guard w == wd else { return false }
                    if n == 0 { return true }
                    let (pos, len) = monthScope ? (d, nd) : (doy, ylen)
                    return n > 0 ? (pos - 1) / 7 + 1 == n : (len - pos) / 7 + 1 == -n
                }
            }
            return true
        }
        func yearLength(_ y: Int) -> Int { HttpConditional.daysFromCivil(y + 1, 1, 1) - HttpConditional.daysFromCivil(y, 1, 1) }
        /// Matching days of every day in months mo0...mo1 of year y, in order.
        func monthsHits(_ y: Int, _ mo0: Int, _ mo1: Int) -> [Int] {
            var hits: [Int] = []
            let jan1 = HttpConditional.daysFromCivil(y, 1, 1), ylen = yearLength(y)
            for mo in mo0...mo1 where monthSet[mo] {
                let first = HttpConditional.daysFromCivil(y, mo, 1), nd = daysInMonth(y, mo)
                for d in 1...nd where matches(first + d - 1, y, mo, d, nd, first + d - jan1, ylen) { hits.append(first + d - 1) }
            }
            return hits
        }
        func dayHit(_ day: Int) -> Bool {
            let (y, m, d) = HttpConditional.civilFromDays(day)
            return matches(day, y, m, d, daysInMonth(y, m), day - HttpConditional.daysFromCivil(y, 1, 1) + 1, yearLength(y))
        }
        func at(_ day: Int) -> Int64 { Int64(day) * 86400 + tod }
        var out: [Int64] = []

        periods: for k in 0..<maxPeriods {
            let firstDay: Int, hits: [Int]
            switch r.freq {
            case .daily:
                firstDay = startDay + k * r.interval
                if firstDay > lastDay { break periods }
                hits = dayHit(firstDay) ? [firstDay] : []
            case .weekly:
                firstDay = startDay - startWeekday + 7 * k * r.interval
                if firstDay > lastDay { break periods }
                hits = (firstDay..<firstDay + 7).filter { $0 <= lastDay && dayHit($0) }
            case .monthly:
                let mi = sm - 1 + k * r.interval, y = sy + mi / 12, mo = mi % 12 + 1
                if y > 9999 { break periods }
                firstDay = HttpConditional.daysFromCivil(y, mo, 1)
                hits = monthsHits(y, mo, mo)
            case .yearly:
                let y = sy + k * r.interval
                if y > 9999 { break periods }
                firstDay = HttpConditional.daysFromCivil(y, 1, 1)
                hits = monthsHits(y, 1, 12)
            }
            for c in hits.map(at) where c >= start {
                if let u = r.until, c > u { break periods }
                out.append(c)
                if let n = r.count, out.count >= n { break periods }
                if out.count >= limit { break periods }
            }
            if let u = r.until, at(firstDay) > u { break periods }
        }
        return out.map(format)
    }
}
