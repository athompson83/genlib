// SPDX-License-Identifier: Apache-2.0

//! Circuit breaker as a pure state machine with an injected clock in
//! milliseconds. Closed: calls pass; `failure_threshold` consecutive failures
//! open it. Open: calls are rejected until `cooldown_ms` has passed since it
//! opened, then it is half-open. Half-open: at most `half_open_max` trial calls
//! are in flight at a time; a success closes the circuit and a failure re-opens
//! it, restarting the cooldown.

use std::fmt;

/// Invalid configuration.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct BreakerError(pub String);

impl fmt::Display for BreakerError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(&self.0)
    }
}

impl std::error::Error for BreakerError {}

/// Circuit state.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum State {
    Closed,
    Open,
    HalfOpen,
}

impl State {
    /// "closed", "open" or "half_open".
    pub fn as_str(self) -> &'static str {
        match self {
            State::Closed => "closed",
            State::Open => "open",
            State::HalfOpen => "half_open",
        }
    }
}

/// Breaker state; wrap it in a lock to share between threads.
#[derive(Clone, Debug)]
pub struct CircuitBreaker {
    threshold: u32,
    cooldown: i64,
    max_probes: u32,
    state: State,
    failures: u32,
    opened_at: i64,
    in_flight: u32,
}

impl Default for CircuitBreaker {
    /// Threshold 5, cooldown 30000 ms, one half-open trial.
    fn default() -> Self {
        Self::new(5, 30_000, 1).expect("valid defaults")
    }
}

impl CircuitBreaker {
    /// A closed breaker; requires failure_threshold >= 1, cooldown_ms >= 0 and half_open_max >= 1.
    pub fn new(failure_threshold: u32, cooldown_ms: i64, half_open_max: u32) -> Result<Self, BreakerError> {
        if failure_threshold < 1 {
            return Err(BreakerError("failure_threshold must be >= 1".into()));
        }
        if cooldown_ms < 0 {
            return Err(BreakerError("cooldown_ms must be >= 0".into()));
        }
        if half_open_max < 1 {
            return Err(BreakerError("half_open_max must be >= 1".into()));
        }
        Ok(Self {
            threshold: failure_threshold,
            cooldown: cooldown_ms,
            max_probes: half_open_max,
            state: State::Closed,
            failures: 0,
            opened_at: 0,
            in_flight: 0,
        })
    }

    /// The state at `now`, moving open to half-open once the cooldown has passed.
    pub fn state(&mut self, now: i64) -> State {
        if self.state == State::Open && now - self.opened_at >= self.cooldown {
            self.state = State::HalfOpen;
            self.in_flight = 0;
        }
        self.state
    }

    /// True when a call may proceed now; a half-open trial counts as in flight until it reports back.
    pub fn allow(&mut self, now: i64) -> bool {
        match self.state(now) {
            State::Closed => true,
            State::HalfOpen if self.in_flight < self.max_probes => {
                self.in_flight += 1;
                true
            }
            _ => false,
        }
    }

    /// Reports a successful call: closes a half-open circuit and resets the failure count.
    pub fn record_success(&mut self, now: i64) {
        if self.state(now) == State::HalfOpen {
            self.state = State::Closed;
            self.in_flight = 0;
        }
        self.failures = 0;
    }

    /// Reports a failed call: opens the circuit at the threshold or from half-open.
    pub fn record_failure(&mut self, now: i64) {
        let s = self.state(now);
        if s == State::HalfOpen || (s == State::Closed && self.failures + 1 >= self.threshold) {
            self.state = State::Open;
            self.opened_at = now;
            self.in_flight = 0;
            self.failures = 0;
        } else if s == State::Closed {
            self.failures += 1;
        }
    }

    /// Milliseconds until an open circuit lets a trial through (0 when not open).
    pub fn retry_after_ms(&mut self, now: i64) -> i64 {
        if self.state(now) == State::Open {
            (self.cooldown - (now - self.opened_at)).max(0)
        } else {
            0
        }
    }
}

#[cfg(test)]
#[allow(clippy::type_complexity, clippy::approx_constant)] // generated vector tables
mod tests {
    use super::*;

    #[derive(Debug, PartialEq)]
    enum W {
        B(bool),
        N(i64),
        S(&'static str),
    }

    #[test]
    fn scripts() {
        type Step = (&'static str, i64, Option<W>);
        let scripts: &[((u32, i64, u32), &[Step])] = &[
            ((2, 1000, 1), &[("allow", 0, Some(W::B(true))), ("failure", 0, None), ("state", 0, Some(W::S("closed"))), ("failure", 10, None), ("state", 10, Some(W::S("open"))), ("allow", 500, Some(W::B(false))), ("retry_after", 500, Some(W::N(510))), ("state", 1010, Some(W::S("half_open"))), ("allow", 1010, Some(W::B(true))), ("allow", 1011, Some(W::B(false))), ("success", 1020, None), ("state", 1020, Some(W::S("closed"))), ("allow", 1021, Some(W::B(true)))]),
            ((3, 500, 2), &[("failure", 0, None), ("success", 1, None), ("failure", 2, None), ("failure", 3, None), ("state", 3, Some(W::S("closed"))), ("failure", 4, None), ("state", 4, Some(W::S("open"))), ("state", 503, Some(W::S("open"))), ("allow", 504, Some(W::B(true))), ("allow", 505, Some(W::B(true))), ("allow", 506, Some(W::B(false))), ("failure", 507, None), ("state", 507, Some(W::S("open"))), ("retry_after", 600, Some(W::N(407))), ("state", 1007, Some(W::S("half_open"))), ("allow", 1008, Some(W::B(true))), ("success", 1009, None), ("state", 1009, Some(W::S("closed")))]),
            ((1, 0, 1), &[("failure", 5, None), ("state", 5, Some(W::S("half_open"))), ("allow", 5, Some(W::B(true))), ("allow", 5, Some(W::B(false))), ("failure", 6, None), ("state", 6, Some(W::S("half_open"))), ("allow", 6, Some(W::B(true)))]),
        ];
        for (n, ((threshold, cooldown, max), steps)) in scripts.iter().enumerate() {
            let mut b = CircuitBreaker::new(*threshold, *cooldown, *max).unwrap();
            for (i, (op, now, want)) in steps.iter().enumerate() {
                let got = match *op {
                    "allow" => Some(W::B(b.allow(*now))),
                    "success" => {
                        b.record_success(*now);
                        None
                    }
                    "failure" => {
                        b.record_failure(*now);
                        None
                    }
                    "state" => Some(W::S(b.state(*now).as_str())),
                    _ => Some(W::N(b.retry_after_ms(*now))),
                };
                assert_eq!(&got, want, "script {n} step {i} {op}@{now}");
            }
        }
    }

    #[test]
    fn invalid() {
        assert!(CircuitBreaker::new(0, 1000, 1).is_err());
        assert!(CircuitBreaker::new(1, -1, 1).is_err());
        assert!(CircuitBreaker::new(1, 1000, 0).is_err());
        assert_eq!(CircuitBreaker::default().state(0), State::Closed);
    }
}
