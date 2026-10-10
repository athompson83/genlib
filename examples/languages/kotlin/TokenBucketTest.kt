// SPDX-License-Identifier: Apache-2.0
import kotlin.system.exitProcess

private var passed = 0
private var failed = 0

private fun check(ok: Boolean, name: String) {
    if (ok) passed++ else { failed++; System.err.println("FAIL: $name") }
}

private fun eq(expected: Any, actual: Any?, name: String) = check(expected == actual, "$name expected <$expected> got <$actual>")

private fun throwsIae(name: String, block: () -> Unit) {
    try { block(); check(false, "$name did not throw") } catch (e: IllegalArgumentException) { check(true, name) }
}

fun main() {
    // now, cost, allowed, tokensMilli, retryAfterMs
    data class Step(val now: Long, val cost: Long, val allowed: Boolean, val tokensMilli: Long, val retryAfterMs: Long)
    val steps = listOf(
        Step(0, 1, true, 4000, 0), Step(0, 1, true, 3000, 0), Step(0, 1, true, 2000, 0), Step(0, 1, true, 1000, 0),
        Step(0, 1, true, 0, 0), Step(0, 1, false, 0, 500), Step(250, 1, false, 500, 250), Step(500, 1, true, 0, 0),
        Step(500, 2, false, 0, 1000), Step(3000, 5, true, 0, 0),
    )
    var state = TokenBucket.newBucket(5, 0)
    eq(5000L, state.tokensMilli, "new bucket starts full")
    for ((i, s) in steps.withIndex()) {
        val r = TokenBucket.take(state, s.now, s.cost, 5, 2)
        eq(s.allowed, r.allowed, "step $i allowed")
        eq(s.tokensMilli, r.state.tokensMilli, "step $i tokensMilli")
        eq(s.retryAfterMs, r.retryAfterMs, "step $i retryAfterMs")
        state = r.state
    }
    val back = TokenBucket.take(TokenBucket.State(1000, 1000), 500, 1, 5, 2)
    eq(0L, back.state.tokensMilli, "clock going backwards adds nothing")
    eq(1000L, back.state.lastMs, "clock going backwards keeps lastMs")
    val huge = TokenBucket.take(TokenBucket.State(0, Long.MIN_VALUE), Long.MAX_VALUE, 5, 5, Long.MAX_VALUE)
    check(huge.allowed && huge.state.tokensMilli == 0L, "huge elapsed refills without overflow")
    throwsIae("cost above capacity") { TokenBucket.take(TokenBucket.newBucket(5, 0), 0, 6, 5, 2) }
    throwsIae("zero cost") { TokenBucket.take(TokenBucket.newBucket(5, 0), 0, 0, 5, 2) }
    throwsIae("zero rate") { TokenBucket.take(TokenBucket.newBucket(5, 0), 0, 1, 5, 0) }
    throwsIae("zero capacity") { TokenBucket.newBucket(0, 0) }
    throwsIae("capacity overflow") { TokenBucket.newBucket(Long.MAX_VALUE, 0) }

    println("TokenBucketTest: $passed passed, $failed failed")
    if (failed > 0) exitProcess(1)
}
