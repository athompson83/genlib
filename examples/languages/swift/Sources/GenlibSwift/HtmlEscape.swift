// SPDX-License-Identifier: Apache-2.0
// HTML escaping for text and quoted attributes, unescaping of character references (decimal with 1-10 digits, hex with
// 1-8 digits, ";" required; 0, surrogates and values above U+10FFFF become U+FFFD; 0x80-0x9F map through the HTML5
// windows-1252 table) and a fixed set of named references (case-sensitive, ";" required). stripTags is for plain-text
// previews only: it is NOT a sanitizer and its output must never be rendered as HTML.

public enum HtmlEscape {
    private static let named: [String: UInt32] = [
        "amp": 0x26, "lt": 0x3C, "gt": 0x3E, "quot": 0x22, "apos": 0x27, "nbsp": 0xA0, "copy": 0xA9, "reg": 0xAE,
        "trade": 0x2122, "hellip": 0x2026, "mdash": 0x2014, "ndash": 0x2013, "lsquo": 0x2018, "rsquo": 0x2019,
        "ldquo": 0x201C, "rdquo": 0x201D, "bull": 0x2022, "middot": 0xB7, "deg": 0xB0, "plusmn": 0xB1, "times": 0xD7,
        "divide": 0xF7, "euro": 0x20AC, "pound": 0xA3, "yen": 0xA5, "cent": 0xA2, "sect": 0xA7, "para": 0xB6,
        "laquo": 0xAB, "raquo": 0xBB, "iexcl": 0xA1, "iquest": 0xBF, "shy": 0xAD,
    ]
    private static let c1: [UInt32: UInt32] = [
        0x80: 0x20AC, 0x82: 0x201A, 0x83: 0x0192, 0x84: 0x201E, 0x85: 0x2026, 0x86: 0x2020, 0x87: 0x2021, 0x88: 0x02C6,
        0x89: 0x2030, 0x8A: 0x0160, 0x8B: 0x2039, 0x8C: 0x0152, 0x8E: 0x017D, 0x91: 0x2018, 0x92: 0x2019, 0x93: 0x201C,
        0x94: 0x201D, 0x95: 0x2022, 0x96: 0x2013, 0x97: 0x2014, 0x98: 0x02DC, 0x99: 0x2122, 0x9A: 0x0161, 0x9B: 0x203A,
        0x9C: 0x0153, 0x9E: 0x017E, 0x9F: 0x0178,
    ]

    private static func text<S: Sequence>(_ cps: S) -> String where S.Element == UInt32 {
        var s = String.UnicodeScalarView()
        for c in cps { s.append(Unicode.Scalar(c)!) }
        return String(s)
    }

    private static func isDigit(_ c: UInt32) -> Bool { (0x30...0x39).contains(c) }
    private static func isHex(_ c: UInt32) -> Bool { isDigit(c) || (0x41...0x46).contains(c) || (0x61...0x66).contains(c) }
    private static func isLetter(_ c: UInt32) -> Bool { (0x41...0x5A).contains(c) || (0x61...0x7A).contains(c) }

    /// Escapes & < > " ' for HTML text and single- or double-quoted attribute values.
    public static func escape(_ s: String) -> String {
        var out = ""
        for ch in s.unicodeScalars {
            switch ch {
            case "&": out += "&amp;"
            case "<": out += "&lt;"
            case ">": out += "&gt;"
            case "\"": out += "&quot;"
            case "'": out += "&#39;"
            default: out.unicodeScalars.append(ch)
            }
        }
        return out
    }

    private static func numeric(_ v: UInt64) -> UInt32 {
        if v == 0 || (0xD800...0xDFFF).contains(v) || v > 0x10FFFF { return 0xFFFD }
        return c1[UInt32(v)] ?? UInt32(v)
    }

    /// Matches &(#[xX][0-9A-Fa-f]{1,8}|#[0-9]{1,10}|[A-Za-z][A-Za-z0-9]{0,31}); at i; returns (end, replacement).
    private static func reference(_ t: [UInt32], _ i: Int) -> (Int, [UInt32])? {
        guard t[i] == 0x26, i + 1 < t.count else { return nil }
        func run(_ from: Int, _ ok: (UInt32) -> Bool) -> Int {
            var j = from
            while j < t.count && ok(t[j]) { j += 1 }
            return j
        }
        if t[i + 1] == 0x23 {
            if i + 2 < t.count && (t[i + 2] == 0x78 || t[i + 2] == 0x58) {
                let s = i + 3, e = run(s, isHex)
                guard (1...8).contains(e - s), e < t.count, t[e] == 0x3B else { return nil }
                return (e + 1, [numeric(UInt64(text(t[s..<e]), radix: 16)!)])
            }
            let s = i + 2, e = run(s, isDigit)
            guard (1...10).contains(e - s), e < t.count, t[e] == 0x3B else { return nil }
            return (e + 1, [numeric(UInt64(text(t[s..<e]))!)])
        }
        guard isLetter(t[i + 1]) else { return nil }
        let e = run(i + 1) { isLetter($0) || isDigit($0) }
        guard e - (i + 1) <= 32, e < t.count, t[e] == 0x3B else { return nil }
        guard let v = named[text(t[(i + 1)..<e])] else { return (e + 1, Array(t[i...e])) }
        return (e + 1, [v])
    }

