// SPDX-License-Identifier: Apache-2.0
// English number words, US style without "and": cardinals for |n| < 10^15 ("forty-two", "one hundred five",
// "one million one", "negative seven"), ordinal words ("twenty-first", "hundredth", "zeroth"), numeric ordinal suffixes
// ("11th", "-22nd") and amounts of money from minor units ("one dollar and one cent").

public enum NumberWordsError: Error, Equatable {
    case outOfRange(String)
}

public enum NumberWords {
    private static let ones = [
        "zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten",
        "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen",
    ]
    private static let tens = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"]
    private static let scales = ["", "thousand", "million", "billion", "trillion"]
    private static let irregular = [
        "one": "first", "two": "second", "three": "third", "five": "fifth", "eight": "eighth", "nine": "ninth", "twelve": "twelfth",
    ]
    private static let limit: Int64 = 1_000_000_000_000_000

    private static func under1000(_ value: Int64) -> String {
        var n = Int(value), parts: [String] = []
        if n >= 100 { parts.append(ones[n / 100] + " hundred"); n %= 100 }
        if n >= 20 { parts.append(tens[n / 10] + (n % 10 != 0 ? "-" + ones[n % 10] : "")) } else if n > 0 { parts.append(ones[n]) }
        return parts.joined(separator: " ")
    }

    /// Cardinal words (|n| < 10^15).
    public static func words(_ n: Int64) throws -> String {
        guard n < limit, n > -limit else { throw NumberWordsError.outOfRange("range") }
        if n == 0 { return "zero" }
        if n < 0 { return "negative " + (try words(-n)) }
        var groups: [String] = [], rest = n, i = 0
        while rest > 0 {
            let g = rest % 1000
            if g != 0 { groups.append(under1000(g) + (scales[i].isEmpty ? "" : " " + scales[i])) }
            rest /= 1000
            i += 1
        }
        return groups.reversed().joined(separator: " ")
    }

    private static func ordinal(_ w: Substring) -> String {
        if let irr = irregular[String(w)] { return irr }
        if w.hasSuffix("y") { return w.dropLast() + "ieth" }
        return w + "th"
    }

    /// Ordinal words for n >= 0 ("twenty-first").
    public static func ordinalWords(_ n: Int64) throws -> String {
        guard n >= 0 else { throw NumberWordsError.outOfRange("range") }
        var parts = try words(n).split(separator: " ").map(String.init)
        let last = parts[parts.count - 1]
        if let dash = last.firstIndex(of: "-") {
            parts[parts.count - 1] = last[..<dash] + "-" + ordinal(last[last.index(after: dash)...])
        } else {
            parts[parts.count - 1] = ordinal(Substring(last))
        }
        return parts.joined(separator: " ")
    }

    /// The number with its English ordinal suffix ("1st", "12th", "-22nd").
    public static func ordinalSuffix(_ n: Int64) -> String {
        let a = n.magnitude
        let suffix: String
        if (11...13).contains(a % 100) {
            suffix = "th"
        } else {
            switch a % 10 {
            case 1: suffix = "st"
            case 2: suffix = "nd"
            case 3: suffix = "rd"
            default: suffix = "th"
            }
        }
        return String(n) + suffix
    }

    /// Money words for minor units ("twelve dollars and one cent"); exponent is the number of minor digits (0...3).
    public static func money(minor: Int64, major: String, minorName: String, exponent: Int = 2) throws -> String {
        guard minor >= 0, (0...3).contains(exponent) else { throw NumberWordsError.outOfRange("bad") }
        var unit: Int64 = 1
        for _ in 0..<exponent { unit *= 10 }
        let whole = minor / unit, frac = minor % unit
        var out = try words(whole) + " " + major + (whole == 1 ? "" : "s")
        if exponent != 0 && frac != 0 { out += " and " + (try words(frac)) + " " + minorName + (frac == 1 ? "" : "s") }
        return out
    }
}
