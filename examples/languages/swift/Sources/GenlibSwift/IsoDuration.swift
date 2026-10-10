// SPDX-License-Identifier: Apache-2.0
// ISO 8601 durations: P(nY)(nM)(nW)(nD)(T(nH)(nM)(n[.fff]S)), uppercase only, hand-parsed with 64-bit overflow checks.
// Exact lengths treat a week as 7 days and a day as 24 hours; years and months are calendar-dependent and rejected.

public enum DurationError: Error, Equatable {
    case invalidArgument(String)
}

public struct IsoDurationParts: Equatable, Sendable {
    public var years: Int64, months: Int64, weeks: Int64, days: Int64, hours: Int64, minutes: Int64, milliseconds: Int64
    public init(years: Int64 = 0, months: Int64 = 0, weeks: Int64 = 0, days: Int64 = 0, hours: Int64 = 0, minutes: Int64 = 0,
                milliseconds: Int64 = 0) {
        self.years = years; self.months = months; self.weeks = weeks; self.days = days
        self.hours = hours; self.minutes = minutes; self.milliseconds = milliseconds
    }
}

public enum IsoDuration {
    private static func bad(_ s: String) -> DurationError { .invalidArgument("invalid ISO 8601 duration: \(s.debugDescription)") }

    private static func mul(_ a: Int64, _ b: Int64) throws -> Int64 {
        let (r, o) = a.multipliedReportingOverflow(by: b)
        guard !o else { throw DurationError.invalidArgument("duration overflows 64 bits") }
        return r
    }

    private static func add(_ a: Int64, _ b: Int64) throws -> Int64 {
        let (r, o) = a.addingReportingOverflow(b)
        guard !o else { throw DurationError.invalidArgument("duration overflows 64 bits") }
        return r
    }

    /// Parses a duration; fractions (1-3 digits) are allowed on seconds only.
    public static func parseDuration(_ s: String) throws -> IsoDurationParts {
        let b = Array(s.utf8)
        guard b.first == 0x50 else { throw bad(s) }
        var i = 1
        func number() throws -> Int64 {
            let start = i
            var n: Int64 = 0
            while i < b.count, b[i] >= 0x30, b[i] <= 0x39 { n = try add(mul(n, 10), Int64(b[i] - 0x30)); i += 1 }
            guard i > start, i < b.count else { throw bad(s) }
            return n
        }
        var p = IsoDurationParts()
        var any = false
        var next = 0
        let datePart: [UInt8] = Array("YMWD".utf8)
        while i < b.count, b[i] != 0x54 {
            let n = try number()
            guard let k = datePart[next...].firstIndex(of: b[i]) else { throw bad(s) }
            switch k { case 0: p.years = n; case 1: p.months = n; case 2: p.weeks = n; default: p.days = n }
            next = k + 1; i += 1; any = true
        }
        if i < b.count {
            i += 1
            guard i < b.count else { throw bad(s) }
            let timePart: [UInt8] = Array("HMS".utf8)
            next = 0
            while i < b.count {
                let n = try number()
                var frac: Int64 = 0
                if b[i] == 0x2E {
                    i += 1
                    var digits = 0
                    while i < b.count, b[i] >= 0x30, b[i] <= 0x39, digits < 3 { frac = frac * 10 + Int64(b[i] - 0x30); digits += 1; i += 1 }
                    guard digits > 0, i < b.count, b[i] == 0x53 else { throw bad(s) }
                    for _ in digits..<3 { frac *= 10 }
                }
                guard let k = timePart[next...].firstIndex(of: b[i]) else { throw bad(s) }
                switch k { case 0: p.hours = n; case 1: p.minutes = n; default: p.milliseconds = try add(mul(n, 1000), frac) }
                next = k + 1; i += 1; any = true
            }
        }
        guard any else { throw bad(s) }
        return p
    }

    /// Exact length in milliseconds; throws when years or months are non-zero (calendar-dependent).
    public static func durationMilliseconds(_ p: IsoDurationParts) throws -> Int64 {
        guard p.years == 0, p.months == 0 else { throw DurationError.invalidArgument("years and months have no exact length") }
        guard [p.weeks, p.days, p.hours, p.minutes, p.milliseconds].allSatisfy({ $0 >= 0 }) else {
            throw DurationError.invalidArgument("duration parts must be non-negative")
        }
        let days = try add(mul(p.weeks, 7), p.days)
        let minutes = try add(mul(try add(mul(days, 24), p.hours), 60), p.minutes)
        return try add(mul(minutes, 60_000), p.milliseconds)
    }

    /// Formats non-negative milliseconds as days, hours, minutes and seconds (up to 3 fractional digits); 0 is "PT0S".
    public static func formatDuration(milliseconds ms: Int64) throws -> String {
        guard ms >= 0 else { throw DurationError.invalidArgument("milliseconds must be non-negative") }
        let d = ms / 86_400_000, h = ms % 86_400_000 / 3_600_000, m = ms % 3_600_000 / 60_000
        let sec = ms % 60_000 / 1000, f = ms % 1000
        var out = "P" + (d > 0 ? "\(d)D" : "")
        var t = (h > 0 ? "\(h)H" : "") + (m > 0 ? "\(m)M" : "")
        if sec > 0 || f > 0 {
            t += "\(sec)"
            if f > 0 {
                var frac = String(f)
                frac = String(repeating: "0", count: 3 - frac.count) + frac
                while frac.hasSuffix("0") { frac.removeLast() }
                t += "." + frac
            }
            t += "S"
        }
        if !t.isEmpty { out += "T" + t }
        return out == "P" ? "PT0S" : out
    }
}
