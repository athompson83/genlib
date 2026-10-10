// SPDX-License-Identifier: Apache-2.0
import kotlin.system.exitProcess

// Wave 6 vectors (shared with every Genlib language) for http-range.
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
    eq(HttpRange.Result.Ranges(listOf(HttpRange.ByteRange(0L, 499L))), HttpRange.parseRange("bytes=0-499", 10000L), "range " + "bytes=0-499")
    eq(HttpRange.Result.Ranges(listOf(HttpRange.ByteRange(500L, 999L))), HttpRange.parseRange("bytes=500-999", 10000L), "range " + "bytes=500-999")
    eq(HttpRange.Result.Ranges(listOf(HttpRange.ByteRange(9500L, 9999L))), HttpRange.parseRange("bytes=-500", 10000L), "range " + "bytes=-500")
    eq(HttpRange.Result.Ranges(listOf(HttpRange.ByteRange(9500L, 9999L))), HttpRange.parseRange("bytes=9500-", 10000L), "range " + "bytes=9500-")
    eq(HttpRange.Result.Ranges(listOf(HttpRange.ByteRange(0L, 0L), HttpRange.ByteRange(9999L, 9999L))), HttpRange.parseRange("bytes=0-0,-1", 10000L), "range " + "bytes=0-0,-1")
    eq(HttpRange.Result.Ranges(listOf(HttpRange.ByteRange(0L, 1L), HttpRange.ByteRange(5L, 6L))), HttpRange.parseRange("bytes= 0-1 , 5-6", 10000L), "range " + "bytes= 0-1 , 5-6")
    eq(HttpRange.Result.Ranges(listOf(HttpRange.ByteRange(0L, 99L))), HttpRange.parseRange("BYTES=0-99", 10000L), "range " + "BYTES=0-99")
    eq(HttpRange.Result.Ranges(listOf(HttpRange.ByteRange(9999L, 9999L))), HttpRange.parseRange("bytes=9999-20000", 10000L), "range " + "bytes=9999-20000")
    eq(HttpRange.Result.Unsatisfiable("bytes */10000"), HttpRange.parseRange("bytes=10000-", 10000L), "range " + "bytes=10000-")
    eq(HttpRange.Result.Unsatisfiable("bytes */10000"), HttpRange.parseRange("bytes=-0", 10000L), "range " + "bytes=-0")
    eq(HttpRange.Result.Ranges(listOf(HttpRange.ByteRange(0L, 9999L))), HttpRange.parseRange("bytes=-20000", 10000L), "range " + "bytes=-20000")
    eq(HttpRange.Result.None, HttpRange.parseRange("bytes=500-400", 10000L), "range " + "bytes=500-400")
    eq(HttpRange.Result.None, HttpRange.parseRange("items=0-1", 10000L), "range " + "items=0-1")
    eq(HttpRange.Result.None, HttpRange.parseRange("bytes=", 10000L), "range " + "bytes=")
    eq(HttpRange.Result.None, HttpRange.parseRange("bytes=0-1,", 10000L), "range " + "bytes=0-1,")
    eq(HttpRange.Result.None, HttpRange.parseRange("bytes=abc", 10000L), "range " + "bytes=abc")
    eq(HttpRange.Result.None, HttpRange.parseRange("bytes=1-2-3", 10000L), "range " + "bytes=1-2-3")
    eq(HttpRange.Result.None, HttpRange.parseRange(null, 10000L), "range " + null)
    eq(HttpRange.Result.Unsatisfiable("bytes */10000"), HttpRange.parseRange("bytes=10000-10001,20000-", 10000L), "range " + "bytes=10000-10001,20000-")
    eq(HttpRange.Result.Unsatisfiable("bytes */0"), HttpRange.parseRange("bytes=0-", 0L), "empty file " + "bytes=0-")
    eq(HttpRange.Result.Unsatisfiable("bytes */0"), HttpRange.parseRange("bytes=-5", 0L), "empty file " + "bytes=-5")
    eq("bytes 0-499/10000", HttpRange.contentRange(0L, 499L, 10000L), "content range")
    val many = "bytes=" + "0-0,".repeat(100) + "1-1"
    eq(HttpRange.Result.None, HttpRange.parseRange(many, 10L), "more than 100 specs")
    eq(HttpRange.Result.Ranges(listOf(HttpRange.ByteRange(0L, 5999999999L))), HttpRange.parseRange("bytes=0-99999999999999999999999", 6000000000L), "64-bit size")

    println("HttpRangeTest: $passed passed, $failed failed")
    if (failed > 0) exitProcess(1)
}
