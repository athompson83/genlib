// SPDX-License-Identifier: Apache-2.0
// Generated from the wave-11 capability vectors; edit the vectors, not the literals.
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

private fun omap(vararg kv: Pair<String, Any?>): LinkedHashMap<String, Any?> = linkedMapOf(*kv)

private fun lst(vararg xs: Any?): ArrayList<Any?> = arrayListOf(*xs)

private fun hex(s: String) = ByteArray(s.length / 2) { s.substring(2 * it, 2 * it + 2).toInt(16).toByte() }

private fun toHex(b: ByteArray) = b.joinToString("") { "%02x".format(it.toInt() and 0xFF) }

/** Deterministic test byte source that cycles through the given bytes (passgen_ref.byte_source). */
private fun bytes(h: String): () -> Int {
    val b = hex(h)
    var i = 0
    return { b[i++ % b.size].toInt() and 0xFF }
}

fun main() {
    val data = omap("user" to omap("name" to "Ada", "tags" to lst("a", "b"), "addr" to lst(omap("city" to "Paris"), omap("city" to "Rome")), "x.y" to omap("z" to 1L)), "n" to 0L, "nil" to null)
    val pristine = omap("user" to omap("name" to "Ada", "tags" to lst("a", "b"), "addr" to lst(omap("city" to "Paris"), omap("city" to "Rome")), "x.y" to omap("z" to 1L)), "n" to 0L, "nil" to null)
    eq(listOf<Any>(), DottedPath.parsePath(""), "parse 0")
    eq(listOf<Any>("a"), DottedPath.parsePath("a"), "parse 1")
    eq(listOf<Any>("a", "b", "c"), DottedPath.parsePath("a.b.c"), "parse 2")
    eq(listOf<Any>("a", 0), DottedPath.parsePath("a[0]"), "parse 3")
    eq(listOf<Any>("a", 0, 1, "b"), DottedPath.parsePath("a[0][1].b"), "parse 4")
    eq(listOf<Any>("x.y", "z"), DottedPath.parsePath("[\"x.y\"].z"), "parse 5")
    eq(listOf<Any>("user", "x.y", "z"), DottedPath.parsePath("user[\"x.y\"].z"), "parse 6")
    eq(listOf<Any>("a", "q\"t"), DottedPath.parsePath("a[\"q\\\"t\"]"), "parse 7")
    eq("Ada", DottedPath.getPath(data, "user.name", "DEF"), "get 0")
    eq("b", DottedPath.getPath(data, "user.tags[1]", "DEF"), "get 1")
    eq("Rome", DottedPath.getPath(data, "user.addr[1].city", "DEF"), "get 2")
    eq(1L, DottedPath.getPath(data, "user[\"x.y\"].z", "DEF"), "get 3")
    eq("DEF", DottedPath.getPath(data, "user.missing", "DEF"), "get 4")
    eq("DEF", DottedPath.getPath(data, "user.tags[5]", "DEF"), "get 5")
    eq("DEF", DottedPath.getPath(data, "user.name.first", "DEF"), "get 6")
    eq(0L, DottedPath.getPath(data, "n", "DEF"), "get 7")
    eq(null, DottedPath.getPath(data, "nil", "DEF"), "get 8")
    eq(omap("user" to omap("name" to "Ada", "tags" to lst("a", "b"), "addr" to lst(omap("city" to "Paris"), omap("city" to "Rome")), "x.y" to omap("z" to 1L)), "n" to 0L, "nil" to null), DottedPath.getPath(data, "", "DEF"), "get 9")
    eq("DEF", DottedPath.getPath(data, "user.tags.0", "DEF"), "get 10")
    eq(true, DottedPath.hasPath(data, "user.name"), "has 0")
    eq(true, DottedPath.hasPath(data, "nil"), "has 1")
    eq(false, DottedPath.hasPath(data, "user.nope"), "has 2")
    eq(false, DottedPath.hasPath(data, "user.tags[2]"), "has 3")
    val set0 = omap()
    eqOrd(omap("a" to omap("b" to 1L)), DottedPath.setPath(set0, "a.b", 1L), "set 0")
    eq(omap(), set0, "set 0 input unchanged")
    val set1 = omap()
    eqOrd(omap("a" to lst(omap("b" to 1L))), DottedPath.setPath(set1, "a[0].b", 1L), "set 1")
    eq(omap(), set1, "set 1 input unchanged")
    val set2 = omap("a" to lst(1L))
    eqOrd(omap("a" to lst(1L, 2L)), DottedPath.setPath(set2, "a[1]", 2L), "set 2")
    eq(omap("a" to lst(1L)), set2, "set 2 input unchanged")
    val set3 = omap("a" to omap("b" to 1L))
    eqOrd(omap("a" to omap("b" to 1L, "c" to lst(1L, 2L))), DottedPath.setPath(set3, "a.c", lst(1L, 2L)), "set 3")
    eq(omap("a" to omap("b" to 1L)), set3, "set 3 input unchanged")
    val set4 = null
    eqOrd(omap("x" to true), DottedPath.setPath(set4, "x", true), "set 4")
    eq(null, set4, "set 4 input unchanged")
    val set5 = omap("a" to 1L)
    eqOrd(omap("z" to 2L), DottedPath.setPath(set5, "", omap("z" to 2L)), "set 5")
    eq(omap("a" to 1L), set5, "set 5 input unchanged")
    val set6 = omap()
    eqOrd(omap("k.v" to 3L), DottedPath.setPath(set6, "[\"k.v\"]", 3L), "set 6")
    eq(omap(), set6, "set 6 input unchanged")
    throwsIae("invalid set 0") { DottedPath.setPath(omap("a" to lst(1L)), "a[3]", 0L) }
    throwsIae("invalid set 1") { DottedPath.setPath(omap("a" to 1L), "a.b", 0L) }
    throwsIae("invalid set 2") { DottedPath.setPath(omap("a" to omap()), "a[0]", 0L) }
    val del0 = omap("a" to omap("b" to 1L, "c" to 2L))
    eqOrd(omap("a" to omap("c" to 2L)), DottedPath.deletePath(del0, "a.b"), "delete 0")
    eq(omap("a" to omap("b" to 1L, "c" to 2L)), del0, "delete 0 input unchanged")
    val del1 = omap("a" to lst(1L, 2L, 3L))
    eqOrd(omap("a" to lst(2L, 3L)), DottedPath.deletePath(del1, "a[0]"), "delete 1")
    eq(omap("a" to lst(1L, 2L, 3L)), del1, "delete 1 input unchanged")
    val del2 = omap("a" to 1L)
    eqOrd(omap("a" to 1L), DottedPath.deletePath(del2, "b"), "delete 2")
    eq(omap("a" to 1L), del2, "delete 2 input unchanged")
    val del3 = omap("a" to lst(1L))
    eqOrd(omap("a" to lst(1L)), DottedPath.deletePath(del3, "a[4]"), "delete 3")
    eq(omap("a" to lst(1L)), del3, "delete 3 input unchanged")
    throwsIae("invalid parse 0") { DottedPath.parsePath("a.") }
    throwsIae("invalid parse 1") { DottedPath.parsePath(".a") }
    throwsIae("invalid parse 2") { DottedPath.parsePath("a..b") }
    throwsIae("invalid parse 3") { DottedPath.parsePath("a[01]") }
    throwsIae("invalid parse 4") { DottedPath.parsePath("a[x]") }
    throwsIae("invalid parse 5") { DottedPath.parsePath("a[\"x") }
    throwsIae("invalid parse 6") { DottedPath.parsePath("a[1") }
    throwsIae("invalid parse 7") { DottedPath.parsePath("a[-1]") }
    eq(pristine, data, "data never mutated")
    eq("Ada", DottedPath.getPath(data, "user.name"), "default overload")

    println("DottedPathTest: $passed passed, $failed failed")
    if (failed > 0) exitProcess(1)
}
