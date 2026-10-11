// SPDX-License-Identifier: Apache-2.0
// Circuit breaker as a pure state machine with an injected clock (milliseconds). closed: calls pass and
// failureThreshold consecutive failures open it. open: calls are rejected until cooldownMs has passed since it opened,
// then it is half_open. half_open: at most halfOpenMax trial calls run at a time; a success closes the circuit and a
// failure re-opens it (restarting the cooldown). Persist the value per dependency; it does no I/O.

public enum CircuitBreakerError: Error, Equatable {
    case invalidArgument(String)
}

public enum CircuitState: String, Equatable, Sendable {
    case closed, open
    case halfOpen = "half_open"
}

public struct CircuitBreaker: Equatable, Sendable {
    public let failureThreshold: Int
    public let cooldownMs: Int64
    public let halfOpenMax: Int
    private var current = CircuitState.closed
    private var failures = 0
    private var openedAt: Int64 = 0
    private var inFlight = 0

    /// A closed breaker; throws for failureThreshold < 1, cooldownMs < 0 or halfOpenMax < 1.
    public init(failureThreshold: Int = 5, cooldownMs: Int64 = 30000, halfOpenMax: Int = 1) throws {
        guard failureThreshold >= 1 else { throw CircuitBreakerError.invalidArgument("failureThreshold must be >= 1") }
        guard cooldownMs >= 0 else { throw CircuitBreakerError.invalidArgument("cooldownMs must be >= 0") }
        guard halfOpenMax >= 1 else { throw CircuitBreakerError.invalidArgument("halfOpenMax must be >= 1") }
        self.failureThreshold = failureThreshold; self.cooldownMs = cooldownMs; self.halfOpenMax = halfOpenMax
    }

    /// The state at now (an open circuit becomes half_open once the cooldown has passed).
    public mutating func state(_ now: Int64) -> CircuitState {
        if current == .open && now - openedAt >= cooldownMs { current = .halfOpen; inFlight = 0 }
        return current
    }

    /// True when a call may proceed now (a half-open trial counts as in flight until it reports back).
    public mutating func allow(_ now: Int64) -> Bool {
        switch state(now) {
        case .closed: return true
        case .halfOpen where inFlight < halfOpenMax: inFlight += 1; return true
        default: return false
        }
    }

    /// Reports a successful call: closes a half-open circuit and resets the failure count.
    public mutating func recordSuccess(_ now: Int64) {
        if state(now) == .halfOpen { current = .closed; inFlight = 0 }
        failures = 0
    }

    /// Reports a failed call: opens the circuit at the threshold or from half_open, else counts the failure.
    public mutating func recordFailure(_ now: Int64) {
        let s = state(now)
        if s == .halfOpen || (s == .closed && failures + 1 >= failureThreshold) {
            current = .open; openedAt = now; inFlight = 0; failures = 0
        } else if s == .closed {
            failures += 1
        }
    }

    /// Milliseconds until an open circuit lets a trial through (0 when not open).
    public mutating func retryAfterMs(_ now: Int64) -> Int64 {
        state(now) == .open ? max(0, cooldownMs - (now - openedAt)) : 0
    }
}
