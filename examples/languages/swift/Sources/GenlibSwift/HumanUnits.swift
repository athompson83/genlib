// SPDX-License-Identifier: Apache-2.0
// Human-readable sizes, durations and relative times using integer arithmetic only (round half up), so results are
// identical in every language: formatBytes (SI kB.. or IEC KiB..), parseBytes, formatDuration and relativeTime.

public enum HumanUnitsError: Error, Equatable {
    case invalidArgument(String)
}

public enum ByteBase {
    case si, iec
}

public enum HumanUnits {
    private static func fail(_ message: String) -> HumanUnitsError { .invalidArgument(message) }

    /// floor(n / d + 1/2) without overflow.
    private static func roundDiv(_ n: UInt64, _ d: UInt64) -> UInt64 { n / d + (n % d >= d - n % d ? 1 : 0) }

    /// round half up of n * scale / d with a 128-bit intermediate product.
    private static func scaledRound(_ n: UInt64, _ scale: UInt64, _ d: UInt64) -> UInt64 {
        let product = n.multipliedFullWidth(by: scale)
        let (q, r) = d.dividingFullWidth(product)
        return q + (r >= d - r ? 1 : 0)
    }

    /// "<n> B" below one unit, else the largest fitting unit with up to `decimals` (0...3) digits, trailing zeros removed.
    public static func formatBytes(_ n: Int64, base: ByteBase = .si, decimals: Int = 1) throws -> String {
        guard n >= 0 else { throw fail("byte count must be >= 0") }
        guard (0...3).contains(decimals) else { throw fail("decimals must be 0...3") }
        let units = base == .si ? ["B", "kB", "MB", "GB", "TB", "PB", "EB"] : ["B", "KiB", "MiB", "GiB", "TiB", "PiB", "EiB"]
        let step: UInt64 = base == .si ? 1000 : 1024
        let value = UInt64(n)
        if value < step { return "\(n) B" }
        func power(_ i: Int) -> UInt64 { (0..<i).reduce(1) { acc, _ in acc * step } }
        var i = 1
        while i < 6 && value >= power(i + 1) { i += 1 }
        var scale: UInt64 = 1
        for _ in 0..<decimals { scale *= 10 }
        var v = scaledRound(value, scale, power(i))
        if v >= step * scale && i < 6 { i += 1; v = scaledRound(value, scale, power(i)) }
        var text = String(v / scale)
        if decimals > 0 {
            var frac = String(v % scale)
            frac = String(repeating: "0", count: decimals - frac.count) + frac
            while frac.hasSuffix("0") { frac.removeLast() }
            if !frac.isEmpty { text += "." + frac }
        }
        return "\(text) \(units[i])"
    }

    private static let unitTable: [String: UInt64] = [
        "": 1, "b": 1, "kb": 1_000, "mb": 1_000_000, "gb": 1_000_000_000, "tb": 1_000_000_000_000,
        "pb": 1_000_000_000_000_000, "eb": 1_000_000_000_000_000_000,
        "kib": 1 << 10, "mib": 1 << 20, "gib": 1 << 30, "tib": 1 << 40, "pib": 1 << 50, "eib": 1 << 60,
    ]

    private static func isSpace(_ s: Unicode.Scalar) -> Bool { s.properties.isWhitespace || (0x1C...0x1F).contains(s.value) }

