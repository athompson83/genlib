// SPDX-License-Identifier: Apache-2.0
import java.math.BigDecimal;
import java.math.BigInteger;
import java.math.RoundingMode;
import java.util.HashMap;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/** Money in integer minor units: exact parsing, formatting, banker's rounding and allocation. */
public final class Money {
    private static final Map<String, Integer> EXPONENTS = new HashMap<>();
    private static final Pattern DECIMAL = Pattern.compile("(-?)([0-9]+)(?:\\.([0-9]+))?");

    static {
        for (String c : "USD EUR GBP CAD AUD CHF CNY INR MXN BRL SEK NOK DKK NZD SGD HKD ZAR".split(" ")) EXPONENTS.put(c, 2);
        for (String c : "JPY KRW VND CLP ISK".split(" ")) EXPONENTS.put(c, 0);
        for (String c : "BHD KWD JOD OMR TND".split(" ")) EXPONENTS.put(c, 3);
    }

    private Money() {}

    /** ISO 4217 minor-unit exponent for a supported currency code. */
    public static int exponent(String currency) {
        Integer e = currency == null ? null : EXPONENTS.get(currency);
        if (e == null) throw new IllegalArgumentException("unsupported currency: " + currency);
        return e;
    }

    private static long exact(BigInteger value) {
        try { return value.longValueExact(); }
        catch (ArithmeticException e) { throw new IllegalArgumentException("amount out of 64-bit range", e); }
    }

    private static Matcher decimal(String text, String what) {
        Matcher m = text == null ? null : DECIMAL.matcher(text);
        if (m == null || !m.matches()) throw new IllegalArgumentException(what + " must match -?DIGITS(.DIGITS)?: " + text);
        return m;
    }

    /** Parses a decimal amount into minor units; more fraction digits than the currency allows throws. */
    public static long toMinor(String amount, String currency) {
        int exp = exponent(currency);
        Matcher m = decimal(amount, "amount");
        String frac = m.group(3) == null ? "" : m.group(3);
        if (frac.length() > exp) throw new IllegalArgumentException(currency + " allows at most " + exp + " fraction digits: " + amount);
        BigInteger v = new BigInteger(m.group(2) + frac + "0".repeat(exp - frac.length()));
        return exact(m.group(1).isEmpty() ? v : v.negate());
    }

    /** Formats minor units as a plain decimal with the currency's fraction digits. */
    public static String formatMinor(long minor, String currency) {
        int exp = exponent(currency);
        String digits = BigInteger.valueOf(minor).abs().toString();
        String sign = minor < 0 ? "-" : "";
        if (exp == 0) return sign + digits;
        if (digits.length() <= exp) digits = "0".repeat(exp - digits.length() + 1) + digits;
        int cut = digits.length() - exp;
        return sign + digits.substring(0, cut) + "." + digits.substring(cut);
    }

    /** Multiplies by a decimal rate (at most 9 fraction digits), rounding the exact product half to even. */
    public static long applyRate(long minor, String rate) {
        Matcher m = decimal(rate, "rate");
        String frac = m.group(3) == null ? "" : m.group(3);
        if (frac.length() > 9) throw new IllegalArgumentException("rate allows at most 9 fraction digits: " + rate);
        BigInteger r = new BigInteger(m.group(2) + frac);
        if (!m.group(1).isEmpty()) r = r.negate();
        BigDecimal product = new BigDecimal(BigInteger.valueOf(minor).multiply(r), frac.length());
        return exact(product.setScale(0, RoundingMode.HALF_EVEN).unscaledValue());
    }

    /**
     * Splits total by non-negative integer ratios with the largest-remainder method: shares are
     * floor(|total| * r / sum) and leftover units go one each to the entries with the largest remainder
     * (|total| * r mod sum), ties to the lower index. Negative totals are allocated by magnitude and negated.
     * The result sums to total.
     */
    public static long[] allocate(long total, int[] ratios) {
        if (ratios == null || ratios.length == 0) throw new IllegalArgumentException("ratios must not be empty");
        BigInteger sum = BigInteger.ZERO;
        for (int r : ratios) {
            if (r < 0) throw new IllegalArgumentException("ratios must be non-negative");
            sum = sum.add(BigInteger.valueOf(r));
        }
        if (sum.signum() == 0) throw new IllegalArgumentException("ratios must have a positive sum");
        BigInteger abs = BigInteger.valueOf(total).abs();
        BigInteger[] shares = new BigInteger[ratios.length];
        BigInteger[] remainders = new BigInteger[ratios.length];
        BigInteger left = abs;
        for (int i = 0; i < ratios.length; i++) {
            BigInteger[] qr = abs.multiply(BigInteger.valueOf(ratios[i])).divideAndRemainder(sum);
            shares[i] = qr[0];
            remainders[i] = qr[1];
            left = left.subtract(shares[i]);
        }
        Integer[] order = new Integer[ratios.length];
        for (int i = 0; i < order.length; i++) order[i] = i;
        java.util.Arrays.sort(order, (a, b) -> remainders[b].compareTo(remainders[a])); // stable: ties keep lower index first
        for (int k = 0; left.signum() > 0; k++, left = left.subtract(BigInteger.ONE))
            shares[order[k]] = shares[order[k]].add(BigInteger.ONE);
        long[] out = new long[ratios.length];
        for (int i = 0; i < out.length; i++) out[i] = exact(total < 0 ? shares[i].negate() : shares[i]);
        return out;
    }
}
