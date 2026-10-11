// SPDX-License-Identifier: Apache-2.0
// Generated from the wave-12 capability vectors; edit the vectors, not the literals.
import kotlin.system.exitProcess

private var passed = 0
private var failed = 0

private fun check(ok: Boolean, name: String) {
    if (ok) passed++ else { failed++; System.err.println("FAIL: $name") }
}

private fun eq(expected: Any?, actual: Any?, name: String) = check(expected == actual, "$name expected <$expected> got <$actual>")

/** Equality plus identical toString, so map entry order is checked too. */
private fun eqOrd(expected: Any?, actual: Any?, name: String) {
    eq(expected, actual, name)
    eq(expected.toString(), actual.toString(), "$name (order)")
}

/** Relative tolerance 1e-9 (absolute 1e-12 near zero). */
private fun near(expected: Double, actual: Double, name: String) =
    check(Math.abs(expected - actual) <= maxOf(1e-9 * maxOf(Math.abs(expected), Math.abs(actual)), 1e-12), "$name expected <$expected> got <$actual>")

private fun throwsIae(name: String, block: () -> Unit) {
    try { block(); check(false, "$name did not throw") } catch (e: IllegalArgumentException) { check(true, name) }
}

private fun throwsMsg(prefix: String, name: String, block: () -> Unit) {
    try { block(); check(false, "$name did not throw") } catch (e: IllegalArgumentException) {
        check(e.message?.startsWith(prefix) == true, "$name message <${e.message}>")
    }
}

private fun omap(vararg kv: Pair<String, Any?>): LinkedHashMap<String, Any?> = linkedMapOf(*kv)

private fun lst(vararg xs: Any?): ArrayList<Any?> = arrayListOf(*xs)

fun main() {
    eq(listOf<Pair<Long, Long>>(1L to 6L, 8L to 10L, 15L to 20L), IntervalMerge.merge(listOf<Pair<Long, Long>>(1L to 3L, 2L to 6L, 8L to 10L, 15L to 18L, 18L to 20L)), "merge 0")
    eq(listOf<Pair<Long, Long>>(1L to 3L, 5L to 7L), IntervalMerge.merge(listOf<Pair<Long, Long>>(5L to 7L, 1L to 2L, 2L to 3L)), "merge 1")
    eq(listOf<Pair<Long, Long>>(), IntervalMerge.merge(listOf<Pair<Long, Long>>()), "merge 2")
    eq(listOf<Pair<Long, Long>>(-5L to 4L), IntervalMerge.merge(listOf<Pair<Long, Long>>(-5L to -1L, -3L to 4L)), "merge 3")
    eq(listOf<Pair<Long, Long>>(1L to 2L, 5L to 6L, 8L to 9L, 17L to 20L), IntervalMerge.intersect(listOf<Pair<Long, Long>>(1L to 3L, 2L to 6L, 8L to 10L, 15L to 18L, 18L to 20L), listOf<Pair<Long, Long>>(0L to 2L, 5L to 9L, 17L to 30L)), "intersect 0")
    eq(listOf<Pair<Long, Long>>(), IntervalMerge.intersect(listOf<Pair<Long, Long>>(1L to 2L), listOf<Pair<Long, Long>>(2L to 3L)), "intersect 1")
    eq(listOf<Pair<Long, Long>>(10L to 20L, 30L to 40L), IntervalMerge.intersect(listOf<Pair<Long, Long>>(0L to 100L), listOf<Pair<Long, Long>>(10L to 20L, 30L to 40L)), "intersect 2")
    eq(listOf<Pair<Long, Long>>(2L to 5L, 9L to 10L, 15L to 17L), IntervalMerge.subtract(listOf<Pair<Long, Long>>(1L to 3L, 2L to 6L, 8L to 10L, 15L to 18L, 18L to 20L), listOf<Pair<Long, Long>>(0L to 2L, 5L to 9L, 17L to 30L)), "subtract 0")
    eq(listOf<Pair<Long, Long>>(0L to 2L, 3L to 5L, 7L to 10L), IntervalMerge.subtract(listOf<Pair<Long, Long>>(0L to 10L), listOf<Pair<Long, Long>>(2L to 3L, 5L to 7L)), "subtract 1")
    eq(listOf<Pair<Long, Long>>(), IntervalMerge.subtract(listOf<Pair<Long, Long>>(0L to 10L), listOf<Pair<Long, Long>>(0L to 10L)), "subtract 2")
    eq(listOf<Pair<Long, Long>>(0L to 10L), IntervalMerge.subtract(listOf<Pair<Long, Long>>(0L to 10L), listOf<Pair<Long, Long>>()), "subtract 3")
    eq(listOf<Pair<Long, Long>>(0L to 1L, 6L to 8L, 10L to 15L, 20L to 25L), IntervalMerge.gaps(listOf<Pair<Long, Long>>(1L to 3L, 2L to 6L, 8L to 10L, 15L to 18L, 18L to 20L), 0L, 25L), "gaps 0")
    eq(listOf<Pair<Long, Long>>(3L to 5L), IntervalMerge.gaps(listOf<Pair<Long, Long>>(), 3L, 5L), "gaps 1")
    eq(12L, IntervalMerge.total(listOf<Pair<Long, Long>>(1L to 3L, 2L to 6L, 8L to 10L, 15L to 18L, 18L to 20L)), "total 0")
    eq(19L, IntervalMerge.total(listOf<Pair<Long, Long>>(0L to 2L, 5L to 9L, 17L to 30L)), "total 1")
    eq(true, IntervalMerge.overlaps(1L to 3L, 2L to 4L), "overlaps 0")
    eq(false, IntervalMerge.overlaps(1L to 3L, 3L to 4L), "overlaps 1")
    eq(true, IntervalMerge.overlaps(5L to 9L, 6L to 7L), "overlaps 2")
    eq(false, IntervalMerge.overlaps(1L to 2L, 5L to 6L), "overlaps 3")
    eq(false, IntervalMerge.contains(listOf<Pair<Long, Long>>(1L to 3L, 2L to 6L, 8L to 10L, 15L to 18L, 18L to 20L), 6L), "contains 0")
    eq(true, IntervalMerge.contains(listOf<Pair<Long, Long>>(1L to 3L, 2L to 6L, 8L to 10L, 15L to 18L, 18L to 20L), 5L), "contains 1")
    eq(false, IntervalMerge.contains(listOf<Pair<Long, Long>>(1L to 3L, 2L to 6L, 8L to 10L, 15L to 18L, 18L to 20L), 20L), "contains 2")
    eq(true, IntervalMerge.contains(listOf<Pair<Long, Long>>(1L to 3L, 2L to 6L, 8L to 10L, 15L to 18L, 18L to 20L), 19L), "contains 3")
    eq(false, IntervalMerge.contains(listOf<Pair<Long, Long>>(1L to 3L, 2L to 6L, 8L to 10L, 15L to 18L, 18L to 20L), 0L), "contains 4")
    throwsIae("invalid 0") { IntervalMerge.merge(listOf<Pair<Long, Long>>(3L to 3L)) }
    throwsIae("invalid 1") { IntervalMerge.merge(listOf<Pair<Long, Long>>(5L to 1L)) }
    throwsIae("invalid gap bounds") { IntervalMerge.gaps(listOf(), 5L, 5L) }
    throwsIae("invalid overlaps") { IntervalMerge.overlaps(2L to 2L, 1L to 3L) }

    println("IntervalMergeTest: $passed passed, $failed failed")
    if (failed > 0) exitProcess(1)
}
