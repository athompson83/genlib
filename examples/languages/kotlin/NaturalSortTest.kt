// SPDX-License-Identifier: Apache-2.0
import kotlin.system.exitProcess

private var passed = 0
private var failed = 0

private fun check(ok: Boolean, name: String) {
    if (ok) passed++ else { failed++; System.err.println("FAIL: $name") }
}

private fun eq(expected: Any?, actual: Any?, name: String) = check(expected == actual, "$name expected <$expected> got <$actual>")

private fun near(expected: Double, actual: Double, tol: Double, name: String) =
    check(Math.abs(expected - actual) <= tol, "$name expected <$expected> got <$actual>")

private fun nearAll(expected: DoubleArray, actual: DoubleArray, tol: Double, name: String) {
    check(expected.size == actual.size, "$name length")
    for (i in 0 until minOf(expected.size, actual.size)) near(expected[i], actual[i], tol, "$name[$i]")
}

private fun throwsIae(name: String, block: () -> Unit) {
    try { block(); check(false, "$name did not throw") } catch (e: IllegalArgumentException) { check(true, name) }
}

fun main() {
    eq(listOf<String>("", "9", "10", "A", "a", "b", "file1", "File1.txt", "file1.txt", "file01.txt", "file2.txt", "file10.txt", "x02y1", "x2y9", "x2y10"), NaturalSort.naturalSort(listOf<String>("file10.txt", "file2.txt", "File1.txt", "file1.txt", "file01.txt", "a", "A", "b", "10", "9", "x2y10", "x2y9", "x02y1", "", "file1")), "sorted 0")
    eq(listOf<String>("v1.2.0", "v1.2.10", "v1.9.9", "v1.10.0", "v10.0"), NaturalSort.naturalSort(listOf<String>("v1.10.0", "v1.2.0", "v1.9.9", "v10.0", "v1.2.10")), "sorted 1")
    eq(listOf<String>("img1.png", "IMG2.png", "img10.png", "img12.png"), NaturalSort.naturalSort(listOf<String>("img12.png", "img10.png", "IMG2.png", "img1.png")), "sorted 2")
    eq(listOf<String>("a", "a0", "a00", "a000", "a1", "a01"), NaturalSort.naturalSort(listOf<String>("a0", "a00", "a000", "a", "a1", "a01")), "sorted 3")
    eq(listOf<String>("1x", "_x", "a", "Z", "z", "\u00C4"), NaturalSort.naturalSort(listOf<String>("\u00C4", "Z", "a", "z", "_x", "1x")), "sorted 4")
    eq(-1, NaturalSort.naturalCompare("a2", "a10"), "compare 0")
    eq(1, NaturalSort.naturalCompare("a10", "a2"), "compare 1")
    eq(1, NaturalSort.naturalCompare("abc", "ABC"), "compare 2")
    eq(1, NaturalSort.naturalCompare("x01", "x1"), "compare 3")
    eq(0, NaturalSort.naturalCompare("x1", "x1"), "compare 4")
    eq(-1, NaturalSort.naturalCompare("", "a"), "compare 5")
    eq(1, NaturalSort.naturalCompare("a", "1"), "compare 6")
    eq(-1, NaturalSort.naturalCompare("99999999999999999999", "100000000000000000000"), "compare 7")
    eq(-1, NaturalSort.naturalCompare("\uFF61", "\uD83D\uDE00"), "code point order, not UTF-16 units")

    println("NaturalSortTest: $passed passed, $failed failed")
    if (failed > 0) exitProcess(1)
}
