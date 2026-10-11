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
    eq("I", RomanNumerals.toRoman(1), "to 1")
    eq("IV", RomanNumerals.toRoman(4), "to 4")
    eq("IX", RomanNumerals.toRoman(9), "to 9")
    eq("XIV", RomanNumerals.toRoman(14), "to 14")
    eq("XL", RomanNumerals.toRoman(40), "to 40")
    eq("XC", RomanNumerals.toRoman(90), "to 90")
    eq("CD", RomanNumerals.toRoman(400), "to 400")
    eq("MCMXCIV", RomanNumerals.toRoman(1994), "to 1994")
    eq("MMXXVI", RomanNumerals.toRoman(2026), "to 2026")
    eq("MMMDCCCLXXXVIII", RomanNumerals.toRoman(3888), "to 3888")
    eq("MMMCMXCIX", RomanNumerals.toRoman(3999), "to 3999")
    eq(1, RomanNumerals.fromRoman("I"), "from I")
    eq(4, RomanNumerals.fromRoman("iv"), "from iv")
    eq(1994, RomanNumerals.fromRoman("MCMXCIV"), "from MCMXCIV")
    eq(2026, RomanNumerals.fromRoman("mmxxvi"), "from mmxxvi")
    eq(3999, RomanNumerals.fromRoman("MMMCMXCIX"), "from MMMCMXCIX")
    throwsIae("invalid to 0") { RomanNumerals.toRoman(0) }
    throwsIae("invalid to 4000") { RomanNumerals.toRoman(4000) }
    throwsIae("invalid to -5") { RomanNumerals.toRoman(-5) }
    throwsIae("invalid from 0") { RomanNumerals.fromRoman("") }
    throwsIae("invalid from 1") { RomanNumerals.fromRoman("IIII") }
    throwsIae("invalid from 2") { RomanNumerals.fromRoman("IC") }
    throwsIae("invalid from 3") { RomanNumerals.fromRoman("VX") }
    throwsIae("invalid from 4") { RomanNumerals.fromRoman("MMMM") }
    throwsIae("invalid from 5") { RomanNumerals.fromRoman("ABC") }
    throwsIae("invalid from 6") { RomanNumerals.fromRoman("IIV") }
    throwsIae("invalid from 7") { RomanNumerals.fromRoman("XM") }
    for (n in 1..3999) check(RomanNumerals.fromRoman(RomanNumerals.toRoman(n)) == n, "round trip $n")

    println("RomanNumeralsTest: $passed passed, $failed failed")
    if (failed > 0) exitProcess(1)
}
