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
    eq(true, GlobMatch.globMatch("*.js", "a.js", false), "match 0")
    eq(false, GlobMatch.globMatch("*.js", "a/b.js", false), "match 1")
    eq(true, GlobMatch.globMatch("**/*.js", "a/b/c.js", false), "match 2")
    eq(true, GlobMatch.globMatch("**/*.js", "c.js", false), "match 3")
    eq(true, GlobMatch.globMatch("src/**", "src", false), "match 4")
    eq(true, GlobMatch.globMatch("src/**", "src/a/b.ts", false), "match 5")
    eq(true, GlobMatch.globMatch("src/**/test/*.py", "src/test/x.py", false), "match 6")
    eq(true, GlobMatch.globMatch("src/**/test/*.py", "src/a/b/test/x.py", false), "match 7")
    eq(true, GlobMatch.globMatch("a?c", "abc", false), "match 8")
    eq(false, GlobMatch.globMatch("a?c", "a/c", false), "match 9")
    eq(true, GlobMatch.globMatch("[a-c]x", "bx", false), "match 10")
    eq(false, GlobMatch.globMatch("[!a-c]x", "bx", false), "match 11")
    eq(true, GlobMatch.globMatch("[!a-c]x", "dx", false), "match 12")
    eq(true, GlobMatch.globMatch("[^0-9]", "x", false), "match 13")
    eq(true, GlobMatch.globMatch("[]a]", "a", false), "match 14")
    eq(true, GlobMatch.globMatch("[]a]", "]", false), "match 15")
    eq(true, GlobMatch.globMatch("*.{js,ts}", "x.ts", false), "match 16")
    eq(false, GlobMatch.globMatch("*.{js,ts}", "x.tsx", false), "match 17")
    eq(true, GlobMatch.globMatch("{src,lib}/**/*.go", "lib/x/y.go", false), "match 18")
    eq(true, GlobMatch.globMatch(".*", ".env", false), "match 19")
    eq(false, GlobMatch.globMatch("*", ".env", false), "match 20")
    eq(true, GlobMatch.globMatch("*", ".env", true), "match 21")
    eq(false, GlobMatch.globMatch("**/x", ".git/x", false), "match 22")
    eq(true, GlobMatch.globMatch("**/x", ".git/x", true), "match 23")
    eq(true, GlobMatch.globMatch("a\\*b", "a*b", false), "match 24")
    eq(false, GlobMatch.globMatch("a\\*b", "axb", false), "match 25")
    eq(true, GlobMatch.globMatch("*", "", false), "match 26")
    eq(true, GlobMatch.globMatch("**", "a/b/c", false), "match 27")
    eq(true, GlobMatch.globMatch("a/**/b", "a/b", false), "match 28")
    eq(true, GlobMatch.globMatch("a/**/b", "a/x/y/b", false), "match 29")
    eq(false, GlobMatch.globMatch("*.txt", "notes.TXT", false), "match 30")
    eq(false, GlobMatch.globMatch("[a-z]*.md", "Readme.md", false), "match 31")
    eq(false, GlobMatch.globMatch("docs/*", "docs/a/b", false), "match 32")
    eq(true, GlobMatch.globMatch("?", "\u00E9", false), "match 33")
    throwsIae("invalid 0") { GlobMatch.globMatch("[abc", "x") }
    throwsIae("invalid 1") { GlobMatch.globMatch("{a,b", "x") }
    throwsIae("invalid 2") { GlobMatch.globMatch("a{b{c}}", "x") }
    throwsIae("invalid 3") { GlobMatch.globMatch("", "x") }
    throwsIae("invalid 4") { GlobMatch.globMatch("x\\", "x") }
    eq(listOf("a.js", "x/b.js"), GlobMatch.globFilter("**/*.js", listOf("a.js", "a.ts", "x/b.js", ".h/c.js")), "filter")
    eq(listOf("a.js", "x/b.js", ".h/c.js"), GlobMatch.globFilter("**/*.js", listOf("a.js", "a.ts", "x/b.js", ".h/c.js"), true), "filter dot")
    eq(false, GlobMatch.globMatch("a*a*a*a*a*a*a*a*a*a*a*b", "a".repeat(60)), "no exponential blowup in a segment")
    eq(false, GlobMatch.globMatch("**/**/**/**/**/**/**/**/z", "a/".repeat(40) + "b"), "no exponential blowup across segments")
    eq(true, GlobMatch.globMatch("[\uD83D\uDE00-\uD83D\uDE4F]", "\uD83D\uDE03"), "class range by code point")

    println("GlobMatchTest: $passed passed, $failed failed")
    if (failed > 0) exitProcess(1)
}
