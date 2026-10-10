// SPDX-License-Identifier: Apache-2.0
// Check-digit validation: Luhn (payment cards), IBAN (ISO 13616 mod 97), GTIN-8/12/13/14 (EAN/UPC) and ISBN-10/13.
// Validators return false for malformed input; generators and formatters throw CheckDigitError.

public enum CheckDigitError: Error, Equatable {
    case invalidArgument(String)
}

public enum CheckDigits {
    private static func isDigit(_ c: UInt8) -> Bool { c >= 0x30 && c <= 0x39 }
    private static func isUpper(_ c: UInt8) -> Bool { c >= 0x41 && c <= 0x5A }
    private static func upper(_ c: UInt8) -> UInt8 { c >= 0x61 && c <= 0x7A ? c - 32 : c }

    /// Input without ASCII spaces and hyphens.
    private static func stripped(_ s: String) -> [UInt8] { s.utf8.filter { $0 != 0x20 && $0 != 0x2D } }

    private static func luhnOk(_ t: [UInt8]) -> Bool {
        guard t.count >= 2, t.allSatisfy(isDigit) else { return false }
        var total = 0
        for (i, c) in t.reversed().enumerated() {
            var d = Int(c - 0x30)
            if i % 2 == 1 { d *= 2; if d > 9 { d -= 9 } }
            total += d
        }
        return total % 10 == 0
    }

    /// Luhn check after removing spaces and hyphens; requires at least two ASCII digits.
    public static func luhnValid(_ s: String) -> Bool { luhnOk(stripped(s)) }

    /// The digit that makes `payload + digit` pass the Luhn check.
    public static func luhnCheckDigit(_ payload: String) throws -> String {
        let t = stripped(payload)
        guard !t.isEmpty, t.allSatisfy(isDigit) else { throw CheckDigitError.invalidArgument("payload must be ASCII digits") }
        for d in UInt8(0x30)...UInt8(0x39) where luhnOk(t + [d]) { return String(UnicodeScalar(d)) }
        throw CheckDigitError.invalidArgument("no Luhn check digit")
    }

    private static func ibanCompact(_ s: String) -> [UInt8] { s.utf8.filter { $0 != 0x20 }.map(upper) }

    private static func ibanOk(_ t: [UInt8]) -> Bool {
        guard (15...34).contains(t.count), isUpper(t[0]), isUpper(t[1]), isDigit(t[2]), isDigit(t[3]),
              t[4...].allSatisfy({ isUpper($0) || isDigit($0) }) else { return false }
        var rem = 0
        for c in t[4...] + t[..<4] {
            let v = isDigit(c) ? Int(c - 0x30) : Int(c) - 55
            rem = (rem * (v > 9 ? 100 : 10) + v) % 97
        }
        return rem == 1
    }

    /// IBAN check: spaces removed, case-insensitive, `[A-Z]{2}[0-9]{2}[A-Z0-9]{11,30}`, mod 97 == 1.
    public static func ibanValid(_ s: String) -> Bool { ibanOk(ibanCompact(s)) }

    /// A valid IBAN in uppercase groups of four separated by single spaces.
    public static func ibanFormat(_ s: String) throws -> String {
        let t = ibanCompact(s)
        guard ibanOk(t) else { throw CheckDigitError.invalidArgument("invalid IBAN") }
        return stride(from: 0, to: t.count, by: 4).map { String(decoding: t[$0..<min($0 + 4, t.count)], as: UTF8.self) }
            .joined(separator: " ")
    }

    private static func gtinOk(_ t: [UInt8]) -> Bool {
        guard [8, 12, 13, 14].contains(t.count), t.allSatisfy(isDigit) else { return false }
        var total = 0
        for (i, c) in t.reversed().enumerated() { total += Int(c - 0x30) * (i % 2 == 1 ? 3 : 1) }
        return total % 10 == 0
    }

    /// GTIN-8/12/13/14 (EAN/UPC): weights 1,3,1,3... from the rightmost (check) digit.
    public static func gtinValid(_ s: String) -> Bool { gtinOk(stripped(s)) }

    private static func isbn10Ok(_ t: [UInt8]) -> Bool {
        guard t.count == 10, t[..<9].allSatisfy(isDigit), isDigit(t[9]) || t[9] == 0x58 else { return false }
        var total = 0
        for (i, c) in t.enumerated() { total += (10 - i) * (c == 0x58 ? 10 : Int(c - 0x30)) }
        return total % 11 == 0
    }

    /// ISBN-10: nine digits then a digit or X, weighted sum mod 11 == 0.
    public static func isbn10Valid(_ s: String) -> Bool { isbn10Ok(stripped(s).map(upper)) }

    /// ISBN-13: a 978/979-prefixed GTIN-13.
    public static func isbn13Valid(_ s: String) -> Bool {
        let t = stripped(s)
        return t.count == 13 && (t[..<3].elementsEqual("978".utf8) || t[..<3].elementsEqual("979".utf8)) && gtinOk(t)
    }

    /// Converts a valid ISBN-10 to its 978-prefixed ISBN-13 (digits only).
    public static func isbn10To13(_ s: String) throws -> String {
        let t = stripped(s).map(upper)
        guard isbn10Ok(t) else { throw CheckDigitError.invalidArgument("invalid ISBN-10") }
        let body = Array("978".utf8) + t[..<9]
        for d in UInt8(0x30)...UInt8(0x39) where gtinOk(body + [d]) { return String(decoding: body + [d], as: UTF8.self) }
        throw CheckDigitError.invalidArgument("no GTIN check digit")
    }
}
