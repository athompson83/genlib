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
    eq(1234L, Money.toMinor("12.34", "USD"), "toMinor 12.34 USD")
    eq(-50L, Money.toMinor("-0.5", "USD"), "toMinor -0.5 USD")
    eq(1000L, Money.toMinor("1000", "JPY"), "toMinor 1000 JPY")
    eq(1234L, Money.toMinor("1.234", "BHD"), "toMinor 1.234 BHD")
    eq(700L, Money.toMinor("7", "USD"), "toMinor 7 USD")
    for ((amount, currency) in listOf("1.5" to "JPY", "12.345" to "USD", "1,000.00" to "USD", ".5" to "USD", "5." to "USD",
        "1e3" to "USD", " 1" to "USD", "+1" to "USD", "12" to "XXX", "12" to "usd", "99999999999999999999" to "USD")) {
        throwsIae("toMinor rejects '$amount' $currency") { Money.toMinor(amount, currency) }
    }

    eq("12.34", Money.formatMinor(1234, "USD"), "format 1234 USD")
    eq("-0.05", Money.formatMinor(-5, "USD"), "format -5 USD")
    eq("500", Money.formatMinor(500, "JPY"), "format 500 JPY")
    eq("0.001", Money.formatMinor(1, "BHD"), "format 1 BHD")
    eq("0.00", Money.formatMinor(0, "EUR"), "format 0 EUR")
    eq("-92233720368547758.08", Money.formatMinor(Long.MIN_VALUE, "USD"), "format Long.MIN_VALUE")

    eq(165L, Money.applyRate(1999, "0.0825"), "applyRate r1")
    eq(12L, Money.applyRate(25, "0.5"), "applyRate r2 half to even down")
    eq(18L, Money.applyRate(35, "0.5"), "applyRate r3 half to even up")
    eq(-12L, Money.applyRate(-25, "0.5"), "applyRate r4 negative")
    eq(1070L, Money.applyRate(1000, "1.07"), "applyRate r5")
    throwsIae("applyRate 10 fraction digits") { Money.applyRate(1, "0.1234567890") }
    throwsIae("applyRate exponent") { Money.applyRate(1, "1e2") }
    throwsIae("applyRate overflow") { Money.applyRate(Long.MAX_VALUE, "2") }

    eq(listOf(34L, 33L, 33L), Money.allocate(100, listOf(1, 1, 1)), "allocate a1")
    eq(listOf(2L, 3L), Money.allocate(5, listOf(3, 7)), "allocate a2")
    eq(listOf(-34L, -33L, -33L), Money.allocate(-100, listOf(1, 1, 1)), "allocate a3")
    eq(listOf(0L, 1000L), Money.allocate(1000, listOf(0, 1)), "allocate a4")
    eq(listOf(0L, 1L), Money.allocate(1, listOf(3, 7)), "allocate a5")
    eq(listOf(0L, 1L, 0L), Money.allocate(1, listOf(0, 1, 1)), "allocate a6")
    eq(listOf(1L, 9L), Money.allocate(10, listOf(1, 8)), "allocate a7")
    throwsIae("allocate empty") { Money.allocate(1, emptyList()) }
    throwsIae("allocate zero sum") { Money.allocate(1, listOf(0, 0)) }
    throwsIae("allocate negative ratio") { Money.allocate(1, listOf(1, -1)) }

    println("MoneyTest: $passed passed, $failed failed")
    if (failed > 0) exitProcess(1)
}
