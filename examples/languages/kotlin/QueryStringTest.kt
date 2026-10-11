// SPDX-License-Identifier: Apache-2.0
// Generated from the wave-10 capability vectors; edit the vectors, not the literals.
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

private fun throwsIae(name: String, block: () -> Unit) {
    try { block(); check(false, "$name did not throw") } catch (e: IllegalArgumentException) { check(true, name) }
}

private fun throwsMsg(prefix: String, name: String, block: () -> Unit) {
    try { block(); check(false, "$name did not throw") } catch (e: IllegalArgumentException) {
        check(e.message?.startsWith(prefix) == true, "$name message <${e.message}>")
    }
}

private fun hex(s: String) = ByteArray(s.length / 2) { s.substring(2 * it, 2 * it + 2).toInt(16).toByte() }

fun main() {
    eq(listOf<Pair<String, String>>(Pair("a", "1"), Pair("b", "2")), QueryString.parseQuery("a=1&b=2"), "parse 0")
    eq(listOf<Pair<String, String>>(Pair("a", "1"), Pair("a", "2")), QueryString.parseQuery("?a=1&a=2"), "parse 1")
    eq(listOf<Pair<String, String>>(Pair("x", "a b c")), QueryString.parseQuery("x=a+b%20c"), "parse 2")
    eq(listOf<Pair<String, String>>(Pair("e", "\u20AC")), QueryString.parseQuery("e=%E2%82%AC"), "parse 3")
    eq(listOf<Pair<String, String>>(Pair("bad", "%zz"), Pair("ok", "1")), QueryString.parseQuery("bad=%zz&ok=1"), "parse 4")
    eq(listOf<Pair<String, String>>(Pair("%", "")), QueryString.parseQuery("%"), "parse 5")
    eq(listOf<Pair<String, String>>(Pair("a", "")), QueryString.parseQuery("&&a&&"), "parse 6")
    eq(listOf<Pair<String, String>>(Pair("k", "v=w")), QueryString.parseQuery("k=v=w"), "parse 7")
    eq(listOf<Pair<String, String>>(Pair("", "v")), QueryString.parseQuery("=v"), "parse 8")
    eq(listOf<Pair<String, String>>(Pair("emoji", "\uD83D\uDE00")), QueryString.parseQuery("emoji=%F0%9F%98%80"), "parse 9")
    eq(listOf<Pair<String, String>>(Pair("invalid", "\uFFFD")), QueryString.parseQuery("invalid=%FF"), "parse 10")
    eq(listOf<Pair<String, String>>(Pair("plus", "+")), QueryString.parseQuery("plus=%2B"), "parse 11")
    eq("a=1&b=x+y", QueryString.stringifyQuery(listOf<Pair<String, String>>(Pair("a", "1"), Pair("b", "x y"))), "stringify 0")
    eq("q=a%26b%3Dc&e=%E2%82%AC", QueryString.stringifyQuery(listOf<Pair<String, String>>(Pair("q", "a&b=c"), Pair("e", "\u20AC"))), "stringify 1")
    eq("*-._=%7E%21%27%28%29", QueryString.stringifyQuery(listOf<Pair<String, String>>(Pair("*-._", "~!'()"))), "stringify 2")
    eq("k=&=v", QueryString.stringifyQuery(listOf<Pair<String, String>>(Pair("k", ""), Pair("", "v"))), "stringify 3")
    eq(listOf<String>("1", "3"), QueryString.getAll(QueryString.parseQuery("a=1&b=2&a=3"), "a"), "getAll 0")

    println("QueryStringTest: $passed passed, $failed failed")
    if (failed > 0) exitProcess(1)
}
