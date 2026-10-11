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
    eq("", Base58.base58Encode(hex("")), "encode 0")
    eq("", toHex(Base58.base58Decode("")), "decode 0")
    eq("1", Base58.base58Encode(hex("00")), "encode 1")
    eq("00", toHex(Base58.base58Decode("1")), "decode 1")
    eq("112", Base58.base58Encode(hex("000001")), "encode 2")
    eq("000001", toHex(Base58.base58Decode("112")), "decode 2")
    eq("StV1DL6CwTryKyV", Base58.base58Encode(hex("68656c6c6f20776f726c64")), "encode 3")
    eq("68656c6c6f20776f726c64", toHex(Base58.base58Decode("StV1DL6CwTryKyV")), "decode 3")
    eq("1kA3B2yGe2z4", Base58.base58Encode(hex("00010203040506070809")), "encode 4")
    eq("00010203040506070809", toHex(Base58.base58Decode("1kA3B2yGe2z4")), "decode 4")
    eq("jpXCZedGfVQ", Base58.base58Encode(hex("ffffffffffffffff")), "encode 5")
    eq("ffffffffffffffff", toHex(Base58.base58Decode("jpXCZedGfVQ")), "decode 5")
    eq("11Cn8eVZg", Base58.base58Encode(hex("000068656c6c6f")), "encode 6")
    eq("000068656c6c6f", toHex(Base58.base58Decode("11Cn8eVZg")), "decode 6")
    eq("1PMycacnJaSqwwJqjawXBErnLsZ7RkXUAs", Base58.base58CheckEncode(hex("00f54a5851e9372b87810a8e60cdd2e7cfd80b6e31")), "check encode 0")
    eq("00f54a5851e9372b87810a8e60cdd2e7cfd80b6e31", toHex(Base58.base58CheckDecode("1PMycacnJaSqwwJqjawXBErnLsZ7RkXUAs")), "check decode 0")
    eq("5HwoXVkHoRM8sL2KmNRS217n1g8mPPBomrY7yehCuXC1115WWsh", Base58.base58CheckEncode(hex("801111111111111111111111111111111111111111111111111111111111111111")), "check encode 1")
    eq("801111111111111111111111111111111111111111111111111111111111111111", toHex(Base58.base58CheckDecode("5HwoXVkHoRM8sL2KmNRS217n1g8mPPBomrY7yehCuXC1115WWsh")), "check decode 1")
    eq("3QJmnh", Base58.base58CheckEncode(hex("")), "check encode 2")
    eq("", toHex(Base58.base58CheckDecode("3QJmnh")), "check decode 2")
    throwsIae("invalid decode 0") { Base58.base58Decode("0OIl") }
    throwsIae("invalid decode 1") { Base58.base58Decode("abc+") }
    throwsIae("invalid check 0") { Base58.base58CheckDecode("1PMycacnJaSqwwJqjawXBErnLsZ7RkXUAt") }
    throwsIae("invalid check 1") { Base58.base58CheckDecode("1") }
    throwsIae("invalid check 2") { Base58.base58CheckDecode("") }

    println("Base58Test: $passed passed, $failed failed")
    if (failed > 0) exitProcess(1)
}
