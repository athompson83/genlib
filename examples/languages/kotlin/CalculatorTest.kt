// SPDX-License-Identifier: Apache-2.0
import java.math.BigDecimal
import kotlin.math.abs
import kotlin.system.exitProcess

private var passed = 0
private var failed = 0

private fun check(ok: Boolean, name: String) {
    if (ok) passed++ else { failed++; System.err.println("FAIL: $name") }
}

private fun eq(expected: Double, actual: Double, name: String) =
    check(abs(expected - actual) < 1e-9, "$name expected <$expected> got <$actual>")

private fun throwsIae(name: String, block: () -> Unit) {
    try { block(); check(false, "$name did not throw") } catch (e: IllegalArgumentException) { check(true, name) }
}

fun main() {
    eq(14.0, Calculator.evaluate("2 + 3 * 4"), "precedence")
    eq(20.0, Calculator.evaluate("(2+3)*4"), "parentheses")
    eq(512.0, Calculator.evaluate("2^3^2"), "right-associative power")
    eq(-4.0, Calculator.evaluate("-2^2"), "unary minus looser than power")
    eq(2.0, Calculator.evaluate("10 % 4"), "remainder")
    eq(-1.0, Calculator.evaluate("-7 % 3"), "remainder sign of dividend")
    eq(50.0, Calculator.evaluate("1.5e2 / 3"), "exponent literal")
    eq(6.5, Calculator.evaluate("a*2+b", mapOf("a" to 3.0, "b" to 0.5)), "variables")
    for (bad in listOf("1/0", "2 % 0", "(1+2", "1+", "x+1", "", "1 + 2)", "2^99999", "1..2", "2e")) {
        throwsIae("rejects \"$bad\"") { Calculator.evaluate(bad) }
    }
    throwsIae("rejects input over 1000 chars") { Calculator.evaluate("1+".repeat(500) + "1") }

    eq(1199.10, Calculator.loanPayment(200000.0, 6.0, 360), "loan payment 30y")
    eq(1000.00, Calculator.loanPayment(10000.0, 0.0, 10), "loan payment zero rate")
    eq(88.85, Calculator.loanPayment(1000.0, 12.0, 12), "loan payment 1y")

    val rows = Calculator.amortizationSchedule(1000.0, 12.0, 12)
    check(rows.size == 12, "schedule has 12 rows")
    eq(10.00, rows[0].interest, "row 1 interest")
    eq(78.85, rows[0].principal, "row 1 principal")
    eq(921.15, rows[0].balance, "row 1 balance")
    eq(0.00, rows[11].balance, "final balance zero")
    val principalSum = rows.fold(BigDecimal.ZERO) { acc, row -> acc.add(BigDecimal.valueOf(row.principal)) }
    check(principalSum.compareTo(BigDecimal("1000.00")) == 0, "principal sums to 1000.00, got $principalSum")

    eq(1647.01, Calculator.compoundInterest(1000.0, 5.0, 12, 10.0), "compound interest")

    println("CalculatorTest: $passed passed, $failed failed")
    if (failed > 0) exitProcess(1)
}
