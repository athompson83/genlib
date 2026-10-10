// SPDX-License-Identifier: Apache-2.0
// Shared percent-encoding, base64url and constant-time helpers (no Foundation required).

private let hexDigits = Array("0123456789ABCDEF".utf8)

/// RFC 3986 percent-encoding of everything except unreserved characters.
/// Spaces become `%20`, or `+` when `spaceAsPlus` is set (form encoding).
func percentEncode(_ value: String, spaceAsPlus: Bool = false) -> String {
    var out: [UInt8] = []
    for b in value.utf8 {
        switch b {
        case UInt8(ascii: "A")...UInt8(ascii: "Z"), UInt8(ascii: "a")...UInt8(ascii: "z"), UInt8(ascii: "0")...UInt8(ascii: "9"),
             UInt8(ascii: "-"), UInt8(ascii: "."), UInt8(ascii: "_"), UInt8(ascii: "~"):
            out.append(b)
        case UInt8(ascii: " ") where spaceAsPlus:
            out.append(UInt8(ascii: "+"))
        default:
            out.append(UInt8(ascii: "%")); out.append(hexDigits[Int(b >> 4)]); out.append(hexDigits[Int(b & 15)])
        }
    }
    return String(decoding: out, as: UTF8.self)
}

/// Decodes `application/x-www-form-urlencoded` text ('+' is a space); nil for malformed input.
func formDecode(_ value: String) -> String? {
    var bytes: [UInt8] = []
    var iterator = Array(value.utf8).makeIterator()
    while let b = iterator.next() {
        if b == UInt8(ascii: "+") { bytes.append(UInt8(ascii: " ")); continue }
        guard b == UInt8(ascii: "%") else { bytes.append(b); continue }
        guard let h = iterator.next(), let l = iterator.next(), let hi = hexValue(h), let lo = hexValue(l) else { return nil }
        bytes.append(hi << 4 | lo)
    }
    let decoded = String(decoding: bytes, as: UTF8.self)
    return Array(decoded.utf8) == bytes ? decoded : nil
}

private func hexValue(_ c: UInt8) -> UInt8? {
    switch c {
    case UInt8(ascii: "0")...UInt8(ascii: "9"): return c - UInt8(ascii: "0")
    case UInt8(ascii: "a")...UInt8(ascii: "f"): return c - UInt8(ascii: "a") + 10
    case UInt8(ascii: "A")...UInt8(ascii: "F"): return c - UInt8(ascii: "A") + 10
    default: return nil
    }
}

/// base64url without padding.
func base64URL<S: Sequence>(_ data: S) -> String where S.Element == UInt8 {
    let alphabet = Array("ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_".utf8)
    let bytes = Array(data)
    var out: [UInt8] = []
    var i = 0
    while i < bytes.count {
        let chunk = Array(bytes[i..<min(i + 3, bytes.count)])
        let n = (UInt32(chunk[0]) << 16) | (chunk.count > 1 ? UInt32(chunk[1]) << 8 : 0) | (chunk.count > 2 ? UInt32(chunk[2]) : 0)
        out.append(alphabet[Int((n >> 18) & 63)]); out.append(alphabet[Int((n >> 12) & 63)])
        if chunk.count > 1 { out.append(alphabet[Int((n >> 6) & 63)]) }
        if chunk.count > 2 { out.append(alphabet[Int(n & 63)]) }
        i += 3
    }
    return String(decoding: out, as: UTF8.self)
}

/// Compares byte sequences with an XOR-accumulate loop (no early exit; length mismatch is unequal).
func constantTimeEquals(_ a: [UInt8], _ b: [UInt8]) -> Bool {
    var diff = UInt(bitPattern: a.count ^ b.count)
    for i in 0..<min(a.count, b.count) { diff |= UInt(a[i] ^ b[i]) }
    return diff == 0
}

/// Random bytes from the system CSPRNG.
func secureRandomBytes(_ count: Int) -> [UInt8] {
    var rng = SystemRandomNumberGenerator()
    return (0..<count).map { _ in UInt8.random(in: .min ... .max, using: &rng) }
}
