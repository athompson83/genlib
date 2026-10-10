// SPDX-License-Identifier: Apache-2.0
// Non-cryptographic hashes: CRC-32 (IEEE 802.3), FNV-1a 32/64, MurmurHash3 x86_32 and Lamping-Veach jump consistent
// hashing. Fast and deterministic across languages, but never use them for passwords, MACs, signatures or anything an
// attacker must not be able to collide.

public enum HashingError: Error, Equatable {
    case invalidArgument(String)
}

public enum Hashing {
    private static let crcTable: [UInt32] = (0..<256).map { i -> UInt32 in
        var c = UInt32(i)
        for _ in 0..<8 { c = (c & 1) != 0 ? 0xEDB8_8320 ^ (c >> 1) : c >> 1 }
        return c
    }

    /// CRC-32 (reflected, polynomial 0xEDB88320, init and final XOR 0xFFFFFFFF), as used by zip, gzip and PNG.
    public static func crc32<S: Sequence>(_ bytes: S) -> UInt32 where S.Element == UInt8 {
        var c: UInt32 = 0xFFFF_FFFF
        for b in bytes { c = crcTable[Int((c ^ UInt32(b)) & 0xFF)] ^ (c >> 8) }
        return c ^ 0xFFFF_FFFF
    }

    /// FNV-1a 32-bit.
    public static func fnv1a32<S: Sequence>(_ bytes: S) -> UInt32 where S.Element == UInt8 {
        var h: UInt32 = 0x811C_9DC5
        for b in bytes { h = (h ^ UInt32(b)) &* 0x0100_0193 }
        return h
    }

    /// FNV-1a 64-bit (offset basis 0xcbf29ce484222325, prime 0x100000001b3).
    public static func fnv1a64<S: Sequence>(_ bytes: S) -> UInt64 where S.Element == UInt8 {
        var h: UInt64 = 0xCBF2_9CE4_8422_2325
        for b in bytes { h = (h ^ UInt64(b)) &* 0x0000_0100_0000_01B3 }
        return h
    }

    private static func rotl(_ x: UInt32, _ r: UInt32) -> UInt32 { (x << r) | (x >> (32 - r)) }

    /// MurmurHash3 x86_32 with little-endian 4-byte blocks.
    public static func murmur3_32(_ input: [UInt8], seed: UInt32 = 0) -> UInt32 {
        let c1: UInt32 = 0xCC9E_2D51, c2: UInt32 = 0x1B87_3593
        var h = seed
        let n = input.count, blocks = n - n % 4
        var i = 0
        while i < blocks {
            var k = UInt32(input[i]) | UInt32(input[i + 1]) << 8 | UInt32(input[i + 2]) << 16 | UInt32(input[i + 3]) << 24
            k = rotl(k &* c1, 15) &* c2
            h ^= k
            h = rotl(h, 13) &* 5 &+ 0xE654_6B64
            i += 4
        }
        if blocks < n {
            var k: UInt32 = 0
            for (j, b) in input[blocks...].enumerated() { k |= UInt32(b) << (8 * UInt32(j)) }
            h ^= rotl(k &* c1, 15) &* c2
        }
        h ^= UInt32(truncatingIfNeeded: n)
        h ^= h >> 16; h = h &* 0x85EB_CA6B; h ^= h >> 13; h = h &* 0xC2B2_AE35; h ^= h >> 16
        return h
    }

    public static func murmur3_32(_ text: String, seed: UInt32 = 0) -> UInt32 { murmur3_32(Array(text.utf8), seed: seed) }

    /// Jump consistent hash: maps `key` to a bucket in 0..<buckets (1...2^31-1); growing the bucket count moves only
    /// about 1/buckets of the keys. Computed in IEEE double exactly as in the paper so every language agrees.
    public static func jumpHash(_ key: UInt64, buckets: Int) throws -> Int {
        guard buckets >= 1 && buckets <= 0x7FFF_FFFF else { throw HashingError.invalidArgument("buckets must be 1...2147483647") }
        var k = key, b: Int64 = -1, j: Int64 = 0
        while j < Int64(buckets) {
            b = j
            k = k &* 2_862_933_555_777_941_757 &+ 1
            j = Int64(Double(b + 1) * (Double(Int64(1) << 31) / Double((k >> 33) + 1)))
        }
        return Int(b)
    }
}
