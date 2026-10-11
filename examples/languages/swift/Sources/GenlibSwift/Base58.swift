// SPDX-License-Identifier: Apache-2.0
// Base58 (Bitcoin alphabet) and Base58Check (payload + first 4 bytes of SHA-256(SHA-256(payload))). The big-number
// conversion works on byte/digit arrays, so no big-integer type is needed. Leading zero bytes map to leading "1"s.
// SHA-256 comes from CryptoKit on Apple platforms and the package's pinned swift-crypto elsewhere.
#if canImport(CryptoKit)
import CryptoKit
#else
import Crypto
#endif

public enum Base58Error: Error, Equatable {
    case invalid(String)
}

public enum Base58 {
    private static let alphabet: [UInt8] = Array("123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz".utf8)

    /// Encodes bytes as Base58 text.
    public static func encode(_ bytes: [UInt8]) -> String {
        let zeros = bytes.prefix { $0 == 0 }.count
        var digits: [Int] = [] // base 58, little endian
        for byte in bytes.dropFirst(zeros) {
            var carry = Int(byte)
            for j in digits.indices {
                carry += digits[j] << 8
                digits[j] = carry % 58
                carry /= 58
            }
            while carry > 0 { digits.append(carry % 58); carry /= 58 }
        }
        let out = [UInt8](repeating: 0x31, count: zeros) + digits.reversed().map { alphabet[$0] }
        return String(decoding: out, as: UTF8.self)
    }

    /// Decodes Base58 text to bytes; throws on a character outside the alphabet.
    public static func decode(_ text: String) throws -> [UInt8] {
        let cps = text.unicodeScalars.map(\.value)
        let ones = cps.prefix { $0 == 0x31 }.count
        var bytes: [UInt8] = [] // base 256, little endian
        for c in cps {
            guard c < 128, let v = alphabet.firstIndex(of: UInt8(c)) else { throw Base58Error.invalid("invalid base58 character") }
            var carry = v
            for j in bytes.indices {
                carry += Int(bytes[j]) * 58
                bytes[j] = UInt8(carry & 0xFF)
                carry >>= 8
            }
            while carry > 0 { bytes.append(UInt8(carry & 0xFF)); carry >>= 8 }
        }
        return [UInt8](repeating: 0, count: ones) + bytes.reversed()
    }

    private static func checksum(_ payload: [UInt8]) -> [UInt8] {
        Array(Array(SHA256.hash(data: Array(SHA256.hash(data: payload)))).prefix(4))
    }

    /// Encodes a payload as Base58Check (payload followed by a 4-byte double SHA-256 checksum).
    public static func checkEncode(_ payload: [UInt8]) -> String { encode(payload + checksum(payload)) }

    /// Decodes Base58Check text and returns the payload; throws when too short or the checksum does not match.
    public static func checkDecode(_ text: String) throws -> [UInt8] {
        let b = try decode(text)
        guard b.count >= 4 else { throw Base58Error.invalid("too short for a checksum") }
        let p = Array(b.dropLast(4))
        guard checksum(p) == Array(b.suffix(4)) else { throw Base58Error.invalid("checksum mismatch") }
        return p
    }
}
