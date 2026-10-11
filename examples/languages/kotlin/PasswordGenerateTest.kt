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
    val src0 = bytes("00ff10a37c55e2019b")
    eq(listOf(0, 6, 3, 4, 5, 6), (1..6).map { PasswordGenerate.randomIndex(10, src0) }, "random index 0")
    val src1 = bytes("ffff0102a0b0")
    eq(listOf(258, 36, 258, 36, 258, 36), (1..6).map { PasswordGenerate.randomIndex(300, src1) }, "random index 1")
    val src2 = bytes("00")
    eq(listOf(0, 0, 0, 0, 0, 0), (1..6).map { PasswordGenerate.randomIndex(1, src2) }, "random index 2")
    val src3 = bytes("ab")
    eq(listOf(171, 171, 171, 171, 171, 171), (1..6).map { PasswordGenerate.randomIndex(256, src3) }, "random index 3")
    val src4 = bytes("f0f8fc00")
    eq(listOf(54, 0, 54, 0, 54, 0), (1..6).map { PasswordGenerate.randomIndex(62, src4) }, "random index 4")
    eq("jl__j_ad3WbbdqQa", PasswordGenerate.generatePassword(16, listOf("lower", "upper", "digits", "symbols"), bytes("00ff10a37c55e2019b"), false), "password 0")
    eq("hkjibfmdnge4", PasswordGenerate.generatePassword(12, listOf("lower", "digits"), bytes("0102030405060708090a0b0c0d0e0f"), true), "password 1")
    eq("X7x#", PasswordGenerate.generatePassword(4, listOf("upper", "lower", "digits", "symbols"), bytes("7f"), false), "password 2")
    eq("!!!!!!!!!!!!!!!!!!!!", PasswordGenerate.generatePassword(20, listOf("symbols"), bytes("ffffffffffffffff00"), false), "password 3")
    eq("river-stone-cloud-maple", PasswordGenerate.generatePassphrase(listOf("apple", "river", "stone", "cloud", "maple"), 4, "-", bytes("0102030405")), "passphrase 0")
    eq("b a b", PasswordGenerate.generatePassphrase(listOf("a", "b"), 3, " ", bytes("ff00")), "passphrase 1")
    eq(99.97, PasswordGenerate.entropyBits(76, 16), "entropy 0")
    eq(19.93, PasswordGenerate.entropyBits(10, 6), "entropy 1")
    eq(64.62, PasswordGenerate.entropyBits(7776, 5), "entropy 2")
    eq(1.0, PasswordGenerate.entropyBits(2, 1), "entropy 3")
    throwsIae("invalid password 0") { PasswordGenerate.generatePassword(3, listOf("lower", "upper", "digits", "symbols"), bytes("00"), false) }
    throwsIae("invalid password 1") { PasswordGenerate.generatePassword(8, listOf(), bytes("00"), false) }
    throwsIae("invalid password 2") { PasswordGenerate.generatePassword(8, listOf("lower", "lower"), bytes("00"), false) }
    throwsIae("invalid password 3") { PasswordGenerate.generatePassword(8, listOf("emoji"), bytes("00"), false) }
    throwsIae("invalid password 4") { PasswordGenerate.generatePassword(1025, listOf("lower"), bytes("00"), false) }
    throwsIae("invalid passphrase 0") { PasswordGenerate.generatePassphrase(listOf("a"), 3, "-", bytes("00")) }
    throwsIae("invalid passphrase 1") { PasswordGenerate.generatePassphrase(listOf("a", "b"), 0, "-", bytes("00")) }
    throwsIae("invalid passphrase 2") { PasswordGenerate.generatePassphrase(listOf("a", "b"), 65, "-", bytes("00")) }
    throwsIae("invalid passphrase 3") { PasswordGenerate.generatePassphrase(listOf("a", ""), 2, "-", bytes("00")) }
    throwsIae("random index n < 1") { PasswordGenerate.randomIndex(0, bytes("00")) }
    val secure = PasswordGenerate.generatePassword()
    check(secure.length == 16 && secure.any { it.isLowerCase() } && secure.any { it.isUpperCase() } && secure.any { it.isDigit() } && secure.any { it in "!#\$%&*+-=?@^_~" }, "secure default password")
    check(PasswordGenerate.generatePassphrase(listOf("a", "b"), 3, "-").split("-").size == 3, "secure passphrase")

    println("PasswordGenerateTest: $passed passed, $failed failed")
    if (failed > 0) exitProcess(1)
}
