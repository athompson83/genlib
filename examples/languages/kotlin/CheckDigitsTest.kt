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
    val luhn = listOf("4539 1488 0343 6467" to true, "79927398713" to true, "79927398710" to false, "0" to false, "4539-1488-0343-6468" to false, "12a4" to false, "" to false)
    for ((s, want) in luhn) eq(want, CheckDigits.luhnValid(s), "luhn $s")
    eq("3", CheckDigits.luhnCheckDigit("7992739871"), "luhn check digit 7992739871")
    eq("7", CheckDigits.luhnCheckDigit("453914880343646"), "luhn check digit 453914880343646")
    throwsIae("luhn check digit non-digit") { CheckDigits.luhnCheckDigit("12a") }
    throwsIae("luhn check digit empty") { CheckDigits.luhnCheckDigit("") }
    val iban = listOf("GB82 WEST 1234 5698 7654 32" to true, "DE89 3704 0044 0532 0130 00" to true, "gb82west12345698765432" to true, "GB82 WEST 1234 5698 7654 33" to false, "GB82-WEST" to false, "NO9386011117947" to true, "XX00" to false)
    for ((s, want) in iban) eq(want, CheckDigits.ibanValid(s), "iban $s")
    eq("GB82 WEST 1234 5698 7654 32", CheckDigits.ibanFormat("gb82west12345698765432"), "iban format GB")
    eq("NO93 8601 1117 947", CheckDigits.ibanFormat("NO9386011117947"), "iban format NO")
    throwsIae("iban format invalid") { CheckDigits.ibanFormat("GB82 WEST 1234 5698 7654 33") }
    val gtin = listOf("4006381333931" to true, "036000291452" to true, "96385074" to true, "10614141000415" to true, "4006381333932" to false, "12345" to false)
    for ((s, want) in gtin) eq(want, CheckDigits.gtinValid(s), "gtin $s")
    val isbn10 = listOf("0-306-40615-2" to true, "0-8044-2957-X" to true, "0-306-40615-3" to false, "030640615" to false)
    for ((s, want) in isbn10) eq(want, CheckDigits.isbn10Valid(s), "isbn10 $s")
    val isbn13 = listOf("978-0-306-40615-7" to true, "979-10-90636-07-1" to true, "978-0-306-40615-8" to false, "4006381333931" to false)
    for ((s, want) in isbn13) eq(want, CheckDigits.isbn13Valid(s), "isbn13 $s")
    eq("9780306406157", CheckDigits.isbn10To13("0-306-40615-2"), "isbn10 to 13 a")
    eq("9780804429573", CheckDigits.isbn10To13("080442957X"), "isbn10 to 13 X")
    throwsIae("isbn10 to 13 invalid") { CheckDigits.isbn10To13("0-306-40615-3") }

    println("CheckDigitsTest: $passed passed, $failed failed")
    if (failed > 0) exitProcess(1)
}
