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
    eqOrd(omap("" to omap("a" to "1", "b" to "two")), IniParse.parseIni("a=1\nb = two\n"), "parse 0")
    eqOrd(omap("" to omap(), "db" to omap("host" to "localhost", "port" to "5432")), IniParse.parseIni("[db]\nhost = localhost ; comment\nport: 5432\n"), "parse 1")
    eqOrd(omap("" to omap(), "s" to omap("k" to "quoted \"x\" \\ ;#")), IniParse.parseIni("; c\n# c\n\n[s]\nk=\"quoted \\\"x\\\" \\\\ ;#\"\n"), "parse 2")
    eqOrd(omap("" to omap(), "s" to omap("flag" to "", "x" to "a#b", "y" to "a")), IniParse.parseIni("[s]\nflag\nx = a#b\ny = a #b\n"), "parse 3")
    eqOrd(omap("" to omap(), "a" to omap("k" to "3", "j" to "4"), "b" to omap("k" to "2")), IniParse.parseIni("[a]\nk=1\n[b]\nk=2\n[a]\nk=3\nj=4\n"), "parse 4")
    eqOrd(omap("" to omap("k" to "v = w")), IniParse.parseIni("k: v = w\n"), "parse 5")
    eqOrd(omap("" to omap(), "spaced name" to omap("K" to "V", "k2" to "v2")), IniParse.parseIni("[ spaced name ]\nK=V\r\nk2=v2\r\n"), "parse 6")
    eqOrd(omap("" to omap()), IniParse.parseIni(""), "parse 7")
    eq("a = 1\n\n[s]\nk = v\ne = \"\"\nsp = \" x\"\nq = \"a\\\"b;c\"\n", IniParse.stringifyIni(linkedMapOf<String, Map<String, String>>("" to linkedMapOf<String, String>("a" to "1"), "s" to linkedMapOf<String, String>("k" to "v", "e" to "", "sp" to " x", "q" to "a\"b;c"))), "stringify 0")
    eqOrd(linkedMapOf<String, Map<String, String>>("" to linkedMapOf<String, String>("a" to "1"), "s" to linkedMapOf<String, String>("k" to "v", "e" to "", "sp" to " x", "q" to "a\"b;c")), IniParse.parseIni(IniParse.stringifyIni(linkedMapOf<String, Map<String, String>>("" to linkedMapOf<String, String>("a" to "1"), "s" to linkedMapOf<String, String>("k" to "v", "e" to "", "sp" to " x", "q" to "a\"b;c")))), "stringify round trip 0")
    eq("[only]\nx = y\n", IniParse.stringifyIni(linkedMapOf<String, Map<String, String>>("" to linkedMapOf<String, String>(), "only" to linkedMapOf<String, String>("x" to "y"))), "stringify 1")
    eqOrd(linkedMapOf<String, Map<String, String>>("" to linkedMapOf<String, String>(), "only" to linkedMapOf<String, String>("x" to "y")), IniParse.parseIni(IniParse.stringifyIni(linkedMapOf<String, Map<String, String>>("" to linkedMapOf<String, String>(), "only" to linkedMapOf<String, String>("x" to "y")))), "stringify round trip 1")
    eq("", IniParse.stringifyIni(linkedMapOf<String, Map<String, String>>("" to linkedMapOf<String, String>())), "stringify 2")
    eqOrd(linkedMapOf<String, Map<String, String>>("" to linkedMapOf<String, String>()), IniParse.parseIni(IniParse.stringifyIni(linkedMapOf<String, Map<String, String>>("" to linkedMapOf<String, String>()))), "stringify round trip 2")
    throwsMsg("line ", "invalid 0") { IniParse.parseIni("[unterminated\n") }
    throwsMsg("line ", "invalid 1") { IniParse.parseIni("[]\n") }
    throwsMsg("line ", "invalid 2") { IniParse.parseIni("=v\n") }
    throwsMsg("line ", "invalid 3") { IniParse.parseIni("k=\"open\n") }
    throwsMsg("line ", "invalid 4") { IniParse.parseIni("[a]]\n") }

    println("IniParseTest: $passed passed, $failed failed")
    if (failed > 0) exitProcess(1)
}
