// SPDX-License-Identifier: Apache-2.0
// ISO 8601 week dates (weeks start Monday; week 1 holds the year's first Thursday) over the proleptic Gregorian calendar,
// years 1..9999, with plain day arithmetic (no Calendar/DateFormatter). Invalid dates and out-of-range weeks throw.

public enum IsoWeekError: Error, Equatable {
    case invalid(String)
}

public enum IsoWeek {
    private static func daysFromCivil(_ y0: Int, _ m: Int, _ d: Int) -> Int {
        let y = m <= 2 ? y0 - 1 : y0
        let era = (y >= 0 ? y : y - 399) / 400
        let yoe = y - era * 400
        let doy = (153 * (m > 2 ? m - 3 : m + 9) + 2) / 5 + d - 1
        let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy
        return era * 146097 + doe - 719468
    }

    private static func civil(_ z0: Int) -> (year: Int, month: Int, day: Int) {
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

    private static func dayNumber(_ y: Int, _ m: Int, _ d: Int) throws -> Int {
        let leap = y % 4 == 0 && (y % 100 != 0 || y % 400 == 0)
        let dim = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
        guard y >= 1, y <= 9999, m >= 1, m <= 12, d >= 1, d <= dim[m - 1] else { throw IsoWeekError.invalid("invalid date \(y)-\(m)-\(d)") }
        return daysFromCivil(y, m, d)
    }

    /// 1=Monday..7=Sunday; day 0 (1970-01-01) was a Thursday.
    private static func weekday(_ z: Int) -> Int { ((z % 7 + 7) % 7 + 3) % 7 + 1 }

    /// (weekYear, week, weekday 1=Mon..7=Sun) for a calendar date.
    public static func isoWeek(_ year: Int, _ month: Int, _ day: Int) throws -> (weekYear: Int, week: Int, weekday: Int) {
        let z = try dayNumber(year, month, day)
        let wd = weekday(z), thursday = z - wd + 4
        let wy = civil(thursday).year
        return (wy, (thursday - daysFromCivil(wy, 1, 1)) / 7 + 1, wd)
    }

    /// 52 or 53: the number of ISO weeks in a year (1..9999).
    public static func weeksInYear(_ year: Int) throws -> Int { try isoWeek(year, 12, 28).week }

    /// The calendar date of an ISO week date; week must be 1..weeksInYear and weekday 1..7.
    public static func fromIsoWeek(_ weekYear: Int, _ week: Int, _ weekday: Int) throws -> (year: Int, month: Int, day: Int) {
        guard weekYear >= 1, weekYear <= 9999, weekday >= 1, weekday <= 7, week >= 1, week <= (try weeksInYear(weekYear)) else {
            throw IsoWeekError.invalid("invalid ISO week date")
        }
        let jan4 = daysFromCivil(weekYear, 1, 4)
        let r = civil(jan4 - (self.weekday(jan4) - 1) + (week - 1) * 7 + weekday - 1)
        guard r.year >= 1, r.year <= 9999 else { throw IsoWeekError.invalid("date out of range") }
        return r
    }

    private static func pad(_ v: Int, _ n: Int) -> String { let s = String(v); return String(repeating: "0", count: max(0, n - s.count)) + s }

    /// "YYYY-Www-D" for a calendar date.
    public static func format(_ year: Int, _ month: Int, _ day: Int) throws -> String {
        let w = try isoWeek(year, month, day)
        return "\(pad(w.weekYear, 4))-W\(pad(w.week, 2))-\(w.weekday)"
    }

    /// Parses "YYYY-Www-D", "YYYYWwwD" or "YYYY-Www" (weekday 1) to a calendar date.
    public static func parse(_ s: String) throws -> (year: Int, month: Int, day: Int) {
        let c = codePoints(s)
        let digit: (UInt32) -> Bool = { $0 >= 0x30 && $0 <= 0x39 }
        let num: (ArraySlice<UInt32>) -> Int = { $0.reduce(0) { $0 * 10 + Int($1 - 0x30) } }
        let bad = IsoWeekError.invalid("not an ISO week date")
        guard c.count >= 7, c[0..<4].allSatisfy(digit) else { throw bad }
        var i = 4
        if c[i] == 0x2D { i += 1 }
        guard i + 3 <= c.count, c[i] == 0x57, digit(c[i + 1]), digit(c[i + 2]) else { throw bad }
        let week = num(c[(i + 1)..<(i + 3)])
        var rest = c[(i + 3)...], wd = 1
        if rest.count == 2 && rest.first == 0x2D { rest = rest.dropFirst() }
        if rest.count == 1, let x = rest.first, x >= 0x31, x <= 0x37 { wd = Int(x - 0x30) } else if !rest.isEmpty { throw bad }
        return try fromIsoWeek(num(c[0..<4]), week, wd)
    }
}
