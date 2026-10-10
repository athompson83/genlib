// SPDX-License-Identifier: Apache-2.0
// Time-ordered identifiers: UUIDv7 (RFC 9562) and ULID (Crockford base32). The pure functions take the timestamp
// and 10 random bytes so output is deterministic; newUuidV7()/newUlid() use the system CSPRNG and clock.
#if canImport(Glibc)
import Glibc
#elseif canImport(Darwin)
import Darwin
#elseif canImport(ucrt)
import ucrt
#endif

public enum IdError: Error, Equatable {
    case invalidArgument(String)
}

public enum Ids {
    /// Largest timestamp that fits in 48 bits.
    public static let maxUnixMs: UInt64 = (1 << 48) - 1
    private static let crockford = Array("0123456789ABCDEFGHJKMNPQRSTVWXYZ".utf8)
    private static let hexDigits = Array("0123456789abcdef".utf8)

    private static func check(_ unixMs: UInt64, _ random: [UInt8]) throws {
        guard unixMs <= maxUnixMs else { throw IdError.invalidArgument("unixMs must be between 0 and 2^48-1") }
        guard random.count == 10 else { throw IdError.invalidArgument("random must be exactly 10 bytes") }
    }

    /// UUIDv7: 48-bit big-endian unix milliseconds, then the random bytes with version 7 and variant 0b10. Lowercase, dashed.
    public static func uuidV7(unixMs: UInt64, random: [UInt8]) throws -> String {
        try check(unixMs, random)
        var b = (0..<6).map { UInt8(truncatingIfNeeded: unixMs >> (40 - 8 * UInt64($0))) } + random
        b[6] = (b[6] & 0x0f) | 0x70
        b[8] = (b[8] & 0x3f) | 0x80
        var out: [UInt8] = []
        for (i, byte) in b.enumerated() {
            if [4, 6, 8, 10].contains(i) { out.append(UInt8(ascii: "-")) }
            out.append(hexDigits[Int(byte >> 4)])
            out.append(hexDigits[Int(byte & 0x0f)])
        }
        return String(decoding: out, as: UTF8.self)
    }

    /// ULID: (unixMs << 80) | random as a 128-bit big-endian integer, 26 Crockford base32 characters.
    public static func ulid(unixMs: UInt64, random: [UInt8]) throws -> String {
        try check(unixMs, random)
        // 130 bits of output: 2 zero bits, 48 time bits, 80 random bits, consumed 5 at a time.
        var bits: [UInt8] = [0, 0]
        for i: UInt64 in 0..<48 { bits.append(UInt8(truncatingIfNeeded: (unixMs >> (47 - i)) & 1)) }
        for byte in random {
            for i: UInt8 in 0..<8 { bits.append((byte >> (7 - i)) & 1) }
        }
        var out: [UInt8] = []
        for i in stride(from: 0, to: 130, by: 5) {
            out.append(crockford[Int(bits[i..<i + 5].reduce(0) { $0 << 1 | $1 })])
        }
        return String(decoding: out, as: UTF8.self)
    }

    private static func hexValue(_ c: UInt8) -> UInt64? {
        switch c {
        case UInt8(ascii: "0")...UInt8(ascii: "9"): return UInt64(c - UInt8(ascii: "0"))
        case UInt8(ascii: "a")...UInt8(ascii: "f"): return UInt64(c - UInt8(ascii: "a") + 10)
        case UInt8(ascii: "A")...UInt8(ascii: "F"): return UInt64(c - UInt8(ascii: "A") + 10)
        default: return nil
        }
    }

    /// Unix milliseconds of a UUIDv7 (case-insensitive); rejects other versions and variants.
    public static func uuidV7Time(_ text: String) throws -> UInt64 {
        let bytes = Array(text.utf8)
        guard bytes.count == 36 else { throw IdError.invalidArgument("UUID must be 36 characters") }
        var hex: [UInt64] = []
        for (i, c) in bytes.enumerated() {
            if [8, 13, 18, 23].contains(i) {
                guard c == UInt8(ascii: "-") else { throw IdError.invalidArgument("UUID dashes must be at positions 8, 13, 18 and 23") }
            } else {
                guard let v = hexValue(c) else { throw IdError.invalidArgument("UUID contains a non-hex character") }
                hex.append(v)
            }
        }
        guard hex[12] == 7 else { throw IdError.invalidArgument("not a version 7 UUID") }
        guard hex[16] & 0b1100 == 0b1000 else { throw IdError.invalidArgument("UUID variant is not RFC 9562") }
        return hex[..<12].reduce(0) { $0 << 4 | $1 }
    }

    /// Unix milliseconds of a ULID (case-insensitive Crockford base32).
    public static func ulidTime(_ text: String) throws -> UInt64 {
        let bytes = Array(text.utf8)
        guard bytes.count == 26 else { throw IdError.invalidArgument("ULID must be 26 characters") }
        guard bytes[0] <= UInt8(ascii: "7") else { throw IdError.invalidArgument("ULID first character must be 0-7") }
        var time: UInt64 = 0
        for (i, c) in bytes.enumerated() {
            let upper = (UInt8(ascii: "a")...UInt8(ascii: "z")).contains(c) ? c - 32 : c
            guard let v = crockford.firstIndex(of: upper) else { throw IdError.invalidArgument("ULID contains a non-Crockford character") }
            // The first 10 characters carry 50 bits: 2 zero bits then the 48 time bits.
            if i < 10 { time = time << 5 | UInt64(v) }
        }
        return time
    }

    private static func nowMs() -> UInt64 {
        var ts = timespec()
        clock_gettime(CLOCK_REALTIME, &ts)
        return UInt64(max(0, ts.tv_sec)) * 1000 + UInt64(max(0, ts.tv_nsec)) / 1_000_000
    }

    /// New UUIDv7 from the system clock and CSPRNG.
    public static func newUuidV7() throws -> String { try uuidV7(unixMs: nowMs(), random: secureRandomBytes(10)) }

    /// New ULID from the system clock and CSPRNG.
    public static func newUlid() throws -> String { try ulid(unixMs: nowMs(), random: secureRandomBytes(10)) }
}
