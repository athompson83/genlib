// SPDX-License-Identifier: Apache-2.0
// Bloom filter with deterministic hashing. The hash is FNV-1a 64-bit of the item's UTF-8 bytes; with h1 = low 32 bits
// and h2 = high 32 bits, position i (0..k-1) is (h1 + i*h2) mod 2^64 mod m in unsigned 64-bit arithmetic. Bit j lives in
// byte j>>3 at mask 1<<(j&7); the serialized state is unpadded base64url of those bytes (BaseEncodings).
#if canImport(Glibc)
import Glibc
#elseif canImport(Darwin)
import Darwin
#elseif canImport(ucrt)
import ucrt
#endif

public enum BloomFilterError: Error, Equatable {
    case invalidParameters(String)
    case invalidState(String)
}

public struct BloomFilter: Equatable {
    public let m: Int
    public let k: Int
    private var bits: [UInt8]

    /// FNV-1a 64-bit hash of bytes.
    public static func fnv1a64<S: Sequence>(_ bytes: S) -> UInt64 where S.Element == UInt8 {
        var h: UInt64 = 0xcbf2_9ce4_8422_2325
        for b in bytes { h = (h ^ UInt64(b)) &* 0x0000_0100_0000_01b3 }
        return h
    }

    /// Optimal bit count m (at least 8) and hash count k for n items at false-positive rate p.
    public static func sizeFor(n: Int, p: Double) throws -> (m: Int, k: Int) {
        guard n >= 1, p > 0, p < 1 else { throw BloomFilterError.invalidParameters("bad size") }
        let ln2 = log(2.0)
        let m = max(8, Int((-Double(n) * log(p) / (ln2 * ln2)).rounded(.up)))
        let k = max(1, Int((Double(m) / Double(n) * ln2 + 0.5).rounded(.down)))
        return (m, k)
    }

    /// Creates an empty filter; m >= 8 and 1 <= k <= 64.
    public init(m: Int, k: Int) throws {
        guard m >= 8, k >= 1, k <= 64 else { throw BloomFilterError.invalidParameters("bad params") }
        self.m = m
        self.k = k
        bits = Array(repeating: 0, count: (m + 7) / 8)
    }

    /// The k bit positions of an item.
    public func positions(_ item: String) -> [Int] {
        let h = BloomFilter.fnv1a64(item.utf8)
        let h1 = h & 0xffff_ffff, h2 = h >> 32
        return (0..<k).map { Int((h1 &+ UInt64($0) &* h2) % UInt64(m)) }
    }

    /// Adds an item to the filter.
    public mutating func add(_ item: String) {
        for j in positions(item) { bits[j >> 3] |= UInt8(1 << (j & 7)) }
    }

    /// True when every position of the item is set (false positives are possible, false negatives are not).
    public func mightContain(_ item: String) -> Bool {
        positions(item).allSatisfy { bits[$0 >> 3] & UInt8(1 << ($0 & 7)) != 0 }
    }

    /// Estimated number of distinct items added, or nil when every bit is set (saturated).
    public func countEstimate() -> Int? {
        let x = bits.reduce(0) { $0 + $1.nonzeroBitCount }
        if x >= m { return nil }
        return Int((-Double(m) / Double(k) * log(1 - Double(x) / Double(m)) + 0.5).rounded(.down))
    }

    /// The bit array as unpadded base64url.
    public func serialize() -> String { BaseEncodings.base64UrlEncode(bits) }

    /// Restores a filter from serialize() output; rejects a state whose length does not match m.
    public static func deserialize(m: Int, k: Int, _ text: String) throws -> BloomFilter {
        var filter = try BloomFilter(m: m, k: k)
        let raw: [UInt8]
        do { raw = try BaseEncodings.base64UrlDecode(text) } catch { throw BloomFilterError.invalidState("invalid base64url") }
        guard raw.count == filter.bits.count else { throw BloomFilterError.invalidState("length") }
        filter.bits = raw
        return filter
    }

    /// The bitwise union with another filter of the same m and k.
    public func union(_ other: BloomFilter) throws -> BloomFilter {
        guard m == other.m, k == other.k else { throw BloomFilterError.invalidParameters("mismatch") }
        var out = self
        for i in bits.indices { out.bits[i] |= other.bits[i] }
        return out
    }
}
