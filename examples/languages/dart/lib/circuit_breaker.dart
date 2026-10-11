// SPDX-License-Identifier: Apache-2.0
/// Circuit breaker as a pure state machine with an injected clock (milliseconds).
library;

/// closed: calls pass; failureThreshold consecutive failures open it. open: calls are rejected until cooldownMs has passed
/// since it opened, then it is half_open. half_open: at most halfOpenMax trial calls at a time; a success closes the circuit,
/// a failure re-opens it and restarts the cooldown.
class CircuitBreaker {
  final int _threshold, _cooldown, _maxProbes;
  String _state = 'closed';
  int _failures = 0, _openedAt = 0, _inFlight = 0;

  /// Creates a closed breaker; throws [RangeError] for threshold < 1, cooldown < 0 or halfOpenMax < 1.
  CircuitBreaker({int failureThreshold = 5, int cooldownMs = 30000, int halfOpenMax = 1})
      : _threshold = failureThreshold,
        _cooldown = cooldownMs,
        _maxProbes = halfOpenMax {
    if (failureThreshold < 1) throw RangeError.value(failureThreshold, 'failureThreshold', 'must be >= 1');
    if (cooldownMs < 0) throw RangeError.value(cooldownMs, 'cooldownMs', 'must be >= 0');
    if (halfOpenMax < 1) throw RangeError.value(halfOpenMax, 'halfOpenMax', 'must be >= 1');
  }

  /// "closed", "open" or "half_open" at time [now] (an open circuit turns half_open once the cooldown passed).
  String state(int now) {
    if (_state == 'open' && now - _openedAt >= _cooldown) {
      _state = 'half_open';
      _inFlight = 0;
    }
    return _state;
  }

  /// True when a call may proceed now (a half-open trial counts as in flight until it reports back).
  bool allow(int now) {
    final s = state(now);
    if (s == 'closed') return true;
    if (s == 'half_open' && _inFlight < _maxProbes) {
      _inFlight++;
      return true;
    }
    return false;
  }

  /// Records a successful call: closes a half-open circuit and resets the failure count.
  void recordSuccess(int now) {
    if (state(now) == 'half_open') {
      _state = 'closed';
      _inFlight = 0;
    }
    _failures = 0;
  }

  /// Records a failed call: opens the circuit at the threshold or re-opens a half-open one.
  void recordFailure(int now) {
    final s = state(now);
    if (s == 'half_open' || (s == 'closed' && _failures + 1 >= _threshold)) {
      _state = 'open';
      _openedAt = now;
      _inFlight = 0;
      _failures = 0;
    } else if (s == 'closed') {
      _failures++;
    }
  }

  /// Milliseconds until an open circuit lets a trial through (0 when not open).
  int retryAfterMs(int now) {
    if (state(now) != 'open') return 0;
    final left = _cooldown - (now - _openedAt);
    return left > 0 ? left : 0;
  }
}
