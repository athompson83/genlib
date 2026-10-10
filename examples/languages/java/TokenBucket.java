// SPDX-License-Identifier: Apache-2.0

/** Pure token bucket with an injected clock and integer millitokens (1 token = 1000 millitokens). */
public final class TokenBucket {
    private TokenBucket() {}

    /** Bucket state: available millitokens and the last refill time in milliseconds. */
    public record State(long tokensMilli, long lastMs) {}

    /** Outcome of a take: whether it was allowed, the new state and, when denied, how long to wait. */
    public record Result(boolean allowed, State state, long retryAfterMs) {}

    private static long capacityMilli(long capacity) {
        if (capacity <= 0) throw new IllegalArgumentException("capacity must be > 0");
        try { return Math.multiplyExact(capacity, 1000L); }
        catch (ArithmeticException e) { throw new IllegalArgumentException("capacity is too large"); }
    }

    /** A full bucket at nowMs. */
    public static State newBucket(long capacity, long nowMs) { return new State(capacityMilli(capacity), nowMs); }

    /** Refills by elapsed time (a clock going backwards adds nothing), then takes cost tokens if available. */
    public static Result take(State state, long nowMs, long cost, long capacity, long ratePerSecond) {
        long cap = capacityMilli(capacity);
        if (state == null) throw new IllegalArgumentException("state is required");
        if (ratePerSecond <= 0) throw new IllegalArgumentException("ratePerSecond must be > 0");
        if (cost <= 0) throw new IllegalArgumentException("cost must be > 0");
        if (cost > capacity) throw new IllegalArgumentException("cost must not exceed capacity");
        if (state.tokensMilli() < 0 || state.tokensMilli() > cap) throw new IllegalArgumentException("state tokens out of range");
        long tokens = state.tokensMilli();
        long last = state.lastMs();
        if (nowMs > last) {
            long elapsed = nowMs - last;
            if (elapsed < 0) elapsed = Long.MAX_VALUE; // subtraction overflowed: a huge gap simply refills fully
            long room = cap - tokens;
            long add = elapsed > room / ratePerSecond ? room : elapsed * ratePerSecond;
            tokens += Math.min(add, room);
            last = nowMs;
        }
        long need = cost * 1000L;
        if (tokens >= need) return new Result(true, new State(tokens - need, last), 0);
        long deficit = need - tokens;
        long wait = deficit / ratePerSecond + (deficit % ratePerSecond == 0 ? 0 : 1);
        return new Result(false, new State(tokens, last), wait);
    }
}