    private static func unescape(_ t: [UInt32]) -> [UInt32] {
        var out: [UInt32] = [], i = 0
        while i < t.count {
            if let (e, rep) = reference(t, i) { out += rep; i = e } else { out.append(t[i]); i += 1 }
        }
        return out
    }

    /// Decodes numeric and the fixed named character references; anything else is left as is.
    public static func unescape(_ s: String) -> String { text(unescape(s.unicodeScalars.map(\.value))) }

    // Python str.isspace() code points (the reference's \s).
    private static func isSpace(_ c: UInt32) -> Bool {
        switch c {
        case 9...13, 0x1C...0x20, 0x85, 0xA0, 0x1680, 0x2000...0x200A, 0x2028, 0x2029, 0x202F, 0x205F, 0x3000: return true
        default: return false
        }
    }

    private static func isWord(_ c: UInt32) -> Bool {
        if c < 0x80 { return isLetter(c) || isDigit(c) || c == 0x5F }
        switch Unicode.Scalar(c)?.properties.generalCategory {
        case .uppercaseLetter, .lowercaseLetter, .titlecaseLetter, .modifierLetter, .otherLetter,
             .decimalNumber, .letterNumber, .otherNumber: return true
        default: return false
        }
    }

    // Case-insensitive match against a lowercase ASCII letter, including the non-ASCII case partners Python's
    // re.IGNORECASE accepts (U+0130/U+0131 for i, U+017F for s).
    private static func ci(_ c: UInt32, _ letter: UInt32) -> Bool {
        c == letter || c == letter - 32 || (letter == 0x69 && (c == 0x130 || c == 0x131)) || (letter == 0x73 && c == 0x17F)
    }

    private static func word(_ t: [UInt32], _ at: Int, _ w: [UInt32]) -> Bool {
        guard at + w.count <= t.count else { return false }
        return w.indices.allSatisfy { ci(t[at + $0], w[$0]) }
    }

    /// Removes <script>/<style> elements with their content (to the matching close tag or the end of input).
    private static func dropRawText(_ t: [UInt32]) -> [UInt32] {
        var out: [UInt32] = [], i = 0
        outer: while i < t.count {
            if t[i] == 0x3C {
                for w in [Array("script".unicodeScalars.map(\.value)), Array("style".unicodeScalars.map(\.value))] {
                    let e = i + 1 + w.count
                    guard word(t, i + 1, w), e >= t.count || !isWord(t[e]) else { continue }
                    guard let gt = t[e...].firstIndex(of: 0x3E) else { continue }
                    // Lazy scan for "</name\s*>" or the end of input ("$" also matches before a final newline).
                    var q = gt + 1
                    while q <= t.count {
                        if q + 1 < t.count && t[q] == 0x3C && t[q + 1] == 0x2F && word(t, q + 2, w) {
                            var r = q + 2 + w.count
                            while r < t.count && isSpace(t[r]) { r += 1 }
                            if r < t.count && t[r] == 0x3E { i = r + 1; continue outer }
                        }
                        if q == t.count || (q == t.count - 1 && t[q] == 0x0A) { i = q; continue outer }
                        q += 1
                    }
                }
            }
            out.append(t[i]); i += 1
        }
        return out
    }

    /// Removes <[A-Za-z/!?][^>]*> tags.
    private static func dropTags(_ t: [UInt32]) -> [UInt32] {
        var out: [UInt32] = [], i = 0
        while i < t.count {
            if t[i] == 0x3C, i + 1 < t.count, isLetter(t[i + 1]) || [0x2F, 0x21, 0x3F].contains(t[i + 1]),
               let gt = t[(i + 1)...].firstIndex(of: 0x3E) {
                i = gt + 1
            } else {
                out.append(t[i]); i += 1
            }
        }
        return out
    }

    /// Plain-text preview: drops script/style contents, removes tags, then unescapes. NOT an HTML sanitizer.
    public static func stripTags(_ s: String) -> String { text(unescape(dropTags(dropRawText(s.unicodeScalars.map(\.value))))) }
}
