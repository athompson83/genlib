// SPDX-License-Identifier: Apache-2.0
// Strict base32 (RFC 4648 sections 6 and 7), Bitcoin base58 and unpadded base64url (RFC 4648 section 5). Decoders reject
// unknown characters, bad padding or lengths and non-canonical trailing bits, so every text has one byte meaning.

public enum BaseEncodingError: Error, Equatable {
    case invalidInput(String)
}

public enum Base32Alphabet {
    case rfc4648, hex
    var symbols: [UInt8] { Array((self == .rfc4648 ? "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567" : "0123456789ABCDEFGHIJKLMNOPQRSTUV").utf8) }
}

public enum BaseEncodings {
    private static let b58 = Array("123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz".utf8)
    private static let b64u = Array("ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_".utf8)

    private static func fail(_ message: String) -> BaseEncodingError { .invalidInput(message) }

    private static func lookup(_ table: [UInt8]) -> [Int] {
        var t = Array(repeating: -1, count: 256)
        for (i, c) in table.enumerated() { t[Int(c)] = i }
        return t
    }

    /// Uppercase base32; `padding` appends "=" to a multiple of 8 characters.
    public static func base32Encode(_ bytes: [UInt8], alphabet: Base32Alphabet = .rfc4648, padding: Bool = true) -> String {
        let a = alphabet.symbols
        var out: [UInt8] = [], bits: UInt32 = 0, n = 0
        for b in bytes {
            bits = (bits << 8 | UInt32(b)) & 0xFFFF; n += 8
            while n >= 5 { n -= 5; out.append(a[Int((bits >> UInt32(n)) & 31)]) }
        }
        if n > 0 { out.append(a[Int((bits << UInt32(5 - n)) & 31)]) }
        if padding { while out.count % 8 != 0 { out.append(0x3D) } }
        return String(decoding: out, as: UTF8.self)
    }

    /// Case-insensitive base32 decoding with the same alphabet and padding choice as the encoder.
    public static func base32Decode(_ text: String, alphabet: Base32Alphabet = .rfc4648, padding: Bool = true) throws -> [UInt8] {
        var t = Array(text.utf8).map { $0 >= 0x61 && $0 <= 0x7A ? $0 - 32 : $0 }
        if padding {
            guard t.count % 8 == 0 else { throw fail("base32 length must be a multiple of 8") }
            var pad = 0
            while let last = t.last, last == 0x3D { t.removeLast(); pad += 1 }
            guard [0, 1, 3, 4, 6].contains(pad) else { throw fail("invalid base32 padding") }
        } else if t.contains(0x3D) {
            throw fail("unexpected base32 padding")
        }
        guard ![1, 3, 6].contains(t.count % 8) else { throw fail("invalid base32 length") }
        let table = lookup(alphabet.symbols)
        var out: [UInt8] = [], bits: UInt32 = 0, n = 0
        for c in t {
            let v = table[Int(c)]
            guard v >= 0 else { throw fail("invalid base32 character") }
            bits = (bits << 5 | UInt32(v)) & 0xFFFF; n += 5
            if n >= 8 { n -= 8; out.append(UInt8((bits >> UInt32(n)) & 0xFF)) }
        }
        guard bits & ((1 << UInt32(n)) - 1) == 0 else { throw fail("non-canonical base32 trailing bits") }
        return out
    }

    /// Bitcoin-alphabet base58; each leading zero byte becomes one leading "1".
    public static func base58Encode(_ bytes: [UInt8]) -> String {
        let zeros = bytes.prefix(while: { $0 == 0 }).count
        var digits: [UInt8] = []  // base-58 digits, least significant first
        for b in bytes[zeros...] {
            var carry = Int(b)
            for i in digits.indices { carry += Int(digits[i]) << 8; digits[i] = UInt8(carry % 58); carry /= 58 }
            while carry > 0 { digits.append(UInt8(carry % 58)); carry /= 58 }
        }
        let out = Array(repeating: b58[0], count: zeros) + digits.reversed().map { b58[Int($0)] }
        return String(decoding: out, as: UTF8.self)
    }

    public static func base58Decode(_ text: String) throws -> [UInt8] {
        let table = lookup(b58), t = Array(text.utf8)
        let ones = t.prefix(while: { $0 == 0x31 }).count
        var bytes: [UInt8] = []  // least significant first
        for c in t {
            let v = table[Int(c)]
            guard v >= 0 else { throw fail("invalid base58 character") }
            var carry = v
            for i in bytes.indices { carry += Int(bytes[i]) * 58; bytes[i] = UInt8(carry & 0xFF); carry >>= 8 }
            while carry > 0 { bytes.append(UInt8(carry & 0xFF)); carry >>= 8 }
        }
        while let last = bytes.last, last == 0 { bytes.removeLast() }
        return Array(repeating: 0, count: ones) + bytes.reversed()
    }

    /// Unpadded base64url.
    public static func base64UrlEncode(_ bytes: [UInt8]) -> String {
        var out: [UInt8] = [], i = 0
        while i < bytes.count {
            let chunk = bytes[i..<min(i + 3, bytes.count)]
            var v: UInt32 = 0
            for (k, b) in chunk.enumerated() { v |= UInt32(b) << UInt32(16 - 8 * k) }
            for k in 0...chunk.count { out.append(b64u[Int((v >> UInt32(18 - 6 * k)) & 63)]) }
            i += 3
        }
        return String(decoding: out, as: UTF8.self)
    }

    /// Strict unpadded base64url: rejects "=", "+", "/", length % 4 == 1 and non-zero trailing bits.
    public static func base64UrlDecode(_ text: String) throws -> [UInt8] {
        let table = lookup(b64u), t = Array(text.utf8)
        guard t.count % 4 != 1 else { throw fail("invalid base64url length") }
        var out: [UInt8] = [], bits: UInt32 = 0, n = 0
        for c in t {
            let v = table[Int(c)]
            guard v >= 0 else { throw fail("invalid base64url character") }
            bits = (bits << 6 | UInt32(v)) & 0xFFFF; n += 6
            if n >= 8 { n -= 8; out.append(UInt8((bits >> UInt32(n)) & 0xFF)) }
        }
        guard bits & ((1 << UInt32(n)) - 1) == 0 else { throw fail("non-canonical base64url trailing bits") }
        return out
    }
}
