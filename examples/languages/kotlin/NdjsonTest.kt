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
    eqOrd(lst(omap("a" to 1L), omap("b" to lst(1L, 2L))), Ndjson.parseNdjson("{\"a\":1}\n{\"b\":[1,2]}\n"), "parse 0")
    eqOrd(lst(1L, "x", true, null), Ndjson.parseNdjson("\n  \n1\r\n\"x\"\ntrue\nnull\n"), "parse 1")
    eqOrd(lst(), Ndjson.parseNdjson(""), "parse 2")
    eqOrd(lst(omap("k" to "caf\u00e9")), Ndjson.parseNdjson("{\"k\":\"caf\u00e9\"}"), "parse 3")
    throwsMsg("line 2", "invalid parse 0") { Ndjson.parseNdjson("{\"a\":1}\n{bad}\n") }
    throwsMsg("line 1", "invalid parse 1") { Ndjson.parseNdjson("1 2") }
    throwsMsg("line 3", "invalid parse 2") { Ndjson.parseNdjson("{\"a\":1}\n\n[1,") }
    eq("{\"a\":1,\"b\":[true,null,\"x\"]}\n", Ndjson.stringifyNdjson(lst(omap("a" to 1L, "b" to lst(true, null, "x")))), "stringify 0")
    eqOrd(lst(omap("a" to 1L, "b" to lst(true, null, "x"))), Ndjson.parseNdjson("{\"a\":1,\"b\":[true,null,\"x\"]}\n"), "stringify round trip 0")
    eq("1\n\"two\"\nfalse\n", Ndjson.stringifyNdjson(lst(1L, "two", false)), "stringify 1")
    eqOrd(lst(1L, "two", false), Ndjson.parseNdjson("1\n\"two\"\nfalse\n"), "stringify round trip 1")
    eq("", Ndjson.stringifyNdjson(lst()), "stringify 2")
    eqOrd(lst(), Ndjson.parseNdjson(""), "stringify round trip 2")
    eq("{\"q\":\"say \\\"hi\\\"\\\\ \\n\\t\\u0001 caf\u00e9\"}\n", Ndjson.stringifyNdjson(lst(omap("q" to "say \"hi\"\\ \n\t\u0001 caf\u00e9"))), "stringify 3")
    eqOrd(lst(omap("q" to "say \"hi\"\\ \n\t\u0001 caf\u00e9")), Ndjson.parseNdjson("{\"q\":\"say \\\"hi\\\"\\\\ \\n\\t\\u0001 caf\u00e9\"}\n"), "stringify round trip 3")
    eq("{\"z\":1,\"a\":2}\n", Ndjson.stringifyNdjson(lst(omap("z" to 1L, "a" to 2L))), "stringify 4")
    eqOrd(lst(omap("z" to 1L, "a" to 2L)), Ndjson.parseNdjson("{\"z\":1,\"a\":2}\n"), "stringify round trip 4")
    eq("[]\n{}\n", Ndjson.stringifyNdjson(lst(lst(), omap())), "stringify 5")
    eqOrd(lst(lst(), omap()), Ndjson.parseNdjson("[]\n{}\n"), "stringify round trip 5")
    eq("-42\n0\n", Ndjson.stringifyNdjson(lst(-42L, 0L)), "stringify 6")
    eqOrd(lst(-42L, 0L), Ndjson.parseNdjson("-42\n0\n"), "stringify round trip 6")

    println("NdjsonTest: $passed passed, $failed failed")
    if (failed > 0) exitProcess(1)
}
