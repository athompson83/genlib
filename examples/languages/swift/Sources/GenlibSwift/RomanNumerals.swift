// SPDX-License-Identifier: Apache-2.0
// Roman numerals 1..3999 in the standard subtractive form. fromRoman is case-insensitive and accepts only the canonical
// form (so "IIII", "IC", "VX" and "" are rejected).

public enum RomanNumeralsError: Error, Equatable {
    case outOfRange(Int)
    case invalid(String)
}

public enum RomanNumerals {
    private static let pairs: [(Int, String)] = [
        (1000, "M"), (900, "CM"), (500, "D"), (400, "CD"), (100, "C"), (90, "XC"), (50, "L"),
        (40, "XL"), (10, "X"), (9, "IX"), (5, "V"), (4, "IV"), (1, "I"),
    ]
    private static let values: [UInt32: Int] = [0x49: 1, 0x56: 5, 0x58: 10, 0x4C: 50, 0x43: 100, 0x44: 500, 0x4D: 1000]

    /// Formats 1..3999 as an uppercase Roman numeral.
    public static func toRoman(_ n: Int) throws -> String {
        guard (1...3999).contains(n) else { throw RomanNumeralsError.outOfRange(n) }
        var n = n, out = ""
        for (v, s) in pairs { while n >= v { out += s; n -= v } }
        return out
    }

    /// Parses a canonical Roman numeral (any case) to its value.
    public static func fromRoman(_ text: String) throws -> Int {
        let u = text.uppercased()
        let cps = u.unicodeScalars.map(\.value)
        guard !cps.isEmpty, cps.allSatisfy({ values[$0] != nil }) else { throw RomanNumeralsError.invalid("not a roman numeral") }
        var total = 0
        for (i, c) in cps.enumerated() {
            let v = values[c]!
            total += i + 1 < cps.count && values[cps[i + 1]]! > v ? -v : v
        }
        guard (1...3999).contains(total), try toRoman(total) == u else { throw RomanNumeralsError.invalid("not a canonical roman numeral") }
        return total
    }
}
