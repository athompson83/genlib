// SPDX-License-Identifier: Apache-2.0
// MFA backup codes using Crockford base32 (no I, L, O, U); store only keyed hashes.
#if canImport(CryptoKit)
import CryptoKit
#else
import Crypto
#endif

public enum RecoveryCodeError: Error, Equatable {
    case invalidCharacter(Character)
    case invalidLength(expected: Int)
    case invalidArgument(String)
}

public enum RecoveryCodes {
    public static let alphabet = Array("0123456789ABCDEFGHJKMNPQRSTVWXYZ".utf8)

    /// Unique codes such as "7K3QX-9MNP2"; each symbol uses 5 unbiased CSPRNG bits.
    public static func generate(count: Int = 10, groups: Int = 2, groupLength: Int = 5) throws -> [String] {
        guard (1...1000).contains(count) else { throw RecoveryCodeError.invalidArgument("count must be 1-1000") }
        try checkShape(groups, groupLength)
        var seen = Set<String>(), codes: [String] = []
        while codes.count < count {
            var out: [UInt8] = []
            for (i, b) in secureRandomBytes(groups * groupLength).enumerated() {
                if i > 0 && i % groupLength == 0 { out.append(UInt8(ascii: "-")) }
                out.append(alphabet[Int(b & 31)])
            }
            let code = String(decoding: out, as: UTF8.self)
            if seen.insert(code).inserted { codes.append(code) }
        }
        return codes
    }

    /// Uppercases, strips spaces/hyphens, maps O→0 and I/L→1, then checks alphabet and length.
    public static func normalize(_ input: String, groups: Int = 2, groupLength: Int = 5) throws -> String {
        try checkShape(groups, groupLength)
        var out: [UInt8] = []
        for ch in input where ch != " " && ch != "-" {
            guard var c = ch.asciiValue else { throw RecoveryCodeError.invalidCharacter(ch) }
            if c >= 97 && c <= 122 { c -= 32 }
            switch c {
            case UInt8(ascii: "O"): c = UInt8(ascii: "0")
            case UInt8(ascii: "I"), UInt8(ascii: "L"): c = UInt8(ascii: "1")
            default: break
            }
            guard alphabet.contains(c) else { throw RecoveryCodeError.invalidCharacter(ch) }
            out.append(c)
        }
        guard out.count == groups * groupLength else { throw RecoveryCodeError.invalidLength(expected: groups * groupLength) }
        return String(decoding: out, as: UTF8.self)
    }

    /// Lowercase hex HMAC-SHA256(key, normalized code).
    public static func hash(_ code: String, key: [UInt8]) throws -> String {
        guard !key.isEmpty else { throw RecoveryCodeError.invalidArgument("key must not be empty") }
        let mac = HMAC<SHA256>.authenticationCode(for: Array(try normalize(code).utf8), using: SymmetricKey(data: key))
        let hex = Array("0123456789abcdef".utf8)
        return String(decoding: mac.flatMap { [hex[Int($0 >> 4)], hex[Int($0 & 15)]] }, as: UTF8.self)
    }

    /// Index of the matching stored hash or nil; compares every hash without early exit.
    public static func find(_ input: String, storedHashes: [String], key: [UInt8]) throws -> Int? {
        let candidate: [UInt8]
        do { candidate = Array(try hash(input, key: key).utf8) } catch RecoveryCodeError.invalidCharacter, RecoveryCodeError.invalidLength { return nil }
        var found: Int?
        for (i, stored) in storedHashes.enumerated() {
            let equal = constantTimeEquals(candidate, Array(stored.utf8))
            if equal && found == nil { found = i }
        }
        return found
    }

    private static func checkShape(_ groups: Int, _ groupLength: Int) throws {
        guard groups >= 1, groupLength >= 1, groups * groupLength <= 64 else {
            throw RecoveryCodeError.invalidArgument("invalid code shape")
        }
    }
}
