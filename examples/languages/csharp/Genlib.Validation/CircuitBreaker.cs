// SPDX-License-Identifier: Apache-2.0
namespace Genlib.Validation;

/// <summary>
/// Circuit breaker as a pure state machine with an injected clock (milliseconds). closed: calls pass; failureThreshold
/// consecutive failures open it. open: calls are rejected until cooldownMs has passed since it opened, then it is half_open.
/// half_open: at most halfOpenMax trial calls at a time; a success closes the circuit, a failure re-opens it and restarts the
/// cooldown. Not thread-safe; guard it with a lock when shared.
/// </summary>
public sealed class CircuitBreaker {
    private readonly int _threshold, _maxProbes;
    private readonly long _cooldown;
    private string _state = "closed";
    private int _failures, _inFlight;
    private long _openedAt;

    /// <summary>Creates a closed breaker; throws <see cref="ArgumentOutOfRangeException"/> for threshold &lt; 1, cooldown &lt; 0 or halfOpenMax &lt; 1.</summary>
    public CircuitBreaker(int failureThreshold = 5, long cooldownMs = 30000, int halfOpenMax = 1) {
        if (failureThreshold < 1) throw new ArgumentOutOfRangeException(nameof(failureThreshold), "failureThreshold must be >= 1");
        if (cooldownMs < 0) throw new ArgumentOutOfRangeException(nameof(cooldownMs), "cooldownMs must be >= 0");
        if (halfOpenMax < 1) throw new ArgumentOutOfRangeException(nameof(halfOpenMax), "halfOpenMax must be >= 1");
        _threshold = failureThreshold;
        _cooldown = cooldownMs;
        _maxProbes = halfOpenMax;
    }

    /// <summary>"closed", "open" or "half_open" at time <paramref name="now"/> (an open circuit turns half_open once the cooldown passed).</summary>
    public string State(long now) {
        if (_state == "open" && now - _openedAt >= _cooldown) { _state = "half_open"; _inFlight = 0; }
        return _state;
    }

    /// <summary>True when a call may proceed now (a half-open trial counts as in flight until it reports back).</summary>
    public bool Allow(long now) {
        string s = State(now);
        if (s == "closed") return true;
        if (s == "half_open" && _inFlight < _maxProbes) { _inFlight++; return true; }
        return false;
    }

    /// <summary>Records a successful call: closes a half-open circuit and resets the failure count.</summary>
    public void RecordSuccess(long now) {
        if (State(now) == "half_open") { _state = "closed"; _inFlight = 0; }
        _failures = 0;
    }

    /// <summary>Records a failed call: opens the circuit at the threshold or re-opens a half-open one.</summary>
    public void RecordFailure(long now) {
        string s = State(now);
        if (s == "half_open" || (s == "closed" && _failures + 1 >= _threshold)) {
            _state = "open"; _openedAt = now; _inFlight = 0; _failures = 0;
        } else if (s == "closed") _failures++;
    }

    /// <summary>Milliseconds until an open circuit lets a trial through (0 when not open).</summary>
    public long RetryAfterMs(long now) => State(now) == "open" ? Math.Max(0, _cooldown - (now - _openedAt)) : 0;
}
