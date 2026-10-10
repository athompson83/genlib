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

private fun checkEvents(got: List<Sse.Event>, exp: List<List<String>>, name: String) {
    eq(exp.size, got.size, "$name count")
    for (i in 0 until minOf(exp.size, got.size)) eq(Sse.Event(exp[i][0], exp[i][1], exp[i][2]), got[i], "$name event $i")
}

private fun parseCase(text: String, exp: List<List<String>>, retry: Long?, name: String) {
    checkEvents(Sse.parse(text), exp, name)
    val p = Sse.Parser()
    p.feed(text)
    eq(retry, p.retry, "$name retry")
}

private fun chunkedCase(chunks: List<String>, exp: List<List<String>>, name: String) {
    val p = Sse.Parser()
    val got = mutableListOf<Sse.Event>()
    for (c in chunks) got.addAll(p.feed(c))
    checkEvents(got, exp, name)
}

fun main() {
    parseCase("data: YHOO\ndata: +2\ndata: 10\n\n", listOf(listOf("message", "YHOO\n+2\n10", "")), null, "parse 0")
    parseCase(": test stream\n\ndata: first event\nid: 1\n\ndata:second event\nid\n\ndata:  third event\n", listOf(listOf("message", "first event", "1"), listOf("message", "second event", "")), null, "parse 1")
    parseCase("data\n\ndata\ndata\n\ndata:", listOf(listOf("message", "", ""), listOf("message", "\n", "")), null, "parse 2")
    parseCase("data:test\n\ndata: test\n\n", listOf(listOf("message", "test", ""), listOf("message", "test", "")), null, "parse 3")
    parseCase("event: add\ndata: 73857293\n\nevent: remove\ndata: 2153\n\nevent: add\ndata: 113411\n\n", listOf(listOf("add", "73857293", ""), listOf("remove", "2153", ""), listOf("add", "113411", "")), null, "parse 4")
    parseCase("\uFEFFdata: bom\n\n", listOf(listOf("message", "bom", "")), null, "parse 5")
    parseCase("data: a\r\ndata: b\r\rdata: c\n\n", listOf(listOf("message", "a\nb", ""), listOf("message", "c", "")), null, "parse 6")
    parseCase("id: 7\ndata: x\n\ndata: y\n\nid\ndata: z\n\n", listOf(listOf("message", "x", "7"), listOf("message", "y", "7"), listOf("message", "z", "")), null, "parse 7")
    parseCase("id: a\u0000b\ndata: nul\n\n", listOf(listOf("message", "nul", "")), null, "parse 8")
    parseCase("retry: 1500\ndata: r\n\nretry: x\ndata: s\n\n", listOf(listOf("message", "r", ""), listOf("message", "s", "")), 1500L, "parse 9")
    parseCase("event\ndata: e\n\n", listOf(listOf("message", "e", "")), null, "parse 10")
    parseCase("unknown: q\ndata: u\n\n", listOf(listOf("message", "u", "")), null, "parse 11")
    parseCase(":\n:comment\ndata: ok\n\n", listOf(listOf("message", "ok", "")), null, "parse 12")
    parseCase("data: no blank line at end", listOf(), null, "parse 13")
    chunkedCase(listOf<String>("data: YHO", "O\ndata: +2\n", "data", ": 10\n\n"), listOf(listOf("message", "YHOO\n+2\n10", "")), "chunked 0")
    chunkedCase(listOf<String>(": te", "st stream\n\ndata: first event\nid: 1\n\ndata:s", "econd event\nid\n\ndata: ", " third event\n"), listOf(listOf("message", "first event", "1"), listOf("message", "second event", "")), "chunked 1")
    chunkedCase(listOf<String>("da", "ta\n\nda", "ta\ndata", "\n\ndata:"), listOf(listOf("message", "", ""), listOf("message", "\n", "")), "chunked 2")
    chunkedCase(listOf<String>("data", ":t", "est\n\nd", "ata: test\n\n"), listOf(listOf("message", "test", ""), listOf("message", "test", "")), "chunked 3")
    chunkedCase(listOf<String>("event: add\ndata: 73857293\n\nevent", ": remove\ndata: 21", "53\n\nevent: a", "dd\ndata: 113411\n\n"), listOf(listOf("add", "73857293", ""), listOf("remove", "2153", ""), listOf("add", "113411", "")), "chunked 4")
    chunkedCase(listOf<String>("\uFEFFd", "at", "a: bo", "m\n\n"), listOf(listOf("message", "bom", "")), "chunked 5")
    chunkedCase(listOf<String>("d", "ata: a", "\r\ndata: b\r\rdata: ", "c\n\n"), listOf(listOf("message", "a\nb", ""), listOf("message", "c", "")), "chunked 6")
    chunkedCase(listOf<String>("id: 7\ndata: ", "x\n\ndat", "a: y\n\nid\n", "data: z\n\n"), listOf(listOf("message", "x", "7"), listOf("message", "y", "7"), listOf("message", "z", "")), "chunked 7")
    chunkedCase(listOf<String>("id:", " a\u0000", "b\ndata:", " nul\n\n"), listOf(listOf("message", "nul", "")), "chunked 8")
    chunkedCase(listOf<String>("r", "etry: 15", "00\ndata: r\n\nretry: x", "\ndata: s\n\n"), listOf(listOf("message", "r", ""), listOf("message", "s", "")), "chunked 9")
    eq("data: hello\n\n", Sse.format("hello", null, null, null), "format 0")
    eq("event: update\nid: 42\ndata: a\ndata: b\ndata: c\n\n", Sse.format("a\nb\r\nc", "update", "42", null), "format 1")
    eq("retry: 3000\ndata: \n\n", Sse.format("", null, null, 3000L), "format 2")
    eq("event: json\nid: \ndata: {\"x\":1}\n\n", Sse.format("{\"x\":1}", "json", "", null), "format 3")
    throwsIae("format_invalid 0") { Sse.format("x", "a\nb", null, null) }
    throwsIae("format_invalid 1") { Sse.format("x", null, "a\rb", null) }
    throwsIae("format_invalid 2") { Sse.format("x", null, "a\u0000", null) }
    throwsIae("format_invalid 3") { Sse.format("x", null, null, -1L) }
    eq(":\n\n", Sse.formatComment(""), "comment 0")
    eq(": ping\n\n", Sse.formatComment("ping"), "comment 1")
    eq(":\n\n", Sse.formatComment(), "comment default")
    throwsIae("comment with line break") { Sse.formatComment("a\nb") }
    eq("data: x\n\n", Sse.format("x"), "format data only")

    println("SseTest: $passed passed, $failed failed")
    if (failed > 0) exitProcess(1)
}
