// SPDX-License-Identifier: Apache-2.0
// Text cleanup for user-supplied strings: newline normalization, removal of control, bidirectional (Trojan Source,
// CVE-2021-42574) and invisible characters, code-point truncation and whitespace collapsing. U+200C/U+200D are kept
// because emoji sequences and Indic/Persian text need them.

public struct SanitizeOptions: Equatable {
    public var allowNewlines: Bool
    public var maxLength: Int?  // in code points
    public init(allowNewlines: Bool = true, maxLength: Int? = nil) { self.allowNewlines = allowNewlines; self.maxLength = maxLength }
}

public struct BidiControl: Equatable, CustomStringConvertible {
    public var index: Int  // code point index
    public var codePoint: String  // uppercase hex, at least 4 digits
    public init(_ index: Int, _ codePoint: String) { self.index = index; self.codePoint = codePoint }
    public var description: String { "[\(index), \(codePoint)]" }
}

public enum TextSanitize {
    public static let bidiControls: Set<UInt32> = [0x061C, 0x200E, 0x200F, 0x202A, 0x202B, 0x202C, 0x202D, 0x202E, 0x2066, 0x2067, 0x2068, 0x2069]
    private static let invisible: Set<UInt32> = [0x200B, 0x2060, 0xFEFF]

    public static func sanitizeText(_ text: String, _ options: SanitizeOptions = SanitizeOptions()) -> String {
        let s = Array(text.unicodeScalars)
        var out = String.UnicodeScalarView(), kept = 0, i = 0
        while i < s.count {
            if let limit = options.maxLength, kept >= limit { break }
            var v = s[i].value
            if v == 0x0D { v = 0x0A; if i + 1 < s.count && s[i + 1].value == 0x0A { i += 1 } }
            i += 1
            if v == 0x0A {
                out.append(options.allowNewlines ? "\n" : " ")
            } else if v == 0x09 {
                out.append("\t")
            } else if v < 0x20 || (0x7F...0x9F).contains(v) || bidiControls.contains(v) || invisible.contains(v) {
                continue
            } else {
                out.append(Unicode.Scalar(v)!)
            }
            kept += 1
        }
        return String(out)
    }

    /// Bidirectional control characters with their code point index, e.g. [24, "202E"].
    public static func findBidiControls(_ text: String) -> [BidiControl] {
        text.unicodeScalars.enumerated().compactMap { i, s in
            guard bidiControls.contains(s.value) else { return nil }
            let hex = String(s.value, radix: 16, uppercase: true)
            return BidiControl(i, String(repeating: "0", count: max(0, 4 - hex.count)) + hex)
        }
    }

    /// Collapses runs of space, tab, LF, CR, FF and VT into one space and trims spaces at both ends.
    public static func normalizeWhitespace(_ text: String) -> String {
        var out = String.UnicodeScalarView(), pending = false
        for s in text.unicodeScalars {
            if [0x20, 0x09, 0x0A, 0x0D, 0x0C, 0x0B].contains(s.value) { pending = true; continue }
            if pending && !out.isEmpty { out.append(" ") }
            pending = false
            out.append(s)
        }
        return String(out)
    }
}
