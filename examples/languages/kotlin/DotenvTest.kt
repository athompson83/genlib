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
    eqOrd(linkedMapOf<String, String>("A" to "1", "B" to "two"), Dotenv.parseDotenv("A=1\nB=two\n"), "parse 0")
    eqOrd(linkedMapOf<String, String>("KEY" to "value with spaces"), Dotenv.parseDotenv("# c\n\nexport KEY = value with spaces  # comment\n"), "parse 1")
    eqOrd(linkedMapOf<String, String>("Q" to "a\nb\t\"c\" \\ \$HOME"), Dotenv.parseDotenv("Q=\"a\\nb\\t\\\"c\\\" \\\\ \\\$HOME\"\n"), "parse 2")
    eqOrd(linkedMapOf<String, String>("S" to "raw \${X} \\n"), Dotenv.parseDotenv("S='raw \${X} \\n'\n"), "parse 3")
    eqOrd(linkedMapOf<String, String>("M" to "line1\nline2", "N" to "after"), Dotenv.parseDotenv("M=\"line1\nline2\"\nN=after\n"), "parse 4")
    eqOrd(linkedMapOf<String, String>("E" to "", "F" to ""), Dotenv.parseDotenv("E=\nF= \n"), "parse 5")
    eqOrd(linkedMapOf<String, String>("DUP" to "2"), Dotenv.parseDotenv("DUP=1\nDUP=2\n"), "parse 6")
    eqOrd(linkedMapOf<String, String>("URL" to "https://x.test/#frag"), Dotenv.parseDotenv("URL=https://x.test/#frag\n"), "parse 7")
    eqOrd(linkedMapOf<String, String>("H" to "a#b"), Dotenv.parseDotenv("H=a#b\n"), "parse 8")
    eqOrd(linkedMapOf<String, String>("K.x_y" to "1"), Dotenv.parseDotenv("K.x_y=1\n"), "parse 9")
    eqOrd(linkedMapOf<String, String>("W" to "x"), Dotenv.parseDotenv("W=\"x\" # trailing ok\n"), "parse 10")
    eqOrd(linkedMapOf<String, String>("CRLF" to "1", "NEXT" to "2"), Dotenv.parseDotenv("CRLF=1\r\nNEXT=2\r\n"), "parse 11")
    eqOrd(linkedMapOf<String, String>("A" to "1", "B" to "1-x"), Dotenv.parseDotenv("A=1\nB=\${A}-x\n", true, linkedMapOf<String, String>()), "expand 0")
    eqOrd(linkedMapOf<String, String>("B" to "env", "A" to "1"), Dotenv.parseDotenv("B=\${A}\nA=1\n", true, linkedMapOf<String, String>("A" to "env")), "expand 1")
    eqOrd(linkedMapOf<String, String>("P" to "fallback", "Q" to "d"), Dotenv.parseDotenv("P=\${MISSING:-fallback}\nQ=\${EMPTY:-d}\n", true, linkedMapOf<String, String>("EMPTY" to "")), "expand 2")
    eqOrd(linkedMapOf<String, String>("S" to "\${A}", "T" to "v", "U" to "\${A}"), Dotenv.parseDotenv("S='\${A}'\nT=\"\${A}\"\nU=\"\\\${A}\"\n", true, linkedMapOf<String, String>("A" to "v")), "expand 3")
    throwsMsg("line ", "invalid 0") { Dotenv.parseDotenv("NOEQUALS\n") }
    throwsMsg("line ", "invalid 1") { Dotenv.parseDotenv("1BAD=x\n") }
    throwsMsg("line ", "invalid 2") { Dotenv.parseDotenv("A='unterminated\n") }
    throwsMsg("line ", "invalid 3") { Dotenv.parseDotenv("A=\"never closed\nB=1\n") }
    throwsMsg("line ", "invalid 4") { Dotenv.parseDotenv("A=\"x\" junk\n") }
    throwsMsg("line ", "invalid 5") { Dotenv.parseDotenv("-K=v\n") }
    throwsMsg("line 3:", "error names the line") { Dotenv.parseDotenv("A=1\n\nB\n") }

    println("DotenvTest: $passed passed, $failed failed")
    if (failed > 0) exitProcess(1)
}
