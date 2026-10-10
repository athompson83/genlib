// SPDX-License-Identifier: Apache-2.0

// Package tokenbucket is a pure token-bucket rate limiter with an injected
// clock and integer millitokens. Take returns the next state; the caller
// stores it wherever it likes.
package tokenbucket

import (
	"errors"
	"math"
)

// State is the stored bucket: millitokens and the last refill time.
type State struct {
	TokensMilli int64
	LastMs      int64
}

// Result is the outcome of Take.
type Result struct {
	Allowed      bool
	State        State
	RetryAfterMs int64
}

const maxCapacity = math.MaxInt64 / 1000

// New returns a full bucket (capacity * 1000 millitokens) at nowMs.
func New(capacity, nowMs int64) (State, error) {
	if capacity < 1 || capacity > maxCapacity {
		return State{}, errors.New("tokenbucket: capacity must be in [1, MaxInt64/1000]")
	}
	if nowMs < 0 {
		return State{}, errors.New("tokenbucket: nowMs must be >= 0")
	}
	return State{capacity * 1000, nowMs}, nil
}

// Take refills by elapsed time (a clock going backwards adds nothing), then
// takes cost tokens. ratePerSecond tokens per second equals ratePerSecond
// millitokens per millisecond. A denied take keeps the refilled state and
// reports how long until cost tokens exist.
func Take(s State, nowMs, cost, capacity, ratePerSecond int64) (Result, error) {
	switch {
	case capacity < 1 || capacity > maxCapacity:
		return Result{}, errors.New("tokenbucket: capacity must be in [1, MaxInt64/1000]")
	case cost < 1:
		return Result{}, errors.New("tokenbucket: cost must be >= 1")
	case cost > capacity:
		return Result{}, errors.New("tokenbucket: cost must not exceed capacity")
	case ratePerSecond < 1:
		return Result{}, errors.New("tokenbucket: ratePerSecond must be >= 1")
	case nowMs < 0 || s.LastMs < 0 || s.TokensMilli < 0:
		return Result{}, errors.New("tokenbucket: times and tokens must be >= 0")
	}
	full := capacity * 1000
	tokens, last := s.TokensMilli, s.LastMs
	if tokens > full {
		tokens = full
	}
	if nowMs > last {
		elapsed := nowMs - last
		if elapsed > (full-tokens)/ratePerSecond {
			tokens = full // refill would reach or pass capacity; avoids overflow
		} else {
			tokens += elapsed * ratePerSecond
		}
		last = nowMs
	}
	need := cost * 1000
	if tokens >= need {
		return Result{true, State{tokens - need, last}, 0}, nil
	}
	missing := need - tokens
	return Result{false, State{tokens, last}, (missing + ratePerSecond - 1) / ratePerSecond}, nil
}
