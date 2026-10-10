// SPDX-License-Identifier: Apache-2.0
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeParseException;
import java.time.format.ResolverStyle;
import java.util.Locale;

/** Full-jitter exponential backoff and HTTP Retry-After parsing (delta-seconds or IMF-fixdate). */
public final class RetryBackoff {
    private static final DateTimeFormatter IMF_FIXDATE =
        DateTimeFormatter.ofPattern("EEE, dd MMM uuuu HH:mm:ss 'GMT'", Locale.US).withResolverStyle(ResolverStyle.STRICT);

    private RetryBackoff() {}

    /** floor(randomFraction * min(capMs, baseMs * 2^attempt)); the cap is applied before any overflow can occur. */
    public static long backoffDelay(int attempt, long baseMs, long capMs, double randomFraction) {
        if (attempt < 0) throw new IllegalArgumentException("attempt must be >= 0");
        if (baseMs <= 0) throw new IllegalArgumentException("baseMs must be > 0");
        if (capMs < baseMs) throw new IllegalArgumentException("capMs must be >= baseMs");
        if (!(randomFraction >= 0.0 && randomFraction < 1.0)) throw new IllegalArgumentException("randomFraction must be in [0, 1)");
        long ceiling = attempt < 63 && baseMs <= (capMs >> attempt) ? baseMs << attempt : capMs;
        return (long) Math.floor(randomFraction * ceiling);
    }

    /**
     * Milliseconds to wait for a Retry-After value: delta-seconds give seconds * 1000, an IMF-fixdate gives
     * max(0, date - nowMs). Anything else throws IllegalArgumentException.
     */
    public static long retryAfterMs(String headerValue, long nowMs) {
        if (headerValue == null) throw new IllegalArgumentException("Retry-After value is required");
        String v = headerValue.trim();
        if (!v.isEmpty() && v.chars().allMatch(c -> c >= '0' && c <= '9')) {
            try { return Math.multiplyExact(Long.parseLong(v), 1000L); }
            catch (ArithmeticException | NumberFormatException e) { throw new IllegalArgumentException("Retry-After seconds overflow"); }
        }
        long at;
        try { at = LocalDateTime.parse(v, IMF_FIXDATE).toInstant(ZoneOffset.UTC).toEpochMilli(); }
        catch (DateTimeParseException e) { throw new IllegalArgumentException("Retry-After is neither delta-seconds nor an IMF-fixdate"); }
        return at > nowMs ? at - nowMs : 0;
    }
}
