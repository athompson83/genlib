// SPDX-License-Identifier: Apache-2.0
import java.time.LocalDateTime
import java.time.ZoneOffset
import java.time.format.DateTimeFormatter
import java.time.format.DateTimeParseException
import java.time.format.ResolverStyle
import java.util.Locale
import kotlin.math.floor

/** Full-jitter exponential backoff and HTTP Retry-After parsing (delta-seconds or IMF-fixdate). */
object RetryBackoff {
    private val IMF_FIXDATE: DateTimeFormatter =
        DateTimeFormatter.ofPattern("EEE, dd MMM uuuu HH:mm:ss 'GMT'", Locale.US).withResolverStyle(ResolverStyle.STRICT)

    /** floor(randomFraction * min(capMs, baseMs * 2^attempt)); the cap is applied before any overflow can occur. */
    fun backoffDelay(attempt: Int, baseMs: Long, capMs: Long, randomFraction: Double): Long {
        require(attempt >= 0) { "attempt must be >= 0" }
        require(baseMs > 0) { "baseMs must be > 0" }
        require(capMs >= baseMs) { "capMs must be >= baseMs" }
        require(randomFraction >= 0.0 && randomFraction < 1.0) { "randomFraction must be in [0, 1)" }
        val ceiling = if (attempt < 63 && baseMs <= (capMs shr attempt)) baseMs shl attempt else capMs
        return floor(randomFraction * ceiling).toLong()
    }

    /**
     * Milliseconds to wait for a Retry-After value: delta-seconds give seconds * 1000, an IMF-fixdate gives
     * max(0, date - nowMs). Returns null for anything else (including seconds that overflow a Long of milliseconds).
     */
    fun retryAfterMs(headerValue: String, nowMs: Long): Long? {
        val v = headerValue.trim()
        if (v.isNotEmpty() && v.all { it in '0'..'9' }) {
            return try { Math.multiplyExact(v.toLong(), 1000L) } catch (e: ArithmeticException) { null } catch (e: NumberFormatException) { null }
        }
        val at = try {
            LocalDateTime.parse(v, IMF_FIXDATE).toInstant(ZoneOffset.UTC).toEpochMilli()
        } catch (e: DateTimeParseException) {
            return null
        }
        return if (at > nowMs) at - nowMs else 0
    }
}
