// SPDX-License-Identifier: Apache-2.0

//! Pure token-bucket rate limiter with an injected clock. Tokens are stored as
//! integer millitokens so refills never accumulate floating-point error; the
//! caller persists `BucketState` (for example per user or API key).

use std::fmt;

/// Validation error with a human-readable message.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct BucketError(pub String);

impl fmt::Display for BucketError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(&self.0)
    }
}

impl std::error::Error for BucketError {}

fn err<T>(m: impl Into<String>) -> Result<T, BucketError> {
    Err(BucketError(m.into()))
}

/// Persisted bucket state.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct BucketState {
    pub tokens_milli: u64,
    pub last_ms: i64,
}

/// Outcome of [`take`]: the next state plus the decision.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct TakeResult {
    pub state: BucketState,
    pub allowed: bool,
    /// 0 when allowed; otherwise milliseconds until `cost` tokens are available.
    pub retry_after_ms: u64,
}

fn capacity_milli(capacity: u64) -> Result<u64, BucketError> {
    if capacity == 0 {
        return err("capacity must be positive");
    }
    capacity.checked_mul(1000).ok_or_else(|| BucketError("capacity too large".into()))
}

/// A full bucket at `now_ms`.
pub fn new_bucket(capacity: u64, now_ms: i64) -> Result<BucketState, BucketError> {
    Ok(BucketState { tokens_milli: capacity_milli(capacity)?, last_ms: now_ms })
}

/// Refills by `(now - last) * rate_per_second` millitokens (a clock going
/// backwards adds nothing), then takes `cost` tokens if available. A denied
/// request keeps the refilled state and reports when to retry.
pub fn take(state: BucketState, now_ms: i64, cost: u64, capacity: u64, rate_per_second: u64) -> Result<TakeResult, BucketError> {
    let cap = capacity_milli(capacity)?;
    if rate_per_second == 0 {
        return err("ratePerSecond must be positive");
    }
    if cost == 0 {
        return err("cost must be positive");
    }
    if cost > capacity {
        return err("cost exceeds capacity");
    }
    let mut next = state;
    next.tokens_milli = next.tokens_milli.min(cap);
    if now_ms > next.last_ms {
        let elapsed = (now_ms as i128 - next.last_ms as i128) as u128;
        let refill = elapsed.saturating_mul(rate_per_second as u128);
        next.tokens_milli = (next.tokens_milli as u128).saturating_add(refill).min(cap as u128) as u64;
        next.last_ms = now_ms;
    }
    let need = cost * 1000; // cost <= capacity, so this cannot overflow
    if next.tokens_milli >= need {
        next.tokens_milli -= need;
        return Ok(TakeResult { state: next, allowed: true, retry_after_ms: 0 });
    }
    let missing = need - next.tokens_milli;
    Ok(TakeResult { state: next, allowed: false, retry_after_ms: missing.div_ceil(rate_per_second) })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn vector_sequence() {
        // (now, cost, allowed, tokensMilli, retryAfterMs)
        let steps: [(i64, u64, bool, u64, u64); 10] = [
            (0, 1, true, 4000, 0),
            (0, 1, true, 3000, 0),
            (0, 1, true, 2000, 0),
            (0, 1, true, 1000, 0),
            (0, 1, true, 0, 0),
            (0, 1, false, 0, 500),
            (250, 1, false, 500, 250),
            (500, 1, true, 0, 0),
            (500, 2, false, 0, 1000),
            (3000, 5, true, 0, 0),
        ];
        let mut state = new_bucket(5, 0).unwrap();
        assert_eq!(state.tokens_milli, 5000);
        for (i, (now, cost, allowed, tokens, retry)) in steps.into_iter().enumerate() {
            let r = take(state, now, cost, 5, 2).unwrap();
            assert_eq!((r.allowed, r.state.tokens_milli, r.retry_after_ms), (allowed, tokens, retry), "step {i}");
            state = r.state;
        }
    }

    #[test]
    fn clock_backwards_and_rejections() {
        let s = BucketState { tokens_milli: 0, last_ms: 1000 };
        let r = take(s, 500, 1, 5, 2).unwrap();
        assert!(!r.allowed);
        assert_eq!(r.state, s);
        let full = take(BucketState { tokens_milli: 0, last_ms: i64::MIN }, i64::MAX, 1, 5, u64::MAX).unwrap();
        assert_eq!(full.state.tokens_milli, 4000);
        assert!(take(s, 0, 6, 5, 2).is_err());
        assert!(take(s, 0, 0, 5, 2).is_err());
        assert!(take(s, 0, 1, 5, 0).is_err());
        assert!(new_bucket(0, 0).is_err());
        assert!(new_bucket(u64::MAX, 0).is_err());
    }
}
