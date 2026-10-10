// SPDX-License-Identifier: Apache-2.0
import kotlin.system.exitProcess

private var passed = 0
private var failed = 0

private fun check(ok: Boolean, name: String) {
    if (ok) passed++ else { failed++; System.err.println("FAIL: $name") }
}

private fun eq(expected: Any, actual: Any?, name: String) = check(expected == actual, "$name expected <$expected> got <$actual>")

private fun throwsIae(name: String, block: () -> Unit) {
    try { block(); check(false, "$name did not throw") } catch (e: IllegalArgumentException) { check(true, name) }
}

fun main() {
    eq("7K3QX9MNP2", RecoveryCodes.normalizeRecoveryCode(" 7k3qx-9mnp2 "), "normalize spacing and case")
    eq("ABCDEFGH10", RecoveryCodes.normalizeRecoveryCode("ABCDE-FGHIO"), "normalize I/O mapping")
    throwsIae("normalize rejects U") { RecoveryCodes.normalizeRecoveryCode("ABCDE-FGHIU") }
    throwsIae("normalize rejects length") { RecoveryCodes.normalizeRecoveryCode("ABC") }

    val key = "pepper".toByteArray(Charsets.US_ASCII)
    // Cross-checked with Python hmac.new(b'pepper', b'7K3QX9MNP2', hashlib.sha256).hexdigest().
    eq("b6a0f9ca8ffdc4e8e3268b490bb8beeda45f367550751b8cb151636dad869138", RecoveryCodes.hashRecoveryCode("7K3QX-9MNP2", key), "hash vector")

    val codes = RecoveryCodes.generateRecoveryCodes()
    eq(10, codes.size, "generates 10 codes")
    eq(10, codes.toSet().size, "codes are unique")
    val format = Regex("^[0-9A-HJKMNP-TV-Z]{5}-[0-9A-HJKMNP-TV-Z]{5}$")
    check(codes.all { format.matches(it) }, "codes match format")

    val hashes = codes.take(3).map { RecoveryCodes.hashRecoveryCode(it, key) }
    eq(2, RecoveryCodes.findRecoveryCode(codes[2].lowercase(), hashes, key), "find index 2")
    eq(-1, RecoveryCodes.findRecoveryCode(codes[3], hashes, key), "unknown code not found")
    eq(-1, RecoveryCodes.findRecoveryCode("not a code", hashes, key), "malformed code not found")

    println("RecoveryCodesTest: $passed passed, $failed failed")
    if (failed > 0) exitProcess(1)
}
