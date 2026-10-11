// SPDX-License-Identifier: Apache-2.0

// Package breaker is a circuit breaker as a pure state machine with an
// injected clock in milliseconds. Closed: calls pass; failureThreshold
// consecutive failures open it. Open: calls are rejected until cooldownMs has
// passed since it opened, then it is half-open. Half-open: at most halfOpenMax
// trial calls are in flight at a time; a success closes the circuit and a
// failure re-opens it, restarting the cooldown.
package breaker

import "errors"

// State is "closed", "open" or "half_open".
type State string

// Circuit states.
const (
	Closed   State = "closed"
	Open     State = "open"
	HalfOpen State = "half_open"
)

// Defaults for New.
const (
	DefaultFailureThreshold = 5
	DefaultCooldownMs       = 30000
	DefaultHalfOpenMax      = 1
)

// CircuitBreaker holds the state; it is not safe for concurrent use without a lock.
type CircuitBreaker struct {
	threshold, maxProbes int
	cooldown             int64
	state                State
	failures, inFlight   int
	openedAt             int64
}

// New returns a closed breaker; failureThreshold >= 1, cooldownMs >= 0 and halfOpenMax >= 1.
func New(failureThreshold int, cooldownMs int64, halfOpenMax int) (*CircuitBreaker, error) {
	switch {
	case failureThreshold < 1:
		return nil, errors.New("breaker: failureThreshold must be >= 1")
	case cooldownMs < 0:
		return nil, errors.New("breaker: cooldownMs must be >= 0")
	case halfOpenMax < 1:
		return nil, errors.New("breaker: halfOpenMax must be >= 1")
	}
	return &CircuitBreaker{threshold: failureThreshold, cooldown: cooldownMs, maxProbes: halfOpenMax, state: Closed}, nil
}

// State returns the state at now, moving open to half-open once the cooldown has passed.
func (b *CircuitBreaker) State(now int64) State {
	if b.state == Open && now-b.openedAt >= b.cooldown {
		b.state, b.inFlight = HalfOpen, 0
	}
	return b.state
}

// Allow reports whether a call may proceed now; a half-open trial counts as in flight until it reports back.
func (b *CircuitBreaker) Allow(now int64) bool {
	switch b.State(now) {
	case Closed:
		return true
	case HalfOpen:
		if b.inFlight < b.maxProbes {
			b.inFlight++
			return true
		}
	}
	return false
}

// RecordSuccess reports a successful call; it closes a half-open circuit and resets the failure count.
func (b *CircuitBreaker) RecordSuccess(now int64) {
	if b.State(now) == HalfOpen {
		b.state, b.inFlight = Closed, 0
	}
	b.failures = 0
}

// RecordFailure reports a failed call; it opens the circuit at the threshold or from half-open.
func (b *CircuitBreaker) RecordFailure(now int64) {
	s := b.State(now)
	if s == HalfOpen || (s == Closed && b.failures+1 >= b.threshold) {
		b.state, b.openedAt, b.inFlight, b.failures = Open, now, 0, 0
	} else if s == Closed {
		b.failures++
	}
}

// RetryAfterMs returns milliseconds until an open circuit lets a trial through (0 when not open).
func (b *CircuitBreaker) RetryAfterMs(now int64) int64 {
	if b.State(now) != Open {
		return 0
	}
	if r := b.cooldown - (now - b.openedAt); r > 0 {
		return r
	}
	return 0
}
