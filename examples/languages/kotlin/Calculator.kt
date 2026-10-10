// SPDX-License-Identifier: Apache-2.0
import java.math.BigDecimal
import java.math.MathContext
import java.math.RoundingMode
import kotlin.math.pow

/** Safe arithmetic expression evaluation (no eval or reflection) and loan/interest finance math. */
object Calculator {
    const val MAX_LENGTH = 1000

    class CalculatorException(message: String) : IllegalArgumentException(message)

    data class Row(val period: Int, val payment: Double, val interest: Double, val principal: Double, val balance: Double)

    fun evaluate(expression: String, variables: Map<String, Double> = emptyMap()): Double {
        if (expression.isBlank()) throw CalculatorException("empty expression")
        if (expression.length > MAX_LENGTH) throw CalculatorException("expression longer than $MAX_LENGTH characters")
        val parser = Parser(expression, variables)
        val result = parser.expression()
        parser.skipSpaces()
        if (parser.pos < expression.length) {
            throw CalculatorException(if (expression[parser.pos] == ')') "mismatched parentheses" else "unexpected token at position ${parser.pos}")
        }
        return result
    }

    private class Parser(private val s: String, private val vars: Map<String, Double>) {
        var pos = 0

        fun skipSpaces() { while (pos < s.length && s[pos].isWhitespace()) pos++ }

        private fun eat(c: Char): Boolean {
            skipSpaces()
            if (pos < s.length && s[pos] == c) { pos++; return true }
            return false
        }

        fun expression(): Double {
            var value = term()
            while (true) {
                value = when {
                    eat('+') -> finite(value + term())
                    eat('-') -> finite(value - term())
                    else -> return value
                }
            }
        }

        private fun term(): Double {
            var value = unary()
            while (true) {
                value = when {
                    eat('*') -> finite(value * unary())
                    eat('/') -> unary().let { if (it == 0.0) throw CalculatorException("division by zero"); finite(value / it) }
                    eat('%') -> unary().let { if (it == 0.0) throw CalculatorException("remainder by zero"); finite(value % it) }
                    else -> return value
                }
            }
        }

        private fun unary(): Double = when {
            eat('-') -> -unary()
            eat('+') -> unary()
            else -> power()
        }

        private fun power(): Double {
            val base = primary()
            return if (eat('^')) finite(base.pow(unary())) else base
        }

        private fun primary(): Double {
            skipSpaces()
            if (pos >= s.length) throw CalculatorException("unexpected end of expression")
            val c = s[pos]
            return when {
                c == '(' -> {
                    pos++
                    val value = expression()
                    if (!eat(')')) throw CalculatorException("mismatched parentheses")
                    value
                }
                c in '0'..'9' -> number()
                c == '_' || c in 'A'..'Z' || c in 'a'..'z' -> {
                    val start = pos
                    while (pos < s.length && isIdentPart(s[pos])) pos++
                    val name = s.substring(start, pos)
                    finite(vars[name] ?: throw CalculatorException("unknown identifier: $name"))
                }
                else -> throw CalculatorException("unexpected token at position $pos")
            }
        }

        private fun number(): Double {
            val start = pos
            skipDigits()
            if (pos < s.length && s[pos] == '.') {
                pos++
                if (pos >= s.length || s[pos] !in '0'..'9') throw CalculatorException("malformed number")
                skipDigits()
            }
            if (pos < s.length && (s[pos] == 'e' || s[pos] == 'E')) {
                pos++
                if (pos < s.length && (s[pos] == '+' || s[pos] == '-')) pos++
                if (pos >= s.length || s[pos] !in '0'..'9') throw CalculatorException("malformed exponent")
                skipDigits()
            }
            if (pos < s.length && (s[pos] == '.' || isIdentPart(s[pos]))) throw CalculatorException("malformed number")
            return finite(s.substring(start, pos).toDouble())
        }

        private fun skipDigits() { while (pos < s.length && s[pos] in '0'..'9') pos++ }

        private fun isIdentPart(c: Char) = c == '_' || c in '0'..'9' || c in 'A'..'Z' || c in 'a'..'z'

        private fun finite(v: Double): Double {
            if (!v.isFinite()) throw CalculatorException("non-finite result")
            return v
        }
    }

    fun loanPayment(principal: Double, annualRatePercent: Double, months: Int): Double =
        payment(money(principal), annualRatePercent, months).toDouble()

    fun amortizationSchedule(principal: Double, annualRatePercent: Double, months: Int): List<Row> {
        var balance = money(principal)
        val payment = payment(balance, annualRatePercent, months)
        val monthlyRate = BigDecimal.valueOf(annualRatePercent).divide(BigDecimal.valueOf(1200), MathContext.DECIMAL128)
        return (1..months).map { period ->
            val interest = round(balance.multiply(monthlyRate))
            var principalPart = payment.subtract(interest)
            var rowPayment = payment
            if (period == months || principalPart > balance) {
                principalPart = balance
                rowPayment = interest.add(principalPart)
            }
            balance = balance.subtract(principalPart)
            Row(period, rowPayment.toDouble(), interest.toDouble(), principalPart.toDouble(), balance.toDouble())
        }
    }

    fun compoundInterest(principal: Double, annualRatePercent: Double, compoundsPerYear: Int, years: Double): Double {
        require(principal.isFinite() && annualRatePercent.isFinite() && years.isFinite() &&
            principal >= 0 && annualRatePercent >= 0 && years >= 0 && compoundsPerYear >= 1) { "invalid compound interest inputs" }
        val amount = principal * (1 + annualRatePercent / 100.0 / compoundsPerYear).pow(compoundsPerYear * years)
        require(amount.isFinite()) { "non-finite result" }
        return round(BigDecimal.valueOf(amount)).toDouble()
    }

    private fun payment(principal: BigDecimal, annualRatePercent: Double, months: Int): BigDecimal {
        require(months >= 1) { "months must be positive" }
        require(annualRatePercent.isFinite() && annualRatePercent >= 0) { "rate must be a finite non-negative number" }
        if (annualRatePercent == 0.0) return round(principal.divide(BigDecimal.valueOf(months.toLong()), MathContext.DECIMAL128))
        val r = annualRatePercent / 100.0 / 12.0
        return round(BigDecimal.valueOf(principal.toDouble() * r / (1 - (1 + r).pow(-months))))
    }

    private fun money(amount: Double): BigDecimal {
        require(amount.isFinite() && amount >= 0) { "principal must be a finite non-negative number" }
        return round(BigDecimal.valueOf(amount))
    }

    /** Two decimals, half away from zero (BigDecimal HALF_UP rounds away from zero on ties). */
    private fun round(value: BigDecimal): BigDecimal = value.setScale(2, RoundingMode.HALF_UP)
}
