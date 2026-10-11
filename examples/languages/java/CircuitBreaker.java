// SPDX-License-Identifier: Apache-2.0

/**
 * Circuit breaker as a pure state machine with an injected clock (milliseconds). closed: calls pass and
 * failureThreshold consecutive failures open it; open: calls are rejected until cooldownMs has passed, then it
 * is half_open; half_open: at most halfOpenMax trials at a time, a success closes it, a failure re-opens it.
 */
public final class CircuitBreaker {
    private final int threshold;
    private final long cooldown;
    private final int maxProbes;
    private String state = "closed";
    private int failures;
    private long openedAt;
    private int inFlight;

    /** A breaker with the given limits; error when threshold < 1, cooldown < 0 or halfOpenMax < 1. */
    public CircuitBreaker(int failureThreshold, long cooldownMs, int halfOpenMax) {
        if (failureThreshold < 1) throw new IllegalArgumentException("failureThreshold must be >= 1");
        if (cooldownMs < 0) throw new IllegalArgumentException("cooldownMs must be >= 0");
        if (halfOpenMax < 1) throw new IllegalArgumentException("halfOpenMax must be >= 1");
        this.threshold = failureThreshold;
        this.cooldown = cooldownMs;
        this.maxProbes = halfOpenMax;
    }

    /** A breaker with defaults: 5 failures, 30000 ms cooldown, 1 half-open trial. */
    public CircuitBreaker() { this(5, 30000, 1); }

    /** "closed", "open" or "half_open" at time now. */
    public String state(long now) {
        if (state.equals("open") && now - openedAt >= cooldown) { state = "half_open"; inFlight = 0; }
        return state;
    }

    /** True when a call may proceed now (a half-open trial counts as in flight until it reports back). */
    public boolean allow(long now) {
        String s = state(now);
        if (s.equals("closed")) return true;
        if (s.equals("half_open") && inFlight < maxProbes) { inFlight++; return true; }
        return false;
    }

    /** Records a successful call; closes a half-open circuit and resets the failure count. */
    public void recordSuccess(long now) {
        if (state(now).equals("half_open")) { state = "closed"; inFlight = 0; }
        failures = 0;
    }

    /** Records a failed call; opens the circuit at the threshold or when half-open. */
    public void recordFailure(long now) {
        String s = state(now);
        if (s.equals("half_open") || (s.equals("closed") && failures + 1 >= threshold)) {
            state = "open";
            openedAt = now;
            inFlight = 0;
            failures = 0;
        } else if (s.equals("closed")) {
            failures++;
        }
    }

    /** Milliseconds until an open circuit lets a trial through (0 when not open). */
    public long retryAfterMs(long now) {
        return state(now).equals("open") ? Math.max(0, cooldown - (now - openedAt)) : 0;
    }
}
