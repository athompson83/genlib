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
    eq("| Name  | Qty |\n| ----- | --- |\n| Apple | 3   |\n| Kiwi  | 12  |", MarkdownTable.markdownTable(listOf<String>("Name", "Qty"), listOf<List<String>>(listOf<String>("Apple", "3"), listOf<String>("Kiwi", "12")), null), "table 0")
    eq("| a   |   b |  c  |\n| :-- | --: | :-: |\n| 1   |   2 |  3  |", MarkdownTable.markdownTable(listOf<String>("a", "b", "c"), listOf<List<String>>(listOf<String>("1", "2", "3")), listOf<String?>("left", "right", "center")), "table 1")
    eq("| Pipe\\|col   | Text           |\n| ----------- | -------------- |\n| a\\|b        | line1<br>line2 |\n| back\\\\slash | crlf<br>x      |", MarkdownTable.markdownTable(listOf<String>("Pipe|col", "Text"), listOf<List<String>>(listOf<String>("a|b", "line1\nline2"), listOf<String>("back\\slash", "crlf\r\nx")), null), "table 2")
    eq("|  x  |\n| :-: |", MarkdownTable.markdownTable(listOf<String>("x"), listOf<List<String>>(), listOf<String?>("center")), "table 3")
    eq("|  Caf\u00e9 | \ud83d\ude00   |\n| ----: | --- |\n| na\u00efve | ok  |", MarkdownTable.markdownTable(listOf<String>("Caf\u00e9", "\ud83d\ude00"), listOf<List<String>>(listOf<String>("na\u00efve", "ok")), listOf<String?>("right", null)), "table 4")
    eq("|    wide    |\n| :--------: |\n| abcdefghij |", MarkdownTable.markdownTable(listOf<String>("wide"), listOf<List<String>>(listOf<String>("abcdefghij")), listOf<String?>("center")), "table 5")
    eq("| Name  | Qty |\n| ----- | --- |\n| Apple | 3   |\n| Kiwi  | 12  |", MarkdownTable.markdownTable(listOf<String>("Name", "Qty"), listOf<List<String>>(listOf<String>("Apple", "3"), listOf<String>("Kiwi", "12"))), "table default align")
    eq("| Name  | Qty |\n| ----- | --- |\n| Apple | 3   |\n| Kiwi  | 12  |", MarkdownTable.markdownTable(listOf<String>("Name", "Qty"), listOf<List<String>>(listOf<String>("Apple", "3"), listOf<String>("Kiwi", "12")), listOf("none", "none")), "table none align")
    throwsIae("invalid 0") { MarkdownTable.markdownTable(listOf<String>(), listOf<List<String>>(), null) }
    throwsIae("invalid 1") { MarkdownTable.markdownTable(listOf<String>("a", "b"), listOf<List<String>>(listOf<String>("1")), null) }
    throwsIae("invalid 2") { MarkdownTable.markdownTable(listOf<String>("a"), listOf<List<String>>(listOf<String>("1")), listOf<String?>("middle")) }

    println("MarkdownTableTest: $passed passed, $failed failed")
    if (failed > 0) exitProcess(1)
}
