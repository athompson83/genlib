// SPDX-License-Identifier: Apache-2.0
// Retry timing: exponential backoff with "full jitter" and HTTP Retry-After parsing (delay-seconds or IMF-fixdate).
// The random fraction and the current time are injected so results are deterministic.

public enum BackoffError: Error, Equatable {
    case invalidArgument(String)
}

public enum RetryBackoff {
    /// floor(randomFraction * min(capMs, baseMs * 2^attempt)); the exponential term is capped before it can overflow.
    public static func backoffDelay(attempt: Int, baseMs: UInt64, capMs: UInt64, randomFraction: Double) throws -> UInt64 {
        guard attempt >= 0 else { throw BackoffError.invalidArgument("attempt must be non-negative") }
        guard baseMs > 0 else { throw BackoffError.invalidArgument("baseMs must be positive") }
        guard capMs >= baseMs else { throw BackoffError.invalidArgument("capMs must be at least baseMs") }
        guard randomFraction >= 0, randomFraction < 1 else { throw BackoffError.invalidArgument("randomFraction must be in [0, 1)") }
        var ceiling = baseMs
        var i = 0
        while i < attempt && ceiling < capMs {
            let (doubled, overflow) = ceiling.multipliedReportingOverflow(by: 2)
            ceiling = overflow ? UInt64.max : doubled
            i += 1
        }
        ceiling = min(ceiling, capMs)
        let delay = (randomFraction * Double(ceiling)).rounded(.down)
        return delay >= Double(ceiling) ? ceiling - 1 : UInt64(delay)
    }

    private static let days = ["Thu", "Fri", "Sat", "Sun", "Mon", "Tue", "Wed"]
    private static let months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

    /// Days since 1970-01-01 for a proleptic Gregorian date (Howard Hinnant's algorithm).
    static func daysFromCivil(_ year: Int64, _ month: Int64, _ day: Int64) -> Int64 {
        let y = month <= 2 ? year - 1 : year
        let era = (y >= 0 ? y : y - 399) / 400
        let yoe = y - era * 400
        let doy = (153 * (month > 2 ? month - 3 : month + 9) + 2) / 5 + day - 1
        let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy
        return era * 146_097 + doe - 719_468
    }

    static func daysInMonth(_ y: Int64, _ m: Int64) -> Int64 {
        switch m {
        case 2: return (y % 4 == 0 && y % 100 != 0) || y % 400 == 0 ? 29 : 28
        case 4, 6, 9, 11: return 30
        default: return 31
        }
    }

    private static func digits(_ b: ArraySlice<UInt8>) -> Int64? {
        guard !b.isEmpty, b.count <= 18, b.allSatisfy({ $0 >= 0x30 && $0 <= 0x39 }) else { return nil }
        return b.reduce(0) { $0 * 10 + Int64($1 - 0x30) }
    }

    /// IMF-fixdate such as `Wed, 21 Oct 2026 07:28:00 GMT` to unix milliseconds.
    private static func parseIMFFixdate(_ s: String) -> Int64? {
        let b = Array(s.utf8)
        guard b.count == 29, b[3] == 0x2C, b[4] == 0x20, b[7] == 0x20, b[11] == 0x20, b[16] == 0x20, b[19] == 0x3A, b[22] == 0x3A,
              Array(b[25...]) == Array(" GMT".utf8) else { return nil }
        guard let day = digits(b[5..<7]), let year = digits(b[12..<16]),
              let monthIndex = months.firstIndex(of: String(decoding: b[8..<11], as: UTF8.self)),
              let h = digits(b[17..<19]), let mi = digits(b[20..<22]), let sec = digits(b[23..<25]) else { return nil }
        let month = Int64(monthIndex + 1)
        guard day >= 1, day <= daysInMonth(year, month), h <= 23, mi <= 59, sec <= 60 else { return nil }
        let d = daysFromCivil(year, month, day)
        guard days[Int(((d % 7) + 7) % 7)] == String(decoding: b[0..<3], as: UTF8.self) else { return nil }
        return ((d * 24 + h) * 60 + mi) * 60_000 + sec * 1000
    }

    /// Milliseconds to wait for a Retry-After value: delay-seconds become seconds * 1000; an IMF-fixdate becomes
    /// max(0, date - nowMs). Returns nil for anything else (other date formats, negative or overflowing numbers).
    public static func retryAfterMs(_ headerValue: String, nowMs: Int64) -> UInt64? {
        let value = String(headerValue.drop(while: { $0 == " " || $0 == "\t" }).reversed().drop(while: { $0 == " " || $0 == "\t" }).reversed())
        let b = Array(value.utf8)
        if !b.isEmpty, b.allSatisfy({ $0 >= 0x30 && $0 <= 0x39 }) {
            guard let seconds = UInt64(value) else { return nil }
            let (ms, overflow) = seconds.multipliedReportingOverflow(by: 1000)
            return overflow ? nil : ms
        }
        guard let at = parseIMFFixdate(value) else { return nil }
        return at > nowMs ? UInt64(bitPattern: at &- nowMs) : 0 // exact: the true difference is positive and below 2^64
    }
}
