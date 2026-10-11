// SPDX-License-Identifier: Apache-2.0
// RFC 3492 Punycode (base 36, tmin 1, tmax 26, skew 38, damp 700, initial bias 72, initial n 128, delimiter "-") with
// 31-bit overflow checks, plus simplified IDNA-style domain conversion. Strings are processed by Unicode scalar. The
// domain helpers lowercase ASCII letters only and apply NO Unicode normalization and NO IDNA (UTS #46) mapping:
// normalize (NFC, case-fold) first when you need that.

public enum PunycodeError: Error, Equatable {
    case invalid(String)
}

public enum Punycode {
    private static let base = 36, tmin = 1, tmax = 26, skew = 38, damp = 700, initialBias = 72, initialN = 128
    private static let maxInt = 0x7FFF_FFFF

    private static func adapt(_ delta: Int, _ numPoints: Int, _ first: Bool) -> Int {
        var delta = first ? delta / damp : delta / 2
        delta += delta / numPoints
        var k = 0
        while delta > ((base - tmin) * tmax) / 2 { delta /= base - tmin; k += base }
        return k + (base - tmin + 1) * delta / (delta + skew)
    }

    private static func digit(_ d: Int) -> UInt32 { UInt32(d + 22 + (d < 26 ? 75 : 0)) }
    private static func threshold(_ k: Int, _ bias: Int) -> Int { k <= bias ? tmin : (k >= bias + tmax ? tmax : k - bias) }
    private static func text(_ cps: [UInt32]) -> String {
        var s = String.UnicodeScalarView()
        for c in cps { s.append(Unicode.Scalar(c)!) }
        return String(s)
    }

    /// Encodes a Unicode string to Punycode (no "xn--" prefix).
    public static func encode(_ input: String) throws -> String {
        let cps = input.unicodeScalars.map { Int($0.value) }
        var out: [UInt32] = cps.filter { $0 < 0x80 }.map { UInt32($0) }
        let b = out.count
        var h = b
        if b > 0 { out.append(0x2D) }
        var n = initialN, delta = 0, bias = initialBias
        while h < cps.count {
            let m = cps.filter { $0 >= n }.min()!
            if (m - n) * (h + 1) > maxInt - delta { throw PunycodeError.invalid("overflow") }
            delta += (m - n) * (h + 1)
            n = m
            for c in cps {
                if c < n {
                    delta += 1
                    if delta > maxInt { throw PunycodeError.invalid("overflow") }
                }
                if c == n {
                    var q = delta, k = base
                    while true {
                        let t = threshold(k, bias)
                        if q < t { break }
                        out.append(digit(t + (q - t) % (base - t)))
                        q = (q - t) / (base - t)
                        k += base
                    }
                    out.append(digit(q))
                    bias = adapt(delta, h + 1, h == b)
                    delta = 0
                    h += 1
                }
            }
            delta += 1
            n += 1
        }
        return text(out)
    }

    private static func value(_ c: UInt32) throws -> Int {
        switch c {
        case 48...57: return Int(c) - 22
        case 65...90: return Int(c) - 65
        case 97...122: return Int(c) - 97
        default: throw PunycodeError.invalid("invalid digit")
        }
    }

    /// Decodes a Punycode string (either digit case) to Unicode; throws on invalid digits, overflow or truncation.
    public static func decode(_ input: String) throws -> String {
        let s = input.unicodeScalars.map(\.value)
        let i = s.lastIndex(of: 0x2D) ?? -1
        var out: [UInt32] = []
        if i > 0 {
            for c in s[0..<i] {
                if c >= 0x80 { throw PunycodeError.invalid("non-basic code point") }
                out.append(c)
            }
        }
        var pos = i >= 0 ? i + 1 : 0
        var n = initialN, idx = 0, bias = initialBias
        while pos < s.count {
            let old = idx
            var w = 1, k = base
            while true {
                if pos >= s.count { throw PunycodeError.invalid("truncated input") }
                let d = try value(s[pos])
                pos += 1
                if d > (maxInt - idx) / w { throw PunycodeError.invalid("overflow") }
                idx += d * w
                let t = threshold(k, bias)
                if d < t { break }
                if w > maxInt / (base - t) { throw PunycodeError.invalid("overflow") }
                w *= base - t
                k += base
            }
            let len = out.count + 1
            bias = adapt(idx - old, len, old == 0)
            if idx / len > maxInt - n { throw PunycodeError.invalid("overflow") }
            n += idx / len
            idx %= len
            if n > 0x10FFFF || (0xD800...0xDFFF).contains(n) { throw PunycodeError.invalid("invalid code point") }
            out.insert(UInt32(n), at: idx)
            idx += 1
        }
        return text(out)
    }

    private static func split(_ s: [UInt32]) -> [[UInt32]] { s.split(separator: 0x2E, omittingEmptySubsequences: false).map(Array.init) }

    /// Converts a domain to ASCII ("xn--" labels); lowercases ASCII only, no normalization or IDNA mapping.
    public static func domainToAscii(_ domain: String) throws -> String {
        var d = domain.unicodeScalars.map(\.value)
        let trailing = d.last == 0x2E && d.count > 1
        if trailing { d.removeLast() }
        var res: [String] = []
        for label in split(d) {
            if label.isEmpty { throw PunycodeError.invalid("empty label") }
            let lower = label.map { (0x41...0x5A).contains($0) ? $0 + 32 : $0 }
            var a = text(lower)
            if lower.contains(where: { $0 >= 0x80 }) { a = "xn--" + (try encode(a)) }
            if a.unicodeScalars.count > 63 { throw PunycodeError.invalid("label too long") }
            res.append(a)
        }
        let out = res.joined(separator: ".")
        if out.unicodeScalars.count > 253 { throw PunycodeError.invalid("name too long") }
        return trailing ? out + "." : out
    }

    /// Decodes each "xn--" label (case-insensitive prefix) of a domain; no normalization or IDNA mapping.
    public static func domainToUnicode(_ domain: String) throws -> String {
        try split(domain.unicodeScalars.map(\.value)).map { label -> String in
            let p = label.prefix(4).map { (0x41...0x5A).contains($0) ? $0 + 32 : $0 }
            return p == [0x78, 0x6E, 0x2D, 0x2D] ? try decode(text(Array(label.dropFirst(4)))) : text(label)
        }.joined(separator: ".")
    }
}
