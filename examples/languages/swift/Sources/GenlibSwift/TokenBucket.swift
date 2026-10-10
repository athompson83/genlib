// SPDX-License-Identifier: Apache-2.0
// Pure token-bucket rate limiter with an injected clock. Tokens are integer millitokens so refills never accumulate
// floating-point error; the caller persists BucketState (for example per user or API key).

public enum BucketError: Error, Equatable {
    case invalidArgument(String)
}

public struct BucketState: Equatable, Sendable {
    public var tokensMilli: UInt64
    public var lastMs: Int64
    public init(tokensMilli: UInt64, lastMs: Int64) { self.tokensMilli = tokensMilli; self.lastMs = lastMs }
}

public struct TakeResult: Equatable, Sendable {
    public let state: BucketState
    public let allowed: Bool
    /// 0 when allowed; otherwise milliseconds until `cost` tokens are available.
    public let retryAfterMs: UInt64
}

public enum TokenBucket {
    private static func capacityMilli(_ capacity: UInt64) throws -> UInt64 {
        guard capacity > 0 else { throw BucketError.invalidArgument("capacity must be positive") }
        let (cap, overflow) = capacity.multipliedReportingOverflow(by: 1000)
        guard !overflow else { throw BucketError.invalidArgument("capacity too large") }
        return cap
    }

    /// A full bucket at `nowMs`.
    public static func newBucket(capacity: UInt64, nowMs: Int64) throws -> BucketState {
        BucketState(tokensMilli: try capacityMilli(capacity), lastMs: nowMs)
    }

    /// Refills by (now - last) * ratePerSecond millitokens (a clock going backwards adds nothing), then takes `cost`
    /// tokens if available. A denied request keeps the refilled state and reports when to retry.
    public static func take(_ state: BucketState, nowMs: Int64, cost: UInt64, capacity: UInt64, ratePerSecond: UInt64) throws -> TakeResult {
        let cap = try capacityMilli(capacity)
        guard ratePerSecond > 0 else { throw BucketError.invalidArgument("ratePerSecond must be positive") }
        guard cost > 0 else { throw BucketError.invalidArgument("cost must be positive") }
        guard cost <= capacity else { throw BucketError.invalidArgument("cost exceeds capacity") }
        var next = state
        next.tokensMilli = min(next.tokensMilli, cap)
        if nowMs > next.lastMs {
            let elapsed = UInt64(bitPattern: nowMs &- next.lastMs) // exact: the true difference is positive and below 2^64
            let (refill, overflow) = elapsed.multipliedReportingOverflow(by: ratePerSecond)
            next.tokensMilli = overflow || refill >= cap - next.tokensMilli ? cap : next.tokensMilli + refill
            next.lastMs = nowMs
        }
        let need = cost * 1000 // cost <= capacity, so this cannot overflow
        if next.tokensMilli >= need {
            next.tokensMilli -= need
            return TakeResult(state: next, allowed: true, retryAfterMs: 0)
        }
        let missing = need - next.tokensMilli
        return TakeResult(state: next, allowed: false, retryAfterMs: missing / ratePerSecond + (missing % ratePerSecond == 0 ? 0 : 1))
    }
}
