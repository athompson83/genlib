# SPDX-License-Identifier: Apache-2.0
"""Pure token-bucket rate limiter with an injected clock and integer millitokens.

State is a small immutable value the caller stores (in memory, Redis, a database row);
take() returns the next state, so no hidden timers or floating-point drift.
"""
from typing import NamedTuple


class BucketState(NamedTuple):
    tokens_milli: int
    last_ms: int


class TakeResult(NamedTuple):
    allowed: bool
    state: BucketState
    retry_after_ms: int


def _int(value: object, name: str, minimum: int) -> int:
    if isinstance(value, bool) or not isinstance(value, int):
        raise TypeError(f"{name} must be an integer")
    if value < minimum:
        raise ValueError(f"{name} must be >= {minimum}")
    return value


def new_bucket(capacity: int, now_ms: int) -> BucketState:
    """A full bucket (capacity * 1000 millitokens) at now_ms."""
    return BucketState(_int(capacity, "capacity", 1) * 1000, _int(now_ms, "now_ms", 0))


def take(state: BucketState, now_ms: int, cost: int, capacity: int, rate_per_second: int) -> TakeResult:
    """Refills by elapsed time (a clock going backwards adds nothing), then takes cost tokens.

    rate_per_second tokens per second equals rate_per_second millitokens per millisecond.
    A denied take keeps the refilled state and reports how long until cost tokens exist.
    """
    _int(now_ms, "now_ms", 0)
    _int(cost, "cost", 1)
    _int(capacity, "capacity", 1)
    _int(rate_per_second, "rate_per_second", 1)
    if cost > capacity:
        raise ValueError("cost must not exceed capacity")
    tokens, last = _int(state.tokens_milli, "tokens_milli", 0), _int(state.last_ms, "last_ms", 0)
    full = capacity * 1000
    if now_ms > last:
        tokens, last = min(full, tokens + (now_ms - last) * rate_per_second), now_ms
    need = cost * 1000
    if tokens >= need:
        return TakeResult(True, BucketState(tokens - need, last), 0)
    return TakeResult(False, BucketState(tokens, last), -(-(need - tokens) // rate_per_second))
