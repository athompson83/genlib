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
    val s1 = "12345678901234567890".toByteArray(Charsets.US_ASCII)
    val s256 = "12345678901234567890123456789012".toByteArray(Charsets.US_ASCII)
    val s512 = "1234567890123456789012345678901234567890123456789012345678901234".toByteArray(Charsets.US_ASCII)
    listOf("755224", "287082", "359152", "969429", "338314", "254676", "287922", "162583", "399871", "520489")
        .forEachIndexed { i, code -> eq(code, Totp.hotp(s1, i.toLong()), "RFC 4226 counter $i") }

    val vectors = listOf(
        59L to listOf("94287082", "46119246", "90693936"),
        1111111109L to listOf("07081804", "68084774", "25091201"),
        1111111111L to listOf("14050471", "67062674", "99943326"),
        1234567890L to listOf("89005924", "91819424", "93441116"),
        2000000000L to listOf("69279037", "90698825", "38618901"),
        20000000000L to listOf("65353130", "77737706", "47863826"),
    )
    for ((t, codes) in vectors) {
        eq(codes[0], Totp.totp(s1, t, digits = 8, algorithm = "SHA1"), "RFC 6238 SHA1 t=$t")
        eq(codes[1], Totp.totp(s256, t, digits = 8, algorithm = "SHA256"), "RFC 6238 SHA256 t=$t")
        eq(codes[2], Totp.totp(s512, t, digits = 8, algorithm = "SHA512"), "RFC 6238 SHA512 t=$t")
    }

    eq("MZXW6YTBOI", Totp.base32Encode("foobar".toByteArray()), "base32 encode")
    check(Totp.base32Decode("mzxw 6ytb-oi==").contentEquals("foobar".toByteArray()), "base32 decode lenient")
    throwsIae("base32 invalid char") { Totp.base32Decode("MZ1") }
    val random = Totp.generateSecret()
    eq(20, random.size, "generateSecret default length")
    check(Totp.base32Decode(Totp.base32Encode(random)).contentEquals(random), "base32 round trip")

    val code = Totp.totp(s1, 59, digits = 8)
    check(Totp.verifyTotp(code, s1, 59, digits = 8), "verify same step")
    check(Totp.verifyTotp(code, s1, 89, digits = 8), "verify next step within window")
    check(!Totp.verifyTotp(code, s1, 150, digits = 8), "verify outside window")
    check(!Totp.verifyTotp("abc", s1, 59, digits = 8), "verify non-digit")
    check(!Totp.verifyTotp("1234567", s1, 59, digits = 8), "verify wrong length")

    eq(
        "otpauth://totp/Acme%20Co:alice%40example.com?secret=JBSWY3DPEHPK3PXP&issuer=Acme%20Co&algorithm=SHA1&digits=6&period=30",
        Totp.otpauthUri("Acme Co", "alice@example.com", "JBSWY3DPEHPK3PXP"), "otpauth uri",
    )
    throwsIae("unsupported algorithm") { Totp.hotp(s1, 0, 6, "MD5") }

    println("TotpTest: $passed passed, $failed failed")
    if (failed > 0) exitProcess(1)
}
