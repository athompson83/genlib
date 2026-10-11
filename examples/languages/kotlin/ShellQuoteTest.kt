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
    eq("''", ShellQuote.shellQuote(""), "quote 0")
    eq("abc", ShellQuote.shellQuote("abc"), "quote 1")
    eq("'a b'", ShellQuote.shellQuote("a b"), "quote 2")
    eq("'it'\\''s'", ShellQuote.shellQuote("it's"), "quote 3")
    eq("'a\"b'", ShellQuote.shellQuote("a\"b"), "quote 4")
    eq("'\$HOME'", ShellQuote.shellQuote("\$HOME"), "quote 5")
    eq("'*.txt'", ShellQuote.shellQuote("*.txt"), "quote 6")
    eq("x=1", ShellQuote.shellQuote("x=1"), "quote 7")
    eq("path/to/file.txt", ShellQuote.shellQuote("path/to/file.txt"), "quote 8")
    eq("'tab\there'", ShellQuote.shellQuote("tab\there"), "quote 9")
    eq("'line\nbreak'", ShellQuote.shellQuote("line\nbreak"), "quote 10")
    eq("'\u00e9'", ShellQuote.shellQuote("\u00e9"), "quote 11")
    eq("-n", ShellQuote.shellQuote("-n"), "quote 12")
    eq("'~user'", ShellQuote.shellQuote("~user"), "quote 13")
    eq("'!bang'", ShellQuote.shellQuote("!bang"), "quote 14")
    eq("''\\'''\\'''", ShellQuote.shellQuote("''"), "quote 15")
    eq("ls -la 'my file' 'it'\\''s'", ShellQuote.shellJoin(listOf<String>("ls", "-la", "my file", "it's")), "join 0")
    eq("", ShellQuote.shellJoin(listOf<String>()), "join 1")
    eq(listOf<String>("a", "b", "c"), ShellQuote.shellSplit("a b  c"), "split 0")
    eq(listOf<String>("a b", "c"), ShellQuote.shellSplit("'a b' c"), "split 1")
    eq(listOf<String>("a b", "c"), ShellQuote.shellSplit("\"a b\" c"), "split 2")
    eq(listOf<String>("a b"), ShellQuote.shellSplit("a\\ b"), "split 3")
    eq(listOf<String>("say \"hi\""), ShellQuote.shellSplit("\"say \\\"hi\\\"\""), "split 4")
    eq(listOf<String>("keep \\n and \\x"), ShellQuote.shellSplit("\"keep \\n and \\x\""), "split 5")
    eq(listOf<String>("no \\escape"), ShellQuote.shellSplit("'no \\escape'"), "split 6")
    eq(listOf<String>("xyzw"), ShellQuote.shellSplit("x\"y\"'z'w"), "split 7")
    eq(listOf<String>("", ""), ShellQuote.shellSplit("'' \"\""), "split 8")
    eq(listOf<String>("a", "b", "c"), ShellQuote.shellSplit("a\tb\nc"), "split 9")
    eq(listOf<String>("echo", "\$HOME", "*.txt", "~"), ShellQuote.shellSplit("echo \$HOME *.txt ~"), "split 10")
    eq(listOf<String>("ab"), ShellQuote.shellSplit("\"a\\\nb\""), "split 11")
    eq(listOf<String>("ab"), ShellQuote.shellSplit("a\\\nb"), "split 12")
    eq(listOf<String>(), ShellQuote.shellSplit("# comment"), "split 13")
    eq(listOf<String>("cmd"), ShellQuote.shellSplit("cmd # trailing comment"), "split 14")
    eq(listOf<String>("a#b"), ShellQuote.shellSplit("a#b"), "split 15")
    eq(listOf<String>("\$x"), ShellQuote.shellSplit("\"\$x\""), "split 16")
    eq(listOf<String>("lead", "trail"), ShellQuote.shellSplit("  lead  trail  "), "split 17")
    eq(listOf(""), ShellQuote.shellSplit(ShellQuote.shellQuote("")), "roundtrip 0")
    eq(listOf("abc"), ShellQuote.shellSplit(ShellQuote.shellQuote("abc")), "roundtrip 1")
    eq(listOf("a b"), ShellQuote.shellSplit(ShellQuote.shellQuote("a b")), "roundtrip 2")
    eq(listOf("it's"), ShellQuote.shellSplit(ShellQuote.shellQuote("it's")), "roundtrip 3")
    eq(listOf("a\"b"), ShellQuote.shellSplit(ShellQuote.shellQuote("a\"b")), "roundtrip 4")
    eq(listOf("\$HOME"), ShellQuote.shellSplit(ShellQuote.shellQuote("\$HOME")), "roundtrip 5")
    eq(listOf("*.txt"), ShellQuote.shellSplit(ShellQuote.shellQuote("*.txt")), "roundtrip 6")
    eq(listOf("x=1"), ShellQuote.shellSplit(ShellQuote.shellQuote("x=1")), "roundtrip 7")
    eq(listOf("path/to/file.txt"), ShellQuote.shellSplit(ShellQuote.shellQuote("path/to/file.txt")), "roundtrip 8")
    eq(listOf("tab\there"), ShellQuote.shellSplit(ShellQuote.shellQuote("tab\there")), "roundtrip 9")
    eq(listOf("line\nbreak"), ShellQuote.shellSplit(ShellQuote.shellQuote("line\nbreak")), "roundtrip 10")
    eq(listOf("\u00e9"), ShellQuote.shellSplit(ShellQuote.shellQuote("\u00e9")), "roundtrip 11")
    eq(listOf("-n"), ShellQuote.shellSplit(ShellQuote.shellQuote("-n")), "roundtrip 12")
    eq(listOf("~user"), ShellQuote.shellSplit(ShellQuote.shellQuote("~user")), "roundtrip 13")
    eq(listOf("!bang"), ShellQuote.shellSplit(ShellQuote.shellQuote("!bang")), "roundtrip 14")
    eq(listOf("''"), ShellQuote.shellSplit(ShellQuote.shellQuote("''")), "roundtrip 15")
    eq(listOf<String>("", "abc", "a b", "it's", "a\"b", "\$HOME", "*.txt", "x=1", "path/to/file.txt", "tab\there", "line\nbreak", "\u00e9", "-n", "~user", "!bang", "''"), ShellQuote.shellSplit(ShellQuote.shellJoin(listOf<String>("", "abc", "a b", "it's", "a\"b", "\$HOME", "*.txt", "x=1", "path/to/file.txt", "tab\there", "line\nbreak", "\u00e9", "-n", "~user", "!bang", "''"))), "join roundtrip")
    throwsIae("invalid split 0") { ShellQuote.shellSplit("'open") }
    throwsIae("invalid split 1") { ShellQuote.shellSplit("\"open") }
    throwsIae("invalid split 2") { ShellQuote.shellSplit("trail\\") }
    throwsIae("invalid split 3") { ShellQuote.shellSplit("\"bad \\") }

    println("ShellQuoteTest: $passed passed, $failed failed")
    if (failed > 0) exitProcess(1)
}
