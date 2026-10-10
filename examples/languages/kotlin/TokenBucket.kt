// SPDX-License-Identifier: Apache-2.0

/** Pure token bucket with an injected clock and integer millitokens (1 token = 1000 millitokens). */
object TokenBucket {
    /** Bucket state: available millitokens and the last refill time in milliseconds. */
    data class State(val tokensMilli: Long, val lastMs: Long)

    /** Outcome of a take: whether it was allowed, the new state and, when denied, how long to wait. */
    data class Result(val allowed: Boolean, val state: State, val retryAfterMs: Long)

    private fun capacityMilli(capacity: Long): Long {
        require(capacity > 0) { "capacity must be > 0" }
        return try { Math.multiplyExact(capacity, 1000L) } catch (e: ArithmeticException) { throw IllegalArgumentException("capacity is too large") }
    }

    /** A full bucket at [nowMs]. */
    fun newBucket(capacity: Long, nowMs: Long): State = State(capacityMilli(capacity), nowMs)

    /** Refills by elapsed time (a clock going backwards adds nothing), then takes [cost] tokens if available. */
    fun take(state: State, nowMs: Long, cost: Long, capacity: Long, ratePerSecond: Long): Result {
        val cap = capacityMilli(capacity)
        require(ratePerSecond > 0) { "ratePerSecond must be > 0" }
        require(cost > 0) { "cost must be > 0" }
        require(cost <= capacity) { "cost must not exceed capacity" }
        require(state.tokensMilli in 0..cap) { "state tokens out of range" }
        var tokens = state.tokensMilli
        var last = state.lastMs
        if (nowMs > last) {
            var elapsed = nowMs - last
            if (elapsed < 0) elapsed = Long.MAX_VALUE // subtraction overflowed: a huge gap simply refills fully
            val room = cap - tokens
            val add = if (elapsed > room / ratePerSecond) room else elapsed * ratePerSecond
            tokens += minOf(add, room)
            last = nowMs
        }
        val need = cost * 1000L
        if (tokens >= need) return Result(true, State(tokens - need, last), 0)
        val deficit = need - tokens
        val wait = deficit / ratePerSecond + if (deficit % ratePerSecond == 0L) 0 else 1
        return Result(false, State(tokens, last), wait)
    }
}
