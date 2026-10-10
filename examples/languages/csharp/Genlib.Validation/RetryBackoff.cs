// SPDX-License-Identifier: Apache-2.0
using System.Globalization;

namespace Genlib.Validation;

/// <summary>Full-jitter exponential backoff and HTTP Retry-After parsing.</summary>
public static class RetryBackoff {
    /// <summary>floor(randomFraction * min(capMs, baseMs * 2^attempt)); the cap is applied before any overflow can occur.</summary>
    public static long BackoffDelay(int attempt, long baseMs, long capMs, double randomFraction) {
        if (attempt < 0) throw new ArgumentOutOfRangeException(nameof(attempt), "attempt must be >= 0");
        if (baseMs <= 0) throw new ArgumentOutOfRangeException(nameof(baseMs), "baseMs must be > 0");
        if (capMs < baseMs) throw new ArgumentOutOfRangeException(nameof(capMs), "capMs must be >= baseMs");
        if (!(randomFraction >= 0 && randomFraction < 1)) throw new ArgumentOutOfRangeException(nameof(randomFraction), "randomFraction must be in [0, 1)");
        long ceiling = capMs;
        if (attempt < 63 && baseMs <= (capMs >> attempt)) ceiling = Math.Min(capMs, baseMs << attempt);
        return (long)Math.Floor(randomFraction * ceiling);
    }

    /// <summary>
    /// Milliseconds to wait for a Retry-After value: delay-seconds or an IMF-fixdate relative to <paramref name="nowMs"/> (never negative).
    /// Returns null when the value is neither form; throws <see cref="OverflowException"/> for an out-of-range number of seconds.
    /// </summary>
    public static long? RetryAfterMs(string headerValue, long nowMs) {
        ArgumentNullException.ThrowIfNull(headerValue);
        string v = headerValue.Trim();
        if (v.Length > 0 && v.All(c => c is >= '0' and <= '9')) {
            long seconds = long.Parse(v, NumberStyles.None, CultureInfo.InvariantCulture);
            return checked(seconds * 1000);
        }
        if (DateTime.TryParseExact(v, "ddd, dd MMM yyyy HH:mm:ss 'GMT'", CultureInfo.InvariantCulture,
                DateTimeStyles.AssumeUniversal | DateTimeStyles.AdjustToUniversal, out DateTime date)) {
            long dateMs = new DateTimeOffset(date, TimeSpan.Zero).ToUnixTimeMilliseconds();
            return Math.Max(0, dateMs - nowMs);
        }
        return null;
    }
}
