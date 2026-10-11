// SPDX-License-Identifier: Apache-2.0
// Shared internal helpers for the wave 10 text and header modules: code point arrays (so indexing matches one Unicode
// scalar, never a grapheme cluster such as "\r\n"), Python-compatible whitespace, RFC 9110 tokens, percent-decoding to
// bytes, strict UTF-8 and RFC 8187 extended values.

/// Unicode scalars of a string as code points.
func codePoints(_ s: String) -> [UInt32] { s.unicodeScalars.map(\.value) }

/// A string from code points (invalid scalars become U+FFFD).
func fromCodePoints<C: Collection>(_ c: C) -> String where C.Element == UInt32 {
    var v = String.UnicodeScalarView()
    for x in c { v.append(Unicode.Scalar(x) ?? "\u{FFFD}") }
    return String(v)
}

/// Python str.isspace() for one code point.
func isSpace(_ c: UInt32) -> Bool {
    switch c {
    case 0x09...0x0D, 0x1C...0x20, 0x85, 0xA0, 0x1680, 0x2000...0x200A, 0x2028, 0x2029, 0x202F, 0x205F, 0x3000: return true
    default: return false
    }
}

/// Code points with leading and trailing whitespace removed.
func stripSpace(_ s: ArraySlice<UInt32>) -> ArraySlice<UInt32> {
    var a = s.startIndex, b = s.endIndex
    while a < b && isSpace(s[a]) { a += 1 }
    while b > a && isSpace(s[b - 1]) { b -= 1 }
    return s[a..<b]
}

/// A string with leading and trailing whitespace removed.
func trimWhitespace(_ s: String) -> String { fromCodePoints(stripSpace(codePoints(s)[...])) }

/// ASCII lowercase of code points.
func asciiLower<C: Collection>(_ c: C) -> [UInt32] where C.Element == UInt32 { c.map { $0 >= 0x41 && $0 <= 0x5A ? $0 + 32 : $0 } }

/// RFC 9110 tchar.
func isTchar(_ c: UInt32) -> Bool {
    if (c >= 0x30 && c <= 0x39) || (c >= 0x41 && c <= 0x5A) || (c >= 0x61 && c <= 0x7A) { return true }
    return [0x21, 0x23, 0x24, 0x25, 0x26, 0x27, 0x2A, 0x2B, 0x2D, 0x2E, 0x5E, 0x5F, 0x60, 0x7C, 0x7E].contains(c)
}

/// End index of the token starting at i (== i when there is none).
func tokenEnd(_ s: [UInt32], _ i: Int) -> Int {
    var j = i
    while j < s.count && isTchar(s[j]) { j += 1 }
    return j
}

/// Whether the string is a non-empty RFC 9110 token.
func isToken(_ s: String) -> Bool { let c = codePoints(s); return !c.isEmpty && c.allSatisfy(isTchar) }

func isHexByte(_ b: UInt8) -> Bool { (b >= 0x30 && b <= 0x39) || (b >= 0x41 && b <= 0x46) || (b >= 0x61 && b <= 0x66) }
func hexByteValue(_ b: UInt8) -> UInt8 { b <= 0x39 ? b - 0x30 : (b | 0x20) - 0x61 + 10 }

/// Percent-decodes the UTF-8 bytes of s; invalid "%" sequences stay literal.
func percentDecodeBytes(_ s: String) -> [UInt8] {
    let b = Array(s.utf8)
    var out: [UInt8] = [], i = 0
    while i < b.count {
        if b[i] == 0x25 && i + 2 < b.count && isHexByte(b[i + 1]) && isHexByte(b[i + 2]) {
            out.append(hexByteValue(b[i + 1]) * 16 + hexByteValue(b[i + 2])); i += 3
        } else { out.append(b[i]); i += 1 }
    }
    return out
}

/// Uppercase "%XX" for one byte.
func pctByte(_ b: UInt8) -> String {
    let h = Array("0123456789ABCDEF".utf8)
    return String(decoding: [0x25, h[Int(b >> 4)], h[Int(b & 15)]], as: UTF8.self)
}

/// The string when the bytes are valid UTF-8, else nil.
func strictUtf8(_ bytes: [UInt8]) -> String? {
    let s = String(decoding: bytes, as: UTF8.self)
    return Array(s.utf8) == bytes ? s : nil
}

/// Decodes an RFC 8187 value (charset'lang'pct, UTF-8 or ISO-8859-1); nil when malformed.
func decodeExtValue(_ v: String) -> String? {
    let c = codePoints(v)
    let charsetChars = Set("ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!#$&+-^_`{}~".unicodeScalars.map(\.value))
    guard let q1 = c.firstIndex(of: 0x27), q1 > 0, c[..<q1].allSatisfy(charsetChars.contains) else { return nil }
    guard let q2 = c[(q1 + 1)...].firstIndex(of: 0x27) else { return nil }
    let langOK = c[(q1 + 1)..<q2].allSatisfy { ($0 >= 0x30 && $0 <= 0x39) || ($0 >= 0x41 && $0 <= 0x5A) || ($0 >= 0x61 && $0 <= 0x7A) || $0 == 0x2D }
    let body = Array(c[(q2 + 1)...])
    guard langOK, !body.contains(0x0A) else { return nil }
    let cs = fromCodePoints(asciiLower(c[..<q1]))
    guard cs == "utf-8" || cs == "iso-8859-1" else { return nil }
    for (i, x) in body.enumerated() where x == 0x25 {
        guard i + 2 < body.count, body[i + 1] < 0x80, body[i + 2] < 0x80,
              isHexByte(UInt8(body[i + 1])), isHexByte(UInt8(body[i + 2])) else { return nil }
    }
    let bytes = percentDecodeBytes(fromCodePoints(body))
    if cs == "iso-8859-1" { return fromCodePoints(bytes.map { UInt32($0) }) }
    return strictUtf8(bytes)
}

/// Percent-encodes the UTF-8 bytes of s, keeping RFC 8187 attr-char.
func encodeAttrChars(_ s: String) -> String {
    let keep = Set("ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!#$&+-.^_`|~".utf8)
    var out = ""
    for b in s.utf8 { if keep.contains(b) { out.unicodeScalars.append(Unicode.Scalar(b)) } else { out += pctByte(b) } }
    return out
}

/// An HTTP quoted-string with '\' and '"' backslash-escaped.
func quoteHeaderValue(_ v: String) -> String {
    var out = "\""
    for u in v.unicodeScalars {
        if u == "\\" || u == "\"" { out.unicodeScalars.append("\\") }
        out.unicodeScalars.append(u)
    }
    return out + "\""
}

/// Parses an HTTP quoted-string starting just after the opening quote; returns the value and the index after the
/// closing quote, or nil when unterminated.
func readQuoted(_ s: [UInt32], _ start: Int) -> (String, Int)? {
    var i = start, buf: [UInt32] = []
    while true {
        if i >= s.count { return nil }
        let c = s[i]
        if c == 0x5C && i + 1 < s.count { buf.append(s[i + 1]); i += 2; continue }
        if c == 0x22 { return (fromCodePoints(buf), i + 1) }
        buf.append(c); i += 1
    }
}
