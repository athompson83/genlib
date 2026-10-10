// SPDX-License-Identifier: Apache-2.0
namespace Genlib.Validation;

/// <summary>Token bucket state in integer millitokens with the time of the last refill.</summary>
public readonly record struct BucketState(long TokensMilli, long LastMs);

/// <summary>Outcome of a take: the new state and, when denied, how long to wait.</summary>
public readonly record struct TakeResult(bool Allowed, BucketState State, long RetryAfterMs);

/// <summary>Pure token-bucket rate limiter with an injected clock; refill is ratePerSecond tokens per second.</summary>
public static class TokenBucket {
    /// <summary>A full bucket at <paramref name="nowMs"/>.</summary>
    public static BucketState NewBucket(long capacity, long nowMs) {
        if (capacity <= 0) throw new ArgumentOutOfRangeException(nameof(capacity), "capacity must be > 0");
        return new BucketState(checked(capacity * 1000), nowMs);
    }

    /// <summary>Refills (a clock going backwards adds nothing), then takes <paramref name="cost"/> tokens if available.</summary>
    public static TakeResult Take(BucketState state, long nowMs, long cost, long capacity, long ratePerSecond) {
        if (capacity <= 0) throw new ArgumentOutOfRangeException(nameof(capacity), "capacity must be > 0");
        if (ratePerSecond <= 0) throw new ArgumentOutOfRangeException(nameof(ratePerSecond), "ratePerSecond must be > 0");
        if (cost <= 0) throw new ArgumentOutOfRangeException(nameof(cost), "cost must be > 0");
        if (cost > capacity) throw new ArgumentOutOfRangeException(nameof(cost), "cost must not exceed capacity");
        long capMilli = checked(capacity * 1000);
        if (state.TokensMilli < 0 || state.TokensMilli > capMilli) throw new ArgumentException("state tokens out of range", nameof(state));
        long tokens = state.TokensMilli, last = state.LastMs;
        if (nowMs > last) {
            if (last < 0 && nowMs > long.MaxValue + last) {
                tokens = capMilli; // the gap itself would overflow; it certainly fills the bucket
            } else {
                long elapsed = nowMs - last, missing = capMilli - tokens;
                // elapsed < ceil(missing / rate) keeps elapsed * rate below missing + rate, so no overflow.
                tokens = elapsed >= CeilDiv(missing, ratePerSecond) ? capMilli : tokens + elapsed * ratePerSecond;
            }
            last = nowMs;
        }
        long costMilli = cost * 1000;
        if (tokens >= costMilli) return new TakeResult(true, new BucketState(tokens - costMilli, last), 0);
        long retry = CeilDiv(costMilli - tokens, ratePerSecond);
        return new TakeResult(false, new BucketState(tokens, last), retry);
    }

    private static long CeilDiv(long a, long b) => a / b + (a % b != 0 ? 1 : 0);
}
