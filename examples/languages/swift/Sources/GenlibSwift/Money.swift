// SPDX-License-Identifier: Apache-2.0
// Money as integer minor units (ISO 4217 exponents): exact decimal parsing, half-to-even rate application and
// remainder-preserving allocation. Integer arithmetic only; overflow throws instead of trapping or wrapping.

public enum MoneyError: Error, Equatable {
    case invalidArgument(String)
    case overflow
}

public enum Money {
    private static let exponents: [String: Int] = {
        var map: [String: Int] = [:]
        for c in ["USD", "EUR", "GBP", "CAD", "AUD", "CHF", "CNY", "INR", "MXN", "BRL", "SEK", "NOK", "DKK", "NZD", "SGD", "HKD", "ZAR"] { map[c] = 2 }
        for c in ["JPY", "KRW", "VND", "CLP", "ISK"] { map[c] = 0 }
        for c in ["BHD", "KWD", "JOD", "OMR", "TND"] { map[c] = 3 }
        return map
    }()

    /// Minor-unit exponent for a supported ISO 4217 code (case-sensitive).
    public static func exponent(_ currency: String) throws -> Int {
        guard let e = exponents[currency] else { throw MoneyError.invalidArgument("unsupported currency: \(currency)") }
        return e
    }

    /// Parses `-?DIGITS(.DIGITS)?` into sign and digit bytes.
    private static func parseDecimal(_ value: String) -> (negative: Bool, int: [UInt8], frac: [UInt8])? {
        var bytes = Array(value.utf8)[...]
        let negative = bytes.first == 0x2D
        if negative { bytes = bytes.dropFirst() }
        let parts = bytes.split(separator: 0x2E, maxSplits: 1, omittingEmptySubsequences: false)
        let isDigits = { (s: ArraySlice<UInt8>) in s.allSatisfy { $0 >= 0x30 && $0 <= 0x39 } }
        guard let int = parts.first, !int.isEmpty, isDigits(int) else { return nil }
        let frac = parts.count > 1 ? parts[1] : []
        guard isDigits(frac), parts.count == 1 || !frac.isEmpty else { return nil }
        return (negative, Array(int), Array(frac))
    }

    /// Accumulates digits (frac right-padded with zeros to `scale`) into a magnitude.
    private static func magnitude(_ int: [UInt8], _ frac: [UInt8], scale: Int) throws -> UInt64 {
        var n: UInt64 = 0
        for b in int + frac + Array(repeating: 0x30, count: scale - frac.count) {
            let (m, o1) = n.multipliedReportingOverflow(by: 10)
            let (s, o2) = m.addingReportingOverflow(UInt64(b - 0x30))
            if o1 || o2 { throw MoneyError.overflow }
            n = s
        }
        return n
    }

    private static func signed(_ magnitude: UInt64, negative: Bool) throws -> Int64 {
        if negative {
            guard magnitude <= UInt64(Int64.max) + 1 else { throw MoneyError.overflow }
            return Int64(truncatingIfNeeded: 0 &- magnitude)
        }
        guard magnitude <= UInt64(Int64.max) else { throw MoneyError.overflow }
        return Int64(magnitude)
    }

    /// Exact decimal string to minor units; never rounds.
    public static func toMinor(_ amount: String, currency: String) throws -> Int64 {
        let exp = try exponent(currency)
        guard let (negative, int, frac) = parseDecimal(amount) else { throw MoneyError.invalidArgument("invalid amount: \(amount)") }
        guard frac.count <= exp else { throw MoneyError.invalidArgument("\(currency) allows at most \(exp) fraction digits: \(amount)") }
        return try signed(magnitude(int, frac, scale: exp), negative: negative)
    }

    /// Minor units to a plain decimal string (no symbol or grouping).
    public static func formatMinor(_ minor: Int64, currency: String) throws -> String {
        let exp = try exponent(currency)
        let sign = minor < 0 ? "-" : ""
        let abs = minor.magnitude
        if exp == 0 { return sign + String(abs) }
        var div: UInt64 = 1
        for _ in 0..<exp { div *= 10 }
        let frac = String(abs % div)
        return "\(sign)\(abs / div).\(String(repeating: "0", count: exp - frac.count))\(frac)"
    }

    /// Multiplies by a decimal rate (at most 9 fraction digits) and rounds half to even on the exact product.
    public static func applyRate(_ minor: Int64, rate: String) throws -> Int64 {
        guard let (negative, int, frac) = parseDecimal(rate) else { throw MoneyError.invalidArgument("invalid rate: \(rate)") }
        guard frac.count <= 9 else { throw MoneyError.invalidArgument("rate allows at most 9 fraction digits") }
        let num = try magnitude(int, frac, scale: frac.count)
        var scale: UInt64 = 1
        for _ in 0..<frac.count { scale *= 10 }
        let product = minor.magnitude.multipliedFullWidth(by: num)
        guard product.high < scale else { throw MoneyError.overflow }
        var (q, r) = scale.dividingFullWidth(product)
        if r > scale - r || (r == scale - r && q % 2 == 1) {
            let (next, o) = q.addingReportingOverflow(1)
            if o { throw MoneyError.overflow }
            q = next
        }
        return try signed(q, negative: (minor < 0) != negative && q != 0)
    }

    /// Splits `total` by non-negative integer ratios with the largest-remainder method: shares are
    /// floor(|total| * r / sum) and leftover units go one each to the entries with the largest remainder
    /// (|total| * r mod sum), ties to the lower index. Negative totals are allocated by magnitude and negated.
    /// The result always sums to `total`.
    public static func allocate(_ total: Int64, ratios: [Int]) throws -> [Int64] {
        guard !ratios.isEmpty else { throw MoneyError.invalidArgument("ratios must not be empty") }
        guard ratios.allSatisfy({ $0 >= 0 }) else { throw MoneyError.invalidArgument("ratios must be non-negative") }
        var sum: UInt64 = 0
        for r in ratios {
            let (s, o) = sum.addingReportingOverflow(UInt64(r))
            if o { throw MoneyError.overflow }
            sum = s
        }
        guard sum > 0 else { throw MoneyError.invalidArgument("ratios must have a positive sum") }
        let abs = total.magnitude
        // r <= sum, so each quotient is at most |total| and fits in UInt64.
        let divided = ratios.map { sum.dividingFullWidth(abs.multipliedFullWidth(by: UInt64($0))) }
        var shares = divided.map { $0.quotient }
        let left = abs - shares.reduce(0, +) // left < ratios.count
        // Sort by remainder descending, then index ascending, so ties go to the lower index.
        let order = shares.indices.sorted {
            divided[$0].remainder != divided[$1].remainder ? divided[$0].remainder > divided[$1].remainder : $0 < $1
        }
        for i in order.prefix(Int(left)) { shares[i] += 1 }
        return try shares.map { try signed($0, negative: total < 0) }
    }
}
