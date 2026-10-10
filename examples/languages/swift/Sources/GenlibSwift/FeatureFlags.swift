// SPDX-License-Identifier: Apache-2.0
// Deterministic feature-flag evaluation: disabled -> deny list -> allow list -> percentage rollout, with weighted
// variants. bucket = fnv1a32(UTF-8 of key + ":" + userId) % 10000, so the same user always gets the same answer for the
// same flag, and raising rolloutPercent only adds users (buckets below the threshold stay on). Uses Hashing.swift.

public enum FeatureFlagError: Error, Equatable {
    case invalidArgument(String)
}

public struct FlagVariant: Equatable {
    public var name: String
    public var weight: Int
    public init(_ name: String, weight: Int) { self.name = name; self.weight = weight }
}

public struct FeatureFlag: Equatable {
    public var key: String
    public var enabled: Bool
    public var allow: [String]
    public var deny: [String]
    public var rolloutPercent: Double  // 0...100, at most 2 decimals
    public var variants: [FlagVariant]
    public init(key: String, enabled: Bool = true, allow: [String] = [], deny: [String] = [], rolloutPercent: Double = 100,
                variants: [FlagVariant] = []) {
        self.key = key; self.enabled = enabled; self.allow = allow; self.deny = deny
        self.rolloutPercent = rolloutPercent; self.variants = variants
    }
}

public struct FlagEvaluation: Equatable {
    public var on: Bool
    public var reason: String  // "disabled" | "deny" | "allow" | "rollout" | "excluded"
    public var bucket: Int  // 0..<10000, always reported
    public var variant: String?
    public init(on: Bool, reason: String, bucket: Int, variant: String? = nil) {
        self.on = on; self.reason = reason; self.bucket = bucket; self.variant = variant
    }
}

public enum FeatureFlags {
    private static func fail(_ message: String) -> FeatureFlagError { .invalidArgument(message) }

    private static func validKey(_ key: String) -> Bool {
        let b = Array(key.utf8)
        return (1...100).contains(b.count) && b.allSatisfy {
            ($0 >= 0x41 && $0 <= 0x5A) || ($0 >= 0x61 && $0 <= 0x7A) || ($0 >= 0x30 && $0 <= 0x39) || $0 == 0x2E || $0 == 0x5F || $0 == 0x2D
        }
    }

    /// Exact (byte-wise) membership; Swift String equality would treat canonically equivalent ids as equal.
    private static func member(_ id: [UInt8], _ list: [String]) -> Bool { list.contains { Array($0.utf8) == id } }

    public static func evaluateFlag(_ flag: FeatureFlag, userId: String) throws -> FlagEvaluation {
        guard validKey(flag.key) else { throw fail("flag key must match [A-Za-z0-9._-]{1,100}") }
        let pct = flag.rolloutPercent, scaled = pct * 100
        guard pct >= 0 && pct <= 100 && scaled.rounded() == scaled else { throw fail("rolloutPercent must be 0...100 with at most 2 decimals") }
        for v in flag.variants where v.weight < 1 || v.name.isEmpty { throw fail("variants need a name and a positive weight") }
        var total = 0
        for v in flag.variants {
            let (sum, overflow) = total.addingReportingOverflow(v.weight)
            guard !overflow else { throw fail("variant weights overflow") }
            total = sum
        }
        let threshold = Int(scaled.rounded())
        let id = Array(userId.utf8)
        let bucket = Int(Hashing.fnv1a32(Array((flag.key + ":").utf8) + id) % 10000)
        func variant() -> String? {
            guard !flag.variants.isEmpty else { return nil }
            var x = Int(Hashing.fnv1a32(Array((flag.key + ":variant:").utf8) + id)) % total
            for v in flag.variants {
                if x < v.weight { return v.name }
                x -= v.weight
            }
            return nil
        }
        if !flag.enabled { return FlagEvaluation(on: false, reason: "disabled", bucket: bucket) }
        if member(id, flag.deny) { return FlagEvaluation(on: false, reason: "deny", bucket: bucket) }
        if member(id, flag.allow) { return FlagEvaluation(on: true, reason: "allow", bucket: bucket, variant: variant()) }
        if bucket < threshold { return FlagEvaluation(on: true, reason: "rollout", bucket: bucket, variant: variant()) }
        return FlagEvaluation(on: false, reason: "excluded", bucket: bucket)
    }
}