    /// Parses "<digits>[.<digits>] [unit]" (b, kb..eb powers of 1000, kib..eib powers of 1024; case-insensitive) into
    /// bytes, rounded half up. Throws for signs, exponents, a leading ".", unknown units or more than 2^63-1 bytes.
    public static func parseBytes(_ text: String) throws -> Int64 {
        let s = Array(text.unicodeScalars)
        var i = 0
        func isDigit(_ k: Int) -> Bool { k < s.count && s[k].value >= 0x30 && s[k].value <= 0x39 }
        func isLetter(_ k: Int) -> Bool { k < s.count && ((s[k].value | 0x20) >= 0x61 && (s[k].value | 0x20) <= 0x7A) }
        while i < s.count && isSpace(s[i]) { i += 1 }
        var digits: [UInt8] = []
        while isDigit(i) { digits.append(UInt8(s[i].value - 0x30)); i += 1 }
        guard !digits.isEmpty else { throw fail("invalid byte size: \(text)") }
        var fracCount = 0
        if i < s.count && s[i] == "." {
            i += 1
            while isDigit(i) { digits.append(UInt8(s[i].value - 0x30)); i += 1; fracCount += 1 }
            guard fracCount > 0 else { throw fail("invalid byte size: \(text)") }
        }
        while i < s.count && isSpace(s[i]) { i += 1 }
        var unit = ""
        while isLetter(i) { unit.unicodeScalars.append(Unicode.Scalar(s[i].value | 0x20)!); i += 1 }
        while i < s.count && isSpace(s[i]) { i += 1 }
        guard i == s.count, let mult = unitTable[unit] else { throw fail("invalid byte size: \(text)") }
        // Decimal digits (most significant first) times mult: each step stays below 10 * mult <= 1.2e19 < 2^64.
        var product: [UInt64] = []
        var carry: UInt64 = 0
        for d in digits.reversed() {
            let x = UInt64(d) * mult + carry
            product.append(x % 10); carry = x / 10
        }
        while carry > 0 { product.append(carry % 10); carry /= 10 }
        // result = floor((floor(2 * num * mult / 10^f) + 1) / 2); doubling first, then drop f decimal digits.
        var doubled: [UInt64] = [], c: UInt64 = 0
        for d in product { let x = d * 2 + c; doubled.append(x % 10); c = x / 10 }
        if c > 0 { doubled.append(c) }
        var z: UInt64 = 0
        for d in doubled.dropFirst(fracCount).reversed() {
            let (m, o1) = z.multipliedReportingOverflow(by: 10)
            let (a, o2) = m.addingReportingOverflow(d)
            guard !o1 && !o2 else { throw fail("byte size exceeds 2^63-1") }
            z = a
        }
        guard z < UInt64.max else { throw fail("byte size exceeds 2^63-1") }
        let r = (z + 1) / 2
        guard r <= UInt64(Int64.max) else { throw fail("byte size exceeds 2^63-1") }
        return Int64(r)
    }

    /// "<ms>ms" below one second, else the two largest non-zero units of d, h, m, s ("1h 2m", "45s").
    public static func formatDuration(_ ms: Int64) throws -> String {
        guard ms >= 0 else { throw fail("duration must be >= 0") }
        if ms < 1000 { return "\(ms)ms" }
        var s = ms / 1000
        var parts: [String] = []
        for (name, size) in [("d", Int64(86400)), ("h", 3600), ("m", 60), ("s", 1)] {
            let q = s / size
            s %= size
            if q > 0 { parts.append("\(q)\(name)") }
        }
        return parts.prefix(2).joined(separator: " ")
    }

    /// "just now", "in 3 minutes", "2 months ago" ... for a signed delta in seconds (positive = future).
    public static func relativeTime(_ deltaSeconds: Int64) -> String {
        let a = deltaSeconds.magnitude
        let phrase: String
        if a < 45 { return "just now" }
        else if a < 90 { phrase = "a minute" }
        else if a < 45 * 60 { phrase = "\(roundDiv(a, 60)) minutes" }
        else if a < 90 * 60 { phrase = "an hour" }
        else if a < 22 * 3600 { phrase = "\(roundDiv(a, 3600)) hours" }
        else if a < 36 * 3600 { phrase = "a day" }
        else if a < 26 * 86400 { phrase = "\(roundDiv(a, 86400)) days" }
        else if a < 46 * 86400 { phrase = "a month" }
        else if a < 320 * 86400 { phrase = "\(roundDiv(a, 2_629_746)) months" }
        else if a < 548 * 86400 { phrase = "a year" }
        else { phrase = "\(roundDiv(a, 31_556_952)) years" }
        return deltaSeconds > 0 ? "in \(phrase)" : "\(phrase) ago"
    }
}
