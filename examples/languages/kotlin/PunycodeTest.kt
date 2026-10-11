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
    eq("bcher-kva", Punycode.punycodeEncode("b\u00FCcher"), "encode 0")
    eq("mnchen-3ya", Punycode.punycodeEncode("m\u00FCnchen"), "encode 1")
    eq("wgv71a119e", Punycode.punycodeEncode("\u65E5\u672C\u8A9E"), "encode 2")
    eq("tda", Punycode.punycodeEncode("\u00FC"), "encode 3")
    eq("abc-", Punycode.punycodeEncode("abc"), "encode 4")
    eq("Maana-pta", Punycode.punycodeEncode("Ma\u00F1ana"), "encode 5")
    eq("hxargifdar", Punycode.punycodeEncode("\u03B5\u03BB\u03BB\u03B7\u03BD\u03B9\u03BA\u03AC"), "encode 6")
    eq("80aafi6cg", Punycode.punycodeEncode("\u043F\u0440\u0430\u0432\u0434\u0430"), "encode 7")
    eq("e28h", Punycode.punycodeEncode("\uD83D\uDE00"), "encode 8")
    eq("a-b-", Punycode.punycodeEncode("a-b"), "encode 9")
    eq("--", Punycode.punycodeEncode("-"), "encode 10")
    eq("mgbmm8erar", Punycode.punycodeEncode("\u0627\u0644\u062D\u0631\u064A\u0647"), "encode 11")
    eq("Hello-Another-Way--fc4qua05auwb3674vfr0b", Punycode.punycodeEncode("Hello-Another-Way-\u305D\u308C\u305E\u308C\u306E\u5834\u6240"), "encode 12")
    eq("BER-ska", Punycode.punycodeEncode("\u00DCBER"), "encode 13")
    eq("x-bga22n", Punycode.punycodeEncode("x\u00E9\u0301"), "encode 14")
    eq("b\u00FCcher", Punycode.punycodeDecode("bcher-kva"), "decode 0")
    eq("m\u00FCnchen", Punycode.punycodeDecode("mnchen-3ya"), "decode 1")
    eq("\u65E5\u672C\u8A9E", Punycode.punycodeDecode("wgv71a119e"), "decode 2")
    eq("\u00FC", Punycode.punycodeDecode("tda"), "decode 3")
    eq("abc", Punycode.punycodeDecode("abc-"), "decode 4")
    eq("Ma\u00F1ana", Punycode.punycodeDecode("Maana-pta"), "decode 5")
    eq("\u03B5\u03BB\u03BB\u03B7\u03BD\u03B9\u03BA\u03AC", Punycode.punycodeDecode("hxargifdar"), "decode 6")
    eq("\u043F\u0440\u0430\u0432\u0434\u0430", Punycode.punycodeDecode("80aafi6cg"), "decode 7")
    eq("\uD83D\uDE00", Punycode.punycodeDecode("e28h"), "decode 8")
    eq("a-b", Punycode.punycodeDecode("a-b-"), "decode 9")
    eq("-", Punycode.punycodeDecode("--"), "decode 10")
    eq("\u0627\u0644\u062D\u0631\u064A\u0647", Punycode.punycodeDecode("mgbmm8erar"), "decode 11")
    eq("Hello-Another-Way-\u305D\u308C\u305E\u308C\u306E\u5834\u6240", Punycode.punycodeDecode("Hello-Another-Way--fc4qua05auwb3674vfr0b"), "decode 12")
    eq("\u00DCBER", Punycode.punycodeDecode("BER-ska"), "decode 13")
    eq("x\u00E9\u0301", Punycode.punycodeDecode("x-bga22n"), "decode 14")
    eq("b\u00FCcher", Punycode.punycodeDecode("bcher-kva"), "decode 15")
    eq("xn--bcher-kva.example", Punycode.domainToAscii("B\u00FCcher.Example"), "domainToAscii 0")
    eq("example.com", Punycode.domainToAscii("EXAMPLE.com"), "domainToAscii 1")
    eq("xn--wgv71a119e.jp.", Punycode.domainToAscii("\u65E5\u672C\u8A9E.jp."), "domainToAscii 2")
    eq("xn--mnchen-3ya.de", Punycode.domainToAscii("m\u00FCnchen.de"), "domainToAscii 3")
    eq("a.b.c", Punycode.domainToAscii("a.b.c"), "domainToAscii 4")
    eq("b\u00FCcher.example", Punycode.domainToUnicode("xn--bcher-kva.example"), "domainToUnicode 0")
    eq("\u65E5\u672C\u8A9E.jp", Punycode.domainToUnicode("XN--wgv71a119e.jp"), "domainToUnicode 1")
    eq("plain.com", Punycode.domainToUnicode("plain.com"), "domainToUnicode 2")
    throwsIae("invalid decode 0") { Punycode.punycodeDecode("bcher-kv!") }
    throwsIae("invalid decode 1") { Punycode.punycodeDecode("a-99999999999999999999") }
    throwsIae("invalid decode 2") { Punycode.punycodeDecode("\u00FC-abc") }
    throwsIae("invalid decode 3") { Punycode.punycodeDecode("xyzzy123456789zzzz") }
    throwsIae("invalid domain 0") { Punycode.domainToAscii("a..b") }
    throwsIae("invalid domain 1") { Punycode.domainToAscii(".x") }
    throwsIae("invalid domain 2") { Punycode.domainToAscii("xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx.com") }
    throwsIae("invalid domain 3") { Punycode.domainToAscii("\u00FC\u00FC\u00FC\u00FC\u00FC\u00FC\u00FC\u00FC\u00FC\u00FC\u00FC\u00FC\u00FC\u00FC\u00FC\u00FC\u00FC\u00FC\u00FC\u00FC\u00FC\u00FC\u00FC\u00FC\u00FC\u00FC\u00FC\u00FC\u00FC\u00FC\u00FC\u00FC\u00FC\u00FC\u00FC\u00FC\u00FC\u00FC\u00FC\u00FC\u00FC\u00FC\u00FC\u00FC\u00FC\u00FC\u00FC\u00FC\u00FC\u00FC\u00FC\u00FC\u00FC\u00FC\u00FC\u00FC\u00FC\u00FC\u00FC\u00FC.com") }
    throwsIae("non-digit after delimiter") { Punycode.punycodeDecode("abc-\u00FC") }
    throwsIae("truncated") { Punycode.punycodeDecode("z") }
    throwsIae("decodes past U+10FFFF") { Punycode.punycodeDecode("99999a") }

    println("PunycodeTest: $passed passed, $failed failed")
    if (failed > 0) exitProcess(1)
}
