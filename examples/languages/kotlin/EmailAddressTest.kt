// SPDX-License-Identifier: Apache-2.0
import kotlin.system.exitProcess

private var passed = 0
private var failed = 0

private fun check(ok: Boolean, name: String) {
    if (ok) passed++ else { failed++; System.err.println("FAIL: $name") }
}

private fun eq(expected: Any?, actual: Any?, name: String) = check(expected == actual, "$name expected <$expected> got <$actual>")

private fun throwsIae(name: String, block: () -> Unit) {
    try { block(); check(false, "$name did not throw") } catch (e: IllegalArgumentException) { check(true, name) }
}

fun main() {
    val a63 = "a".repeat(63)
    val longDomain = "$a63.$a63.$a63."
    val valid = listOf(
        "user@example.com" to true, "first.last+tag@sub.Example.CO.uk" to true, "o'brien@example.ie" to true, "a@b" to true,
        "user@-example.com" to false, "user@example-.com" to false, "user@exa_mple.com" to false, "user example@example.com" to false,
        "user@@example.com" to false, "@example.com" to false, "user@" to false, "user@example..com" to false, "user.@example.com" to true,
        "ünïcode@example.com" to false, "x".repeat(64) + "@example.com" to true, "x".repeat(65) + "@example.com" to false,
        "u@" + longDomain + "b".repeat(59) to true, "u@" + longDomain + "b".repeat(61) to false, "user@" + "a".repeat(64) + ".com" to false,
    )
    for ((s, want) in valid) eq(want, EmailAddress.emailValid(s), "valid $s")
    eq("Mixed.Case@example.com", EmailAddress.emailNormalize("  Mixed.Case@Example.COM "), "normalize")
    throwsIae("normalize invalid") { EmailAddress.emailNormalize("not an email") }

    println("EmailAddressTest: $passed passed, $failed failed")
    if (failed > 0) exitProcess(1)
}
