// SPDX-License-Identifier: Apache-2.0
// Next run time for a standard 5-field cron expression, evaluated in UTC. Fields: minute, hour, day-of-month, month,
// day-of-week (0 and 7 = Sunday); each a comma list of `*`, `N` or `A-B` with optional `/step`. When both day fields
// are restricted (neither starts with `*`) a day matches if EITHER matches (Vixie cron).

public enum CronError: Error, Equatable {
    case invalidArgument(String)
}

public enum CronNext {
    private static let searchDays: Int64 = 5 * 366

    private static func number(_ s: Substring, _ name: String, _ lo: Int, _ hi: Int) throws -> Int {
        guard !s.isEmpty, s.count <= 2, s.utf8.allSatisfy({ $0 >= 0x30 && $0 <= 0x39 }), let n = Int(s) else {
            throw CronError.invalidArgument("invalid \(name) value \"\(s)\"")
        }
        guard n >= lo, n <= hi else { throw CronError.invalidArgument("\(name) value \(n) is outside \(lo)-\(hi)") }
        return n
    }

    /// Parses one field into a bitset of allowed values.
    private static func field(_ text: Substring, _ name: String, _ lo: Int, _ hi: Int) throws -> UInt64 {
        var bits: UInt64 = 0
        for item in text.split(separator: ",", omittingEmptySubsequences: false) {
            let parts = item.split(separator: "/", maxSplits: 1, omittingEmptySubsequences: false)
            let range = parts[0]
            var step: Int? = nil
            if parts.count == 2 {
                guard let s = try? number(parts[1], name, 1, max(hi, 1)) else { throw CronError.invalidArgument("invalid \(name) step \"\(parts[1])\"") }
                step = s
            }
            var a: Int, b: Int
            if range == "*" {
                (a, b) = (lo, hi)
            } else if let dash = range.firstIndex(of: "-") {
                a = try number(range[..<dash], name, lo, hi)
                b = try number(range[range.index(after: dash)...], name, lo, hi)
                guard a <= b else { throw CronError.invalidArgument("\(name) range \"\(range)\" is reversed") }
            } else {
                a = try number(range, name, lo, hi)
                b = step == nil ? a : hi
            }
            while a <= b {
                bits |= 1 << UInt64(a)
                a += step ?? 1
            }
        }
        return bits
    }

    private static func floorDiv(_ a: Int64, _ b: Int64) -> Int64 { a >= 0 ? a / b : -((-a + b - 1) / b) }
    private static func mod(_ a: Int64, _ b: Int64) -> Int64 { ((a % b) + b) % b }

    static func civilFromDays(_ days: Int64) -> (Int64, Int64, Int64) {
        let z = days + 719_468
        let era = floorDiv(z, 146_097)
        let doe = z - era * 146_097
        let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146_096) / 365
        let doy = doe - (365 * yoe + yoe / 4 - yoe / 100)
        let mp = (5 * doy + 2) / 153
        let d = doy - (153 * mp + 2) / 5 + 1
        let m = mp < 10 ? mp + 3 : mp - 9
        return (yoe + era * 400 + (m <= 2 ? 1 : 0), m, d)
    }

    private static func digits(_ b: ArraySlice<UInt8>) -> Int64? {
        guard !b.isEmpty, b.count <= 18, b.allSatisfy({ $0 >= 0x30 && $0 <= 0x39 }) else { return nil }
        return b.reduce(0) { $0 * 10 + Int64($1 - 0x30) }
    }

    /// Parses `YYYY-MM-DDTHH:MM[:SS[.fff]]Z` to whole minutes since the epoch (seconds truncated).
    private static func parseUTCMinutes(_ s: String) throws -> Int64 {
        let bad = CronError.invalidArgument("after must be an ISO-8601 UTC time like 2026-10-10T12:00:00Z: \"\(s)\"")
        let b = Array(s.utf8)
        guard b.count >= 17, b[4] == 0x2D, b[7] == 0x2D, b[10] == 0x54, b[13] == 0x3A, b.last == 0x5A else { throw bad }
        let tail = b[16..<(b.count - 1)]
        if !tail.isEmpty {
            guard tail.first == 0x3A else { throw bad }
            let secs = tail.dropFirst()
            let dot = secs.firstIndex(of: 0x2E)
            let whole = secs[..<(dot ?? secs.endIndex)]
            guard whole.count == 2, let sec = digits(whole), sec <= 59 else { throw bad }
            if let dot { guard digits(secs[(dot + 1)...]) != nil else { throw bad } }
        }
        guard let y = digits(b[0..<4]), let mo = digits(b[5..<7]), let d = digits(b[8..<10]),
              let h = digits(b[11..<13]), let mi = digits(b[14..<16]) else { throw bad }
        guard (1...12).contains(mo), d >= 1, d <= RetryBackoff.daysInMonth(y, mo), h <= 23, mi <= 59 else { throw bad }
        return (RetryBackoff.daysFromCivil(y, mo, d) * 24 + h) * 60 + mi
    }

    private static func pad(_ n: Int64, _ width: Int) -> String {
        let s = String(n)
        return String(repeating: "0", count: max(0, width - s.count)) + s
    }

    /// First minute strictly after `afterIsoUtc` matching `expression`, as `YYYY-MM-DDTHH:MM:00Z`.
    /// Throws if nothing matches within 5 years (for example `0 0 31 2 *`).
    public static func nextRun(_ expression: String, after afterIsoUtc: String) throws -> String {
        let f = expression.split(whereSeparator: { $0 == " " || $0 == "\t" })
        guard f.count == 5 else { throw CronError.invalidArgument("cron expression must have 5 fields: minute hour day-of-month month day-of-week") }
        let minute = try field(f[0], "minute", 0, 59), hour = try field(f[1], "hour", 0, 23)
        let dom = try field(f[2], "day-of-month", 1, 31), month = try field(f[3], "month", 1, 12)
        var dow = try field(f[4], "day-of-week", 0, 7)
        if dow & (1 << 7) != 0 { dow = (dow | 1) & ~(1 << 7) }
        let eitherDay = !f[2].hasPrefix("*") && !f[4].hasPrefix("*")

        let start = try parseUTCMinutes(afterIsoUtc) + 1
        let limit = start + searchDays * 1440
        var t = start
        while t <= limit {
            let days = floorDiv(t, 1440)
            let (y, m, d) = civilFromDays(days)
            if month & (1 << UInt64(m)) == 0 {
                t = RetryBackoff.daysFromCivil(m == 12 ? y + 1 : y, m == 12 ? 1 : m + 1, 1) * 1440
                continue
            }
            let domOK = dom & (1 << UInt64(d)) != 0, dowOK = dow & (1 << UInt64(mod(days + 4, 7))) != 0
            guard eitherDay ? (domOK || dowOK) : (domOK && dowOK) else {
                t = (days + 1) * 1440
                continue
            }
            let minuteOfDay = mod(t, 1440)
            let (h, mi) = (minuteOfDay / 60, minuteOfDay % 60)
            if hour & (1 << UInt64(h)) == 0 {
                t = days * 1440 + (h + 1) * 60
                continue
            }
            if minute & (1 << UInt64(mi)) == 0 {
                t += 1
                continue
            }
            guard (0...9999).contains(y) else { throw CronError.invalidArgument("next run is outside years 0000-9999") }
            return "\(pad(y, 4))-\(pad(m, 2))-\(pad(d, 2))T\(pad(h, 2)):\(pad(mi, 2)):00Z"
        }
        throw CronError.invalidArgument("no matching time within 5 years")
    }
}
