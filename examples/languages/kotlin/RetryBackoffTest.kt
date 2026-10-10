// SPDX-License-Identifier: Apache-2.0
import kotlin.system.exitProcess

private var passed = 0
private var failed = 0

private fun check(ok: Boolean, name: String) {
    if (ok) passed++ else { failed++; System.err.println("FAIL: $name") }
}

private fun eq(expected: Any?, actual: Any?, name: String) = check(expected == actual, "$name expected <$expected> got <$actual>")

private fun throwsIae(name: String, block: () -> Unit) {
    try { block(); check(false, "$name did not throw") } catch (e: IllegalArgumentException) { check(true, name) }
}

fun main() {
    eq(50L, RetryBackoff.backoffDelay(0, 100, 10000, 0.5), "backoff a0")
    eq(799L, RetryBackoff.backoffDelay(3, 100, 10000, 0.999), "backoff a3")
    eq(2500L, RetryBackoff.backoffDelay(10, 100, 10000, 0.25), "backoff a10")
    eq(0L, RetryBackoff.backoffDelay(3, 100, 10000, 0.0), "backoff a3zero")
    eq(5000L, RetryBackoff.backoffDelay(1000, 100, 10000, 0.5), "backoff huge attempt capped")
    val big = RetryBackoff.backoffDelay(62, 1L shl 40, Long.MAX_VALUE, 0.5)
    check(big > 0 && big <= Long.MAX_VALUE / 2 + 1, "backoff no overflow near long max: $big")
    eq(9000L, RetryBackoff.backoffDelay(Int.MAX_VALUE, 100, 10000, 0.9), "backoff max attempt capped")
    throwsIae("backoff negative attempt") { RetryBackoff.backoffDelay(-1, 100, 10000, 0.5) }
    throwsIae("backoff zero base") { RetryBackoff.backoffDelay(0, 0, 10000, 0.5) }
    throwsIae("backoff cap below base") { RetryBackoff.backoffDelay(0, 100, 99, 0.5) }
    throwsIae("backoff fraction 1") { RetryBackoff.backoffDelay(0, 100, 10000, 1.0) }
    throwsIae("backoff fraction NaN") { RetryBackoff.backoffDelay(0, 100, 10000, Double.NaN) }

    eq(120000L, RetryBackoff.retryAfterMs("120", 0), "retry_after secs")
    eq(30000L, RetryBackoff.retryAfterMs("Wed, 21 Oct 2026 07:28:00 GMT", 1792567650000L), "retry_after date")
    eq(0L, RetryBackoff.retryAfterMs("Wed, 21 Oct 2015 07:28:00 GMT", 1792567650000L), "retry_after past")
    eq(0L, RetryBackoff.retryAfterMs("0", 5), "retry_after zero seconds")
    // Unparseable values return null rather than throwing.
    for (bad in listOf("-5", "1.5", "soon", "", "Thu, 21 Oct 2026 07:28:00 GMT", "99999999999999999999")) {
        eq(null, RetryBackoff.retryAfterMs(bad, 0), "retry_after rejects '$bad'")
    }

    println("RetryBackoffTest: $passed passed, $failed failed")
    if (failed > 0) exitProcess(1)
}
