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
    eq(listOf<String>("b", "c", "a", "d"), TopoSort.topoSort(listOf<String>("a", "b", "c", "d"), listOf<Pair<String, String>>(Pair("c", "a"), Pair("a", "d"))), "sort 0")
    eq(listOf<String>("x"), TopoSort.topoSort(listOf<String>("x"), listOf<Pair<String, String>>()), "sort 1")
    eq(listOf<String>("a", "b", "c"), TopoSort.topoSort(listOf<String>("a", "b", "c"), listOf<Pair<String, String>>()), "sort 2")
    eq(listOf<String>("shirt", "tie", "trousers", "belt", "jacket", "socks", "shoes", "watch"), TopoSort.topoSort(listOf<String>("shirt", "tie", "jacket", "belt", "trousers", "shoes", "socks", "watch"), listOf<Pair<String, String>>(Pair("shirt", "tie"), Pair("tie", "jacket"), Pair("shirt", "belt"), Pair("belt", "jacket"), Pair("trousers", "belt"), Pair("trousers", "shoes"), Pair("socks", "shoes"))), "sort 3")
    eq(listOf<String>("a", "b"), TopoSort.topoSort(listOf<String>("a", "b"), listOf<Pair<String, String>>(Pair("a", "b"), Pair("a", "b"))), "sort 4")
    eq(listOf<List<String>>(listOf<String>("b", "c"), listOf<String>("a"), listOf<String>("d")), TopoSort.topoLevels(listOf<String>("a", "b", "c", "d"), listOf<Pair<String, String>>(Pair("c", "a"), Pair("a", "d"))), "levels 0")
    eq(listOf<List<String>>(listOf<String>("x")), TopoSort.topoLevels(listOf<String>("x"), listOf<Pair<String, String>>()), "levels 1")
    eq(listOf<List<String>>(listOf<String>("a", "b", "c")), TopoSort.topoLevels(listOf<String>("a", "b", "c"), listOf<Pair<String, String>>()), "levels 2")
    eq(listOf<List<String>>(listOf<String>("shirt", "trousers", "socks", "watch"), listOf<String>("tie", "belt", "shoes"), listOf<String>("jacket")), TopoSort.topoLevels(listOf<String>("shirt", "tie", "jacket", "belt", "trousers", "shoes", "socks", "watch"), listOf<Pair<String, String>>(Pair("shirt", "tie"), Pair("tie", "jacket"), Pair("shirt", "belt"), Pair("belt", "jacket"), Pair("trousers", "belt"), Pair("trousers", "shoes"), Pair("socks", "shoes"))), "levels 3")
    eq(listOf<List<String>>(listOf<String>("a"), listOf<String>("b")), TopoSort.topoLevels(listOf<String>("a", "b"), listOf<Pair<String, String>>(Pair("a", "b"), Pair("a", "b"))), "levels 4")
    try { TopoSort.topoSort(listOf<String>("a", "b", "c"), listOf<Pair<String, String>>(Pair("a", "b"), Pair("b", "c"), Pair("c", "b"))); check(false, "cycle 0 topoSort did not throw") } catch (e: TopoSort.CycleException) { eq("cycle: b -> c -> b", e.message, "cycle 0 topoSort") }
    try { TopoSort.topoLevels(listOf<String>("a", "b", "c"), listOf<Pair<String, String>>(Pair("a", "b"), Pair("b", "c"), Pair("c", "b"))); check(false, "cycle 0 topoLevels did not throw") } catch (e: TopoSort.CycleException) { eq("cycle: b -> c -> b", e.message, "cycle 0 topoLevels") }
    try { TopoSort.topoSort(listOf<String>("a"), listOf<Pair<String, String>>(Pair("a", "a"))); check(false, "cycle 1 topoSort did not throw") } catch (e: TopoSort.CycleException) { eq("cycle: a -> a", e.message, "cycle 1 topoSort") }
    try { TopoSort.topoLevels(listOf<String>("a"), listOf<Pair<String, String>>(Pair("a", "a"))); check(false, "cycle 1 topoLevels did not throw") } catch (e: TopoSort.CycleException) { eq("cycle: a -> a", e.message, "cycle 1 topoLevels") }
    try { TopoSort.topoSort(listOf<String>("p", "q", "r", "s"), listOf<Pair<String, String>>(Pair("p", "q"), Pair("q", "r"), Pair("r", "p"), Pair("r", "s"))); check(false, "cycle 2 topoSort did not throw") } catch (e: TopoSort.CycleException) { eq("cycle: p -> q -> r -> p", e.message, "cycle 2 topoSort") }
    try { TopoSort.topoLevels(listOf<String>("p", "q", "r", "s"), listOf<Pair<String, String>>(Pair("p", "q"), Pair("q", "r"), Pair("r", "p"), Pair("r", "s"))); check(false, "cycle 2 topoLevels did not throw") } catch (e: TopoSort.CycleException) { eq("cycle: p -> q -> r -> p", e.message, "cycle 2 topoLevels") }
    try { TopoSort.topoSort(listOf<String>("z", "a", "b"), listOf<Pair<String, String>>(Pair("a", "z"), Pair("a", "b"), Pair("b", "a"))); check(false, "cycle 3 topoSort did not throw") } catch (e: TopoSort.CycleException) { eq("cycle: a -> b -> a", e.message, "cycle 3 topoSort") }
    try { TopoSort.topoLevels(listOf<String>("z", "a", "b"), listOf<Pair<String, String>>(Pair("a", "z"), Pair("a", "b"), Pair("b", "a"))); check(false, "cycle 3 topoLevels did not throw") } catch (e: TopoSort.CycleException) { eq("cycle: a -> b -> a", e.message, "cycle 3 topoLevels") }
    try { TopoSort.topoSort(listOf<String>("s", "x", "y", "d"), listOf<Pair<String, String>>(Pair("x", "d"), Pair("x", "y"), Pair("y", "x"), Pair("d", "s"))); check(false, "cycle 4 topoSort did not throw") } catch (e: TopoSort.CycleException) { eq("cycle: x -> y -> x", e.message, "cycle 4 topoSort") }
    try { TopoSort.topoLevels(listOf<String>("s", "x", "y", "d"), listOf<Pair<String, String>>(Pair("x", "d"), Pair("x", "y"), Pair("y", "x"), Pair("d", "s"))); check(false, "cycle 4 topoLevels did not throw") } catch (e: TopoSort.CycleException) { eq("cycle: x -> y -> x", e.message, "cycle 4 topoLevels") }
    throwsIae("invalid 0 topoSort") { TopoSort.topoSort(listOf<String>("a"), listOf<Pair<String, String>>(Pair("a", "b"))) }
    throwsIae("invalid 0 topoLevels") { TopoSort.topoLevels(listOf<String>("a"), listOf<Pair<String, String>>(Pair("a", "b"))) }
    throwsIae("invalid 1 topoSort") { TopoSort.topoSort(listOf<String>("a", "a"), listOf<Pair<String, String>>()) }
    throwsIae("invalid 1 topoLevels") { TopoSort.topoLevels(listOf<String>("a", "a"), listOf<Pair<String, String>>()) }

    println("TopoSortTest: $passed passed, $failed failed")
    if (failed > 0) exitProcess(1)
}
