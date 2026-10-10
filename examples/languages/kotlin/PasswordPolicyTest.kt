// SPDX-License-Identifier: Apache-2.0
// Every vector line is copied from the shared wave 7 vectors (vectors.json) used by all Genlib languages.
import kotlin.system.exitProcess

// Wave 7 vectors (shared with every Genlib language) for password-policy.
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
    eq(PasswordPolicy.Result(true, listOf()), PasswordPolicy.checkPassword("correct horse battery staple", PasswordPolicy.Options()), "password case 0")
    eq(PasswordPolicy.Result(false, listOf("too-short")), PasswordPolicy.checkPassword("short", PasswordPolicy.Options()), "password case 1")
    eq(PasswordPolicy.Result(true, listOf()), PasswordPolicy.checkPassword("Tr0ub4dor&3", PasswordPolicy.Options(minLength = 8)), "password case 2")
    eq(PasswordPolicy.Result(false, listOf("blocklisted")), PasswordPolicy.checkPassword("password", PasswordPolicy.Options(minLength = 8, blocklist = listOf("Password", "123456"))), "password case 3")
    eq(PasswordPolicy.Result(false, listOf("too-long", "repetitive")), PasswordPolicy.checkPassword("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", PasswordPolicy.Options(maxLength = 64)), "password case 4")
    eq(PasswordPolicy.Result(false, listOf("repetitive")), PasswordPolicy.checkPassword("aaaa-unique-phrase-x", PasswordPolicy.Options()), "password case 5")
    eq(PasswordPolicy.Result(false, listOf("repetitive")), PasswordPolicy.checkPassword("my-1234-long-passphrase", PasswordPolicy.Options()), "password case 6")
    eq(PasswordPolicy.Result(false, listOf("repetitive")), PasswordPolicy.checkPassword("zyxw-backwards-phrase!", PasswordPolicy.Options()), "password case 7")
    eq(PasswordPolicy.Result(false, listOf("contains-context")), PasswordPolicy.checkPassword("alice-secret-passphrase", PasswordPolicy.Options(context = listOf("alice", "example"))), "password case 8")
    eq(PasswordPolicy.Result(false, listOf("control-characters")), PasswordPolicy.checkPassword("tab\tinside-long-enough", PasswordPolicy.Options()), "password case 9")
    eq(PasswordPolicy.Result(true, listOf()), PasswordPolicy.checkPassword("\u00FCn\u00EFc\u00F6d\u00E9-p\u00E4ssw\u00F6rd-long", PasswordPolicy.Options()), "password case 10")
    eq(PasswordPolicy.Result(false, listOf("repetitive")), PasswordPolicy.checkPassword("\uD83D\uDE00\uD83D\uDE00\uD83D\uDE00\uD83D\uDE00\uD83D\uDE00\uD83D\uDE00\uD83D\uDE00\uD83D\uDE00\uD83D\uDE00\uD83D\uDE00\uD83D\uDE00\uD83D\uDE00\uD83D\uDE00\uD83D\uDE00\uD83D\uDE00", PasswordPolicy.Options()), "password case 11")
    eq(PasswordPolicy.Result(false, listOf("repetitive")), PasswordPolicy.checkPassword("ABCD-upper-sequence-x", PasswordPolicy.Options()), "password case 12")
    throwsIae("password minLength 0") { PasswordPolicy.checkPassword("x", PasswordPolicy.Options(minLength = 0)) }
    throwsIae("password max < min") { PasswordPolicy.checkPassword("x", PasswordPolicy.Options(minLength = 10, maxLength = 9)) }

    println("PasswordPolicyTest: $passed passed, $failed failed")
    if (failed > 0) exitProcess(1)
}
