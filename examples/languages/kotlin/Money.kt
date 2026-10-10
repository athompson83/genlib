// SPDX-License-Identifier: Apache-2.0
import java.math.BigDecimal
import java.math.BigInteger
import java.math.RoundingMode

/** Money in integer minor units: exact parsing, formatting, banker's rounding and allocation. */
object Money {
    private val EXPONENTS: Map<String, Int> = buildMap {
        "USD EUR GBP CAD AUD CHF CNY INR MXN BRL SEK NOK DKK NZD SGD HKD ZAR".split(" ").forEach { put(it, 2) }
        "JPY KRW VND CLP ISK".split(" ").forEach { put(it, 0) }
        "BHD KWD JOD OMR TND".split(" ").forEach { put(it, 3) }
    }
    private val DECIMAL = Regex("(-?)([0-9]+)(?:\\.([0-9]+))?")

    /** ISO 4217 minor-unit exponent for a supported currency code. */
    fun exponent(currency: String): Int = EXPONENTS[currency] ?: throw IllegalArgumentException("unsupported currency: $currency")

    private fun exact(value: BigInteger): Long = try {
        value.longValueExact()
    } catch (e: ArithmeticException) {
        throw IllegalArgumentException("amount out of 64-bit range", e)
    }

    private fun decimal(text: String, what: String): MatchResult =
        DECIMAL.matchEntire(text) ?: throw IllegalArgumentException("$what must match -?DIGITS(.DIGITS)?: $text")

    /** Parses a decimal amount into minor units; more fraction digits than the currency allows throws. */
    fun toMinor(amount: String, currency: String): Long {
        val exp = exponent(currency)
        val (sign, whole, frac) = decimal(amount, "amount").destructured
        require(frac.length <= exp) { "$currency allows at most $exp fraction digits: $amount" }
        val v = BigInteger(whole + frac + "0".repeat(exp - frac.length))
        return exact(if (sign.isEmpty()) v else v.negate())
    }

    /** Formats minor units as a plain decimal with the currency's fraction digits. */
    fun formatMinor(minor: Long, currency: String): String {
        val exp = exponent(currency)
        var digits = BigInteger.valueOf(minor).abs().toString()
        val sign = if (minor < 0) "-" else ""
        if (exp == 0) return sign + digits
        if (digits.length <= exp) digits = "0".repeat(exp - digits.length + 1) + digits
        val cut = digits.length - exp
        return sign + digits.substring(0, cut) + "." + digits.substring(cut)
    }

    /** Multiplies by a decimal rate (at most 9 fraction digits), rounding the exact product half to even. */
    fun applyRate(minor: Long, rate: String): Long {
        val (sign, whole, frac) = decimal(rate, "rate").destructured
        require(frac.length <= 9) { "rate allows at most 9 fraction digits: $rate" }
        var r = BigInteger(whole + frac)
        if (sign.isNotEmpty()) r = r.negate()
        val product = BigDecimal(BigInteger.valueOf(minor).multiply(r), frac.length)
        return exact(product.setScale(0, RoundingMode.HALF_EVEN).unscaledValue())
    }

    /**
     * Splits [total] by non-negative integer ratios with the largest-remainder method: shares are
     * floor(|total| * r / sum) and leftover units go one each to the entries with the largest remainder
     * (|total| * r mod sum), ties to the lower index. Negative totals are allocated by magnitude and negated.
     * The result sums to total.
     */
    fun allocate(total: Long, ratios: List<Int>): List<Long> {
        require(ratios.isNotEmpty()) { "ratios must not be empty" }
        require(ratios.all { it >= 0 }) { "ratios must be non-negative" }
        val sum = ratios.fold(BigInteger.ZERO) { acc, r -> acc + BigInteger.valueOf(r.toLong()) }
        require(sum.signum() > 0) { "ratios must have a positive sum" }
        val abs = BigInteger.valueOf(total).abs()
        val shares = ratios.map { abs * BigInteger.valueOf(it.toLong()) / sum }.toMutableList()
        val remainders = ratios.map { abs * BigInteger.valueOf(it.toLong()) % sum }
        val left = shares.fold(abs) { acc, s -> acc - s }.toInt() // left < ratios.size
        // sortedByDescending is stable, so equal remainders keep the lower index first.
        for (i in ratios.indices.sortedByDescending { remainders[it] }.take(left)) shares[i] = shares[i] + BigInteger.ONE
        return shares.map { exact(if (total < 0) it.negate() else it) }
    }
}
