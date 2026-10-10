// SPDX-License-Identifier: Apache-2.0
// In-process circuit breaker. State lives in this object only; it is not shared across instances.

export type CircuitState = "closed" | "open" | "half-open";

export interface CircuitBreakerOptions {
  /** Consecutive counted failures that open the circuit. 1–1000. */
  failureThreshold: number;
  /** Milliseconds the circuit stays open before allowing one half-open trial. 1–86400000. */
  resetAfterMs: number;
  /** Injected for deterministic tests. Default Date.now. */
  clock?: () => number;
  /** Return false for errors that should not count (for example validation errors). Default: all count. */
  isFailure?: (error: unknown) => boolean;
}

export class CircuitOpenError extends Error {
  readonly retryAfterMs: number;
  constructor(retryAfterMs: number) {
    super("Circuit is open; the call was not attempted.");
    this.name = "CircuitOpenError";
    this.retryAfterMs = Math.max(0, retryAfterMs);
  }
}

export interface CircuitBreaker {
  /** Current state; reports "half-open" once resetAfterMs has elapsed. */
  state(): CircuitState;
  /** Runs fn unless the circuit is open (or a half-open trial is already in flight). */
  execute<T>(fn: () => Promise<T> | T): Promise<T>;
  /** Force the breaker closed and clear counters. */
  reset(): void;
}

export function createCircuitBreaker(options: CircuitBreakerOptions): CircuitBreaker {
  const { failureThreshold, resetAfterMs } = options;
  if (!Number.isSafeInteger(failureThreshold) || failureThreshold < 1 || failureThreshold > 1000) {
    throw new RangeError("failureThreshold must be an integer 1–1000.");
  }
  if (!Number.isFinite(resetAfterMs) || resetAfterMs < 1 || resetAfterMs > 86_400_000) {
    throw new RangeError("resetAfterMs must be 1–86400000.");
  }
  const clock = options.clock ?? Date.now;
  const isFailure = options.isFailure ?? (() => true);
  let current: CircuitState = "closed";
  let failures = 0;
  let openedAt = 0;
  let trialInFlight = false;

  const refresh = (): CircuitState => {
    if (current === "open" && clock() - openedAt >= resetAfterMs) current = "half-open";
    return current;
  };
  const open = () => { current = "open"; openedAt = clock(); failures = 0; };

  return {
    state: refresh,
    reset() { current = "closed"; failures = 0; trialInFlight = false; },
    async execute<T>(fn: () => Promise<T> | T): Promise<T> {
      const state = refresh();
      if (state === "open") throw new CircuitOpenError(openedAt + resetAfterMs - clock());
      if (state === "half-open") {
        if (trialInFlight) throw new CircuitOpenError(0);
        trialInFlight = true;
      }
      const trial = state === "half-open";
      try {
        const result = await fn();
        if (trial || current === "closed") { current = "closed"; failures = 0; }
        return result;
      } catch (error) {
        if (isFailure(error)) {
          if (trial) open();
          else if (current === "closed" && ++failures >= failureThreshold) open();
        } else if (trial) {
          current = "closed"; failures = 0;
        }
        throw error;
      } finally {
        if (trial) trialInFlight = false;
      }
    },
  };
}
