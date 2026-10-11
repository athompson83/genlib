// SPDX-License-Identifier: Apache-2.0
// Genlib recipe: circuit breaker as a pure state machine with an injected clock. Original source; copy and adapt.
// closed: calls pass; failureThreshold consecutive failures open it. open: calls are rejected until cooldownMs
// has passed since it opened, then it is half_open. half_open: at most halfOpenMax trial calls are in flight;
// a success closes the circuit, a failure re-opens it and restarts the cooldown. Pass Date.now() (or a test
// clock) as `now`. State lives in memory per process; share it through your store for a fleet-wide breaker.
// Same behavior as the Genlib Python, Go, Rust, Java, Kotlin, C#, Swift and Dart circuit-breaker modules.

/** Breaker state at a point in time. */
export type BreakerState = "closed" | "open" | "half_open";

/** Consecutive-failure circuit breaker; every method takes the current time in milliseconds. */
export class CircuitBreaker {
  private current: BreakerState = "closed";
  private failures = 0;
  private openedAt = 0;
  private inFlight = 0;

  readonly failureThreshold: number;
  readonly cooldownMs: number;
  readonly halfOpenMax: number;

  /** Throws RangeError when failureThreshold < 1, cooldownMs < 0 or halfOpenMax < 1 (all integers). */
  constructor(failureThreshold = 5, cooldownMs = 30000, halfOpenMax = 1) {
    const limits: [string, number, number][] = [["failureThreshold", failureThreshold, 1], ["cooldownMs", cooldownMs, 0], ["halfOpenMax", halfOpenMax, 1]];
    for (const [name, value, low] of limits) {
      if (!Number.isSafeInteger(value) || value < low) throw new RangeError(`${name} must be an integer >= ${low}`);
    }
    this.failureThreshold = failureThreshold;
    this.cooldownMs = cooldownMs;
    this.halfOpenMax = halfOpenMax;
  }

  /** "closed", "open" or "half_open" at now (an open circuit turns half_open once the cooldown has passed). */
  state(now: number): BreakerState {
    if (this.current === "open" && now - this.openedAt >= this.cooldownMs) {
      this.current = "half_open";
      this.inFlight = 0;
    }
    return this.current;
  }

  /** True when a call may proceed now; a half-open trial counts as in flight until it reports back. */
  allow(now: number): boolean {
    const s = this.state(now);
    if (s === "closed") return true;
    if (s === "half_open" && this.inFlight < this.halfOpenMax) {
      this.inFlight++;
      return true;
    }
    return false;
  }

  /** Reports a successful call: resets the failure count and closes a half-open circuit. */
  recordSuccess(now: number): void {
    if (this.state(now) === "half_open") {
      this.current = "closed";
      this.inFlight = 0;
    }
    this.failures = 0;
  }

  /** Reports a failed call: opens the circuit at the threshold or when a half-open trial fails. */
  recordFailure(now: number): void {
    const s = this.state(now);
    if (s === "half_open" || (s === "closed" && this.failures + 1 >= this.failureThreshold)) {
      this.current = "open";
      this.openedAt = now;
      this.inFlight = 0;
      this.failures = 0;
    } else if (s === "closed") {
      this.failures++;
    }
  }

  /** Milliseconds until an open circuit lets a trial through (0 when not open); use for Retry-After. */
  retryAfterMs(now: number): number {
    return this.state(now) === "open" ? Math.max(0, this.cooldownMs - (now - this.openedAt)) : 0;
  }
}
