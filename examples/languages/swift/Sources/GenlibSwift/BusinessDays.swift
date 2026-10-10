// SPDX-License-Identifier: Apache-2.0
// Business days over strict ISO dates ("YYYY-MM-DD", proleptic Gregorian, years 0001-9999) with a configurable weekend
// (two-letter days MO..SU, never all seven) and holiday list. Plain civil-date arithmetic, no Calendar/DateFormatter.

public enum BusinessDaysError: Error, Equatable {
    case invalidArgument(String)
}

public enum BusinessDays {
    private static let weekdays = ["MO", "TU", "WE", "TH", "FR", "SA", "SU"]
    private static let maxSteps = 100_000

    private static func daysFromCivil(_ y0: Int, _ m: Int, _ d: Int) -> Int {
        let y = m <= 2 ? y0 - 1 : y0
        let era = (y >= 0 ? y : y - 399) / 400
        let yoe = y - era * 400
        let doy = (153 * (m > 2 ? m - 3 : m + 9) + 2) / 5 + d - 1
        let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy
        return era * 146097 + doe - 719468
    }

    private static func civil(_ z0: Int) -> (Int, Int, Int) {
        let z = z0 + 719468
        let era = (z >= 0 ? z : z - 146096) / 146097
        let doe = z - era * 146097
        let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365
        let doy = doe - (365 * yoe + yoe / 4 - yoe / 100)
        let mp = (5 * doy + 2) / 153
        let d = doy - (153 * mp + 2) / 5 + 1
        let m = mp < 10 ? mp + 3 : mp - 9
        return (m <= 2 ? yoe + era * 400 + 1 : yoe + era * 400, m, d)
    }

    private static let minDay = daysFromCivil(1, 1, 1), maxDay = daysFromCivil(9999, 12, 31)

    private static func parse(_ s: String) throws -> Int {
        let b = Array(s.utf8)
        let digit: (Int) -> Bool = { b[$0] >= 0x30 && b[$0] <= 0x39 }
        guard b.count == 10, b[4] == 0x2D, b[7] == 0x2D, [0, 1, 2, 3, 5, 6, 8, 9].allSatisfy(digit) else {
            throw BusinessDaysError.invalidArgument("date must be YYYY-MM-DD")
        }
        let num: (Int, Int) -> Int = { from, to in (from..<to).reduce(0) { $0 * 10 + Int(b[$1] - 0x30) } }
        let y = num(0, 4), m = num(5, 7), d = num(8, 10)
        let leap = (y % 4 == 0 && y % 100 != 0) || y % 400 == 0
        let dim = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
        guard y >= 1, m >= 1, m <= 12, d >= 1, d <= dim[m - 1] else { throw BusinessDaysError.invalidArgument("invalid date \(s)") }
        return daysFromCivil(y, m, d)
    }

    private static func format(_ day: Int) -> String {
        let (y, m, d) = civil(day)
        func pad(_ v: Int, _ w: Int) -> String { let s = String(v); return String(repeating: "0", count: max(0, w - s.count)) + s }
        return "\(pad(y, 4))-\(pad(m, 2))-\(pad(d, 2))"
    }

    /// Monday = 0 ... Sunday = 6 (1970-01-01 was a Thursday).
    private static func weekday(_ day: Int) -> Int { ((day + 3) % 7 + 7) % 7 }

    private static func config(_ holidays: [String], _ weekend: [String]) throws -> (Set<Int>, Set<Int>) {
        var w = Set<Int>()
        for x in weekend {
            guard let i = weekdays.firstIndex(of: x) else { throw BusinessDaysError.invalidArgument("weekend days are MO..SU") }
            w.insert(i)
        }
        guard w.count < 7 else { throw BusinessDaysError.invalidArgument("weekend cannot be every day") }
        return (Set(try holidays.map(parse)), w)
    }

    /// True when date is neither a weekend day nor a holiday.
    public static func isBusinessDay(_ date: String, holidays: [String] = [], weekend: [String] = ["SA", "SU"]) throws -> Bool {
        let (h, w) = try config(holidays, weekend)
        let d = try parse(date)
        return !w.contains(weekday(d)) && !h.contains(d)
    }

    /// The date n business days after date (before it when n < 0); n == 0 returns date when it is a business day,
    /// otherwise the next one. Throws for |n| > 100000 or a result outside years 0001-9999.
    public static func addBusinessDays(_ date: String, _ n: Int, holidays: [String] = [], weekend: [String] = ["SA", "SU"]) throws -> String {
        guard n >= -maxSteps && n <= maxSteps else { throw BusinessDaysError.invalidArgument("n must be an integer within ±100000") }
        let (h, w) = try config(holidays, weekend)
        var d = try parse(date)
        let ok: (Int) -> Bool = { !w.contains(weekday($0)) && !h.contains($0) }
        func step(_ by: Int) throws {
            d += by
            guard d >= minDay && d <= maxDay else { throw BusinessDaysError.invalidArgument("date out of range") }
        }
        if n == 0 {
            while !ok(d) { try step(1) }
            return format(d)
        }
        var left = abs(n)
        while left > 0 {
            try step(n > 0 ? 1 : -1)
            if ok(d) { left -= 1 }
        }
        return format(d)
    }

    /// Business days in [start, end) (start counted, end not); negative when end is before start. O(1) in the span.
    public static func businessDaysBetween(_ start: String, _ end: String, holidays: [String] = [], weekend: [String] = ["SA", "SU"]) throws -> Int {
        let (h, w) = try config(holidays, weekend)
        var a = try parse(start), b = try parse(end), sign = 1
        if b < a { swap(&a, &b); sign = -1 }
        let days = b - a, full = days / 7, rem = days % 7
        var count = full * (7 - w.count)
        for i in 0..<rem where !w.contains(weekday(a + full * 7 + i)) { count += 1 }
        count -= h.filter { $0 >= a && $0 < b && !w.contains(weekday($0)) }.count
        return sign * count
    }
}
