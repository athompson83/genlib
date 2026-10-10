# SPDX-License-Identifier: Apache-2.0
"""Circuit breaker as a pure state machine with an injected clock (milliseconds).

closed: calls pass; failure_threshold consecutive failures open it. open: calls are rejected until
cooldown_ms has passed since it opened, then it is half_open. half_open: at most half_open_max trial calls
are in flight at a time; a success closes the circuit, a failure re-opens it and restarts the cooldown.
"""


class CircuitBreaker:
    """Consecutive-failure circuit breaker; pass the current time in milliseconds to every method."""

    def __init__(self, failure_threshold: int = 5, cooldown_ms: int = 30000, half_open_max: int = 1) -> None:
        for name, value, low in (("failure_threshold", failure_threshold, 1), ("cooldown_ms", cooldown_ms, 0), ("half_open_max", half_open_max, 1)):
            if isinstance(value, bool) or not isinstance(value, int) or value < low:
                raise ValueError(f"{name} must be an integer >= {low}")
        self._threshold = failure_threshold
        self._cooldown = cooldown_ms
        self._max_trials = half_open_max
        self._state = "closed"
        self._failures = 0
        self._opened_at = 0
        self._in_flight = 0

    def state(self, now: int) -> str:
        """'closed', 'open' or 'half_open' at time now (an open circuit turns half_open after the cooldown)."""
        if self._state == "open" and now - self._opened_at >= self._cooldown:
            self._state, self._in_flight = "half_open", 0
        return self._state

    def allow(self, now: int) -> bool:
        """True when a call may proceed now; a half-open trial counts as in flight until it reports back."""
        s = self.state(now)
        if s == "closed":
            return True
        if s == "half_open" and self._in_flight < self._max_trials:
            self._in_flight += 1
            return True
        return False

    def record_success(self, now: int) -> None:
        """Report a successful call: resets the failure count and closes a half-open circuit."""
        if self.state(now) == "half_open":
            self._state, self._in_flight = "closed", 0
        self._failures = 0

    def record_failure(self, now: int) -> None:
        """Report a failed call: opens the circuit at the threshold or when a half-open trial fails."""
        s = self.state(now)
        if s == "half_open" or (s == "closed" and self._failures + 1 >= self._threshold):
            self._state, self._opened_at, self._in_flight, self._failures = "open", now, 0, 0
        elif s == "closed":
            self._failures += 1

    def retry_after_ms(self, now: int) -> int:
        """Milliseconds until an open circuit lets a trial through (0 when not open)."""
        if self.state(now) != "open":
            return 0
        return max(0, self._cooldown - (now - self._opened_at))
