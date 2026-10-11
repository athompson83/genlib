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
    eq(1L, PaginationWindow.pageCount(0L, 10), "page count 0")
    eq(1L, PaginationWindow.pageCount(1L, 10), "page count 1")
    eq(1L, PaginationWindow.pageCount(10L, 10), "page count 2")
    eq(2L, PaginationWindow.pageCount(11L, 10), "page count 3")
    eq(40L, PaginationWindow.pageCount(999L, 25), "page count 4")
    eq(5L, PaginationWindow.pageCount(5L, 1), "page count 5")
    eq(0L, PaginationWindow.pageOffset(1L, 20), "offset 0")
    eq(40L, PaginationWindow.pageOffset(3L, 20), "offset 1")
    eq(listOf<Int?>(1), PaginationWindow.pageWindow(1, 1, 1, 1), "window 0")
    eq(listOf<Int?>(1, 2), PaginationWindow.pageWindow(1, 2, 1, 1), "window 1")
    eq(listOf<Int?>(1, 2), PaginationWindow.pageWindow(2, 2, 1, 1), "window 2")
    eq(listOf<Int?>(1, 2, 3), PaginationWindow.pageWindow(1, 3, 1, 1), "window 3")
    eq(listOf<Int?>(1, 2, 3), PaginationWindow.pageWindow(2, 3, 1, 1), "window 4")
    eq(listOf<Int?>(1, 2, 3), PaginationWindow.pageWindow(3, 3, 1, 1), "window 5")
    eq(listOf<Int?>(1, 2, 3, 4, 5), PaginationWindow.pageWindow(1, 5, 1, 1), "window 6")
    eq(listOf<Int?>(1, 2, 3, 4, 5), PaginationWindow.pageWindow(2, 5, 1, 1), "window 7")
    eq(listOf<Int?>(1, 2, 3, 4, 5), PaginationWindow.pageWindow(3, 5, 1, 1), "window 8")
    eq(listOf<Int?>(1, 2, 3, 4, 5), PaginationWindow.pageWindow(4, 5, 1, 1), "window 9")
    eq(listOf<Int?>(1, 2, 3, 4, 5), PaginationWindow.pageWindow(5, 5, 1, 1), "window 10")
    eq(listOf<Int?>(1, 2, 3, 4, 5, 6, 7), PaginationWindow.pageWindow(1, 7, 1, 1), "window 11")
    eq(listOf<Int?>(1, 2, 3, 4, 5, 6, 7), PaginationWindow.pageWindow(2, 7, 1, 1), "window 12")
    eq(listOf<Int?>(1, 2, 3, 4, 5, 6, 7), PaginationWindow.pageWindow(3, 7, 1, 1), "window 13")
    eq(listOf<Int?>(1, 2, 3, 4, 5, 6, 7), PaginationWindow.pageWindow(4, 7, 1, 1), "window 14")
    eq(listOf<Int?>(1, 2, 3, 4, 5, 6, 7), PaginationWindow.pageWindow(5, 7, 1, 1), "window 15")
    eq(listOf<Int?>(1, 2, 3, 4, 5, 6, 7), PaginationWindow.pageWindow(6, 7, 1, 1), "window 16")
    eq(listOf<Int?>(1, 2, 3, 4, 5, 6, 7), PaginationWindow.pageWindow(7, 7, 1, 1), "window 17")
    eq(listOf<Int?>(1, 2, 3, 4, 5, null, 8), PaginationWindow.pageWindow(1, 8, 1, 1), "window 18")
    eq(listOf<Int?>(1, 2, 3, 4, 5, null, 8), PaginationWindow.pageWindow(2, 8, 1, 1), "window 19")
    eq(listOf<Int?>(1, 2, 3, 4, 5, null, 8), PaginationWindow.pageWindow(3, 8, 1, 1), "window 20")
    eq(listOf<Int?>(1, 2, 3, 4, 5, null, 8), PaginationWindow.pageWindow(4, 8, 1, 1), "window 21")
    eq(listOf<Int?>(1, null, 4, 5, 6, 7, 8), PaginationWindow.pageWindow(6, 8, 1, 1), "window 22")
    eq(listOf<Int?>(1, null, 4, 5, 6, 7, 8), PaginationWindow.pageWindow(7, 8, 1, 1), "window 23")
    eq(listOf<Int?>(1, null, 4, 5, 6, 7, 8), PaginationWindow.pageWindow(8, 8, 1, 1), "window 24")
    eq(listOf<Int?>(1, 2, 3, 4, 5, null, 10), PaginationWindow.pageWindow(1, 10, 1, 1), "window 25")
    eq(listOf<Int?>(1, 2, 3, 4, 5, null, 10), PaginationWindow.pageWindow(2, 10, 1, 1), "window 26")
    eq(listOf<Int?>(1, 2, 3, 4, 5, null, 10), PaginationWindow.pageWindow(3, 10, 1, 1), "window 27")
    eq(listOf<Int?>(1, 2, 3, 4, 5, null, 10), PaginationWindow.pageWindow(4, 10, 1, 1), "window 28")
    eq(listOf<Int?>(1, null, 4, 5, 6, null, 10), PaginationWindow.pageWindow(5, 10, 1, 1), "window 29")
    eq(listOf<Int?>(1, null, 6, 7, 8, 9, 10), PaginationWindow.pageWindow(8, 10, 1, 1), "window 30")
    eq(listOf<Int?>(1, null, 6, 7, 8, 9, 10), PaginationWindow.pageWindow(9, 10, 1, 1), "window 31")
    eq(listOf<Int?>(1, null, 6, 7, 8, 9, 10), PaginationWindow.pageWindow(10, 10, 1, 1), "window 32")
    eq(listOf<Int?>(1, 2, 3, 4, 5, null, 20), PaginationWindow.pageWindow(1, 20, 1, 1), "window 33")
    eq(listOf<Int?>(1, 2, 3, 4, 5, null, 20), PaginationWindow.pageWindow(2, 20, 1, 1), "window 34")
    eq(listOf<Int?>(1, 2, 3, 4, 5, null, 20), PaginationWindow.pageWindow(3, 20, 1, 1), "window 35")
    eq(listOf<Int?>(1, 2, 3, 4, 5, null, 20), PaginationWindow.pageWindow(4, 20, 1, 1), "window 36")
    eq(listOf<Int?>(1, null, 9, 10, 11, null, 20), PaginationWindow.pageWindow(10, 20, 1, 1), "window 37")
    eq(listOf<Int?>(1, null, 16, 17, 18, 19, 20), PaginationWindow.pageWindow(18, 20, 1, 1), "window 38")
    eq(listOf<Int?>(1, null, 16, 17, 18, 19, 20), PaginationWindow.pageWindow(19, 20, 1, 1), "window 39")
    eq(listOf<Int?>(1, null, 16, 17, 18, 19, 20), PaginationWindow.pageWindow(20, 20, 1, 1), "window 40")
    eq(listOf<Int?>(1, 2, 3, 4, 5, null, 100), PaginationWindow.pageWindow(1, 100, 1, 1), "window 41")
    eq(listOf<Int?>(1, 2, 3, 4, 5, null, 100), PaginationWindow.pageWindow(2, 100, 1, 1), "window 42")
    eq(listOf<Int?>(1, 2, 3, 4, 5, null, 100), PaginationWindow.pageWindow(3, 100, 1, 1), "window 43")
    eq(listOf<Int?>(1, 2, 3, 4, 5, null, 100), PaginationWindow.pageWindow(4, 100, 1, 1), "window 44")
    eq(listOf<Int?>(1, null, 49, 50, 51, null, 100), PaginationWindow.pageWindow(50, 100, 1, 1), "window 45")
    eq(listOf<Int?>(1, null, 96, 97, 98, 99, 100), PaginationWindow.pageWindow(98, 100, 1, 1), "window 46")
    eq(listOf<Int?>(1, null, 96, 97, 98, 99, 100), PaginationWindow.pageWindow(99, 100, 1, 1), "window 47")
    eq(listOf<Int?>(1, null, 96, 97, 98, 99, 100), PaginationWindow.pageWindow(100, 100, 1, 1), "window 48")
    eq(listOf<Int?>(1, null, 8, 9, 10, 11, 12, null, 20), PaginationWindow.pageWindow(10, 20, 2, 1), "window 49")
    eq(listOf<Int?>(1, null, 10, null, 20), PaginationWindow.pageWindow(10, 20, 0, 1), "window 50")
    eq(listOf<Int?>(1, 2, null, 9, 10, 11, null, 19, 20), PaginationWindow.pageWindow(10, 20, 1, 2), "window 51")
    eq(listOf<Int?>(1, 2, 3, 4, 5, 6, 7, 8, null, 19, 20), PaginationWindow.pageWindow(1, 20, 2, 2), "window 52")
    eq(listOf<Int?>(1, 2, null, 13, 14, 15, 16, 17, 18, 19, 20), PaginationWindow.pageWindow(20, 20, 2, 2), "window 53")
    eq(listOf<Int?>(1, 2, 3, null, 47, 48, 49, 50, 51, 52, 53, null, 98, 99, 100), PaginationWindow.pageWindow(50, 100, 3, 3), "window 54")
    eq(PaginationWindow.pageWindow(10, 20, 1, 1), PaginationWindow.pageWindow(10, 20), "window defaults")
    throwsIae("invalid window 0") { PaginationWindow.pageWindow(0, 10, 1, 1) }
    throwsIae("invalid window 1") { PaginationWindow.pageWindow(11, 10, 1, 1) }
    throwsIae("invalid window 2") { PaginationWindow.pageWindow(1, 0, 1, 1) }
    throwsIae("invalid window 3") { PaginationWindow.pageWindow(1, 10, 6, 1) }
    throwsIae("invalid window 4") { PaginationWindow.pageWindow(1, 10, 1, 0) }
    throwsIae("invalid page count 0") { PaginationWindow.pageCount(-1L, 10) }
    throwsIae("invalid page count 1") { PaginationWindow.pageCount(5L, 0) }
    throwsIae("invalid page count 2") { PaginationWindow.pageCount(5L, 1001) }
    throwsIae("invalid offset") { PaginationWindow.pageOffset(0L, 20) }

    println("PaginationWindowTest: $passed passed, $failed failed")
    if (failed > 0) exitProcess(1)
}
