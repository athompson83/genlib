// SPDX-License-Identifier: Apache-2.0

/**
 * Circuit breaker as a pure state machine with an injected clock (milliseconds). closed: calls pass and
 * [failureThreshold] consecutive failures open it; open: calls are rejected until [cooldownMs] has passed, then it
 * is half_open; half_open: at most [halfOpenMax] trials at a time, a success closes it, a failure re-opens it.
 */
class CircuitBreaker(private val failureThreshold: Int = 5, private val cooldownMs: Long = 30000, private val halfOpenMax: Int = 1) {
    private var current = "closed"
    private var failures = 0
    private var openedAt = 0L
    private var inFlight = 0

    init {
        require(failureThreshold >= 1) { "failureThreshold must be >= 1" }
        require(cooldownMs >= 0) { "cooldownMs must be >= 0" }
        require(halfOpenMax >= 1) { "halfOpenMax must be >= 1" }
    }

    /** "closed", "open" or "half_open" at time [now]. */
    fun state(now: Long): String {
        if (current == "open" && now - openedAt >= cooldownMs) { current = "half_open"; inFlight = 0 }
        return current
    }

    /** True when a call may proceed now (a half-open trial counts as in flight until it reports back). */
    fun allow(now: Long): Boolean {
        val s = state(now)
        if (s == "closed") return true
        if (s == "half_open" && inFlight < halfOpenMax) { inFlight++; return true }
        return false
    }

    /** Records a successful call; closes a half-open circuit and resets the failure count. */
    fun recordSuccess(now: Long) {
        if (state(now) == "half_open") { current = "closed"; inFlight = 0 }
        failures = 0
    }

    /** Records a failed call; opens the circuit at the threshold or when half-open. */
    fun recordFailure(now: Long) {
        val s = state(now)
        if (s == "half_open" || (s == "closed" && failures + 1 >= failureThreshold)) {
            current = "open"; openedAt = now; inFlight = 0; failures = 0
        } else if (s == "closed") {
            failures++
        }
    }

    /** Milliseconds until an open circuit lets a trial through (0 when not open). */
    fun retryAfterMs(now: Long): Long = if (state(now) == "open") maxOf(0L, cooldownMs - (now - openedAt)) else 0L
}
