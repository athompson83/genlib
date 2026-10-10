// SPDX-License-Identifier: Apache-2.0
import java.math.BigDecimal;
import java.math.MathContext;
import java.math.RoundingMode;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Map;

/** Safe arithmetic expression evaluation (no eval or reflection) and loan/interest finance math. */
public final class Calculator {
    public static final int MAX_LENGTH = 1000;

    private Calculator() {}

    public static final class CalculatorException extends IllegalArgumentException {
        private static final long serialVersionUID = 1L;

        public CalculatorException(String message) { super(message); }
    }

    public record Row(int period, double payment, double interest, double principal, double balance) {}

    public static double evaluate(String expression) { return evaluate(expression, Collections.emptyMap()); }

    public static double evaluate(String expression, Map<String, Double> variables) {
        if (expression == null || expression.isBlank()) throw new CalculatorException("empty expression");
        if (expression.length() > MAX_LENGTH) throw new CalculatorException("expression longer than " + MAX_LENGTH + " characters");
        Parser parser = new Parser(expression, variables == null ? Collections.emptyMap() : variables);
        double result = parser.expression();
        parser.skipSpaces();
        if (parser.pos < expression.length()) {
            throw new CalculatorException(expression.charAt(parser.pos) == ')'
                    ? "mismatched parentheses" : "unexpected token at position " + parser.pos);
        }
        return result;
    }

    private static final class Parser {
        private final String s;
        private final Map<String, Double> vars;
        private int pos;

        Parser(String s, Map<String, Double> vars) { this.s = s; this.vars = vars; }

        void skipSpaces() { while (pos < s.length() && Character.isWhitespace(s.charAt(pos))) pos++; }

        boolean eat(char c) {
            skipSpaces();
            if (pos < s.length() && s.charAt(pos) == c) { pos++; return true; }
            return false;
        }

        double expression() {
            double value = term();
            while (true) {
                if (eat('+')) value = finite(value + term());
                else if (eat('-')) value = finite(value - term());
                else return value;
            }
        }

        double term() {
            double value = unary();
            while (true) {
                if (eat('*')) value = finite(value * unary());
                else if (eat('/')) {
                    double d = unary();
                    if (d == 0) throw new CalculatorException("division by zero");
                    value = finite(value / d);
                } else if (eat('%')) {
                    double d = unary();
                    if (d == 0) throw new CalculatorException("remainder by zero");
                    value = finite(value % d);
                } else return value;
            }
        }

        double unary() {
            if (eat('-')) return -unary();
            if (eat('+')) return unary();
            return power();
        }

        double power() {
            double base = primary();
            if (eat('^')) return finite(Math.pow(base, unary()));
            return base;
        }

        double primary() {
            skipSpaces();
            if (pos >= s.length()) throw new CalculatorException("unexpected end of expression");
            char c = s.charAt(pos);
            if (c == '(') {
                pos++;
                double value = expression();
                if (!eat(')')) throw new CalculatorException("mismatched parentheses");
                return value;
            }
            if (c >= '0' && c <= '9') return number();
            if (c == '_' || c >= 'A' && c <= 'Z' || c >= 'a' && c <= 'z') {
                int start = pos;
                while (pos < s.length() && isIdentPart(s.charAt(pos))) pos++;
                String name = s.substring(start, pos);
                Double value = vars.get(name);
                if (value == null) throw new CalculatorException("unknown identifier: " + name);
                return finite(value);
            }
            throw new CalculatorException("unexpected token at position " + pos);
        }

        double number() {
            int start = pos;
            while (pos < s.length() && isDigit(s.charAt(pos))) pos++;
            if (pos < s.length() && s.charAt(pos) == '.') {
                pos++;
                if (pos >= s.length() || !isDigit(s.charAt(pos))) throw new CalculatorException("malformed number");
                while (pos < s.length() && isDigit(s.charAt(pos))) pos++;
            }
            if (pos < s.length() && (s.charAt(pos) == 'e' || s.charAt(pos) == 'E')) {
                pos++;
                if (pos < s.length() && (s.charAt(pos) == '+' || s.charAt(pos) == '-')) pos++;
                if (pos >= s.length() || !isDigit(s.charAt(pos))) throw new CalculatorException("malformed exponent");
                while (pos < s.length() && isDigit(s.charAt(pos))) pos++;
            }
            if (pos < s.length() && (s.charAt(pos) == '.' || isIdentPart(s.charAt(pos))))
                throw new CalculatorException("malformed number");
            return finite(Double.parseDouble(s.substring(start, pos)));
        }

        private static boolean isDigit(char c) { return c >= '0' && c <= '9'; }

        private static boolean isIdentPart(char c) {
            return c == '_' || isDigit(c) || c >= 'A' && c <= 'Z' || c >= 'a' && c <= 'z';
        }

        private static double finite(double v) {
            if (!Double.isFinite(v)) throw new CalculatorException("non-finite result");
            return v;
        }
    }

    public static double loanPayment(double principal, double annualRatePercent, int months) {
        return payment(money(principal), annualRatePercent, months).doubleValue();
    }

    public static List<Row> amortizationSchedule(double principal, double annualRatePercent, int months) {
        BigDecimal balance = money(principal);
        BigDecimal payment = payment(balance, annualRatePercent, months);
        BigDecimal monthlyRate = BigDecimal.valueOf(annualRatePercent).divide(BigDecimal.valueOf(1200), MathContext.DECIMAL128);
        List<Row> rows = new ArrayList<>(months);
        for (int period = 1; period <= months; period++) {
            BigDecimal interest = round(balance.multiply(monthlyRate));
            BigDecimal principalPart = payment.subtract(interest);
            BigDecimal rowPayment = payment;
            if (period == months || principalPart.compareTo(balance) > 0) {
                principalPart = balance;
                rowPayment = interest.add(principalPart);
            }
            balance = balance.subtract(principalPart);
            rows.add(new Row(period, rowPayment.doubleValue(), interest.doubleValue(), principalPart.doubleValue(),
                    balance.doubleValue()));
        }
        return rows;
    }

    public static double compoundInterest(double principal, double annualRatePercent, int compoundsPerYear, double years) {
        if (!Double.isFinite(principal) || !Double.isFinite(annualRatePercent) || !Double.isFinite(years)
                || principal < 0 || annualRatePercent < 0 || years < 0 || compoundsPerYear < 1)
            throw new IllegalArgumentException("invalid compound interest inputs");
        double amount = principal * Math.pow(1 + annualRatePercent / 100.0 / compoundsPerYear, compoundsPerYear * years);
        if (!Double.isFinite(amount)) throw new IllegalArgumentException("non-finite result");
        return round(BigDecimal.valueOf(amount)).doubleValue();
    }

    private static BigDecimal payment(BigDecimal principal, double annualRatePercent, int months) {
        if (months < 1) throw new IllegalArgumentException("months must be positive");
        if (!Double.isFinite(annualRatePercent) || annualRatePercent < 0)
            throw new IllegalArgumentException("rate must be a finite non-negative number");
        if (annualRatePercent == 0) return round(principal.divide(BigDecimal.valueOf(months), MathContext.DECIMAL128));
        double r = annualRatePercent / 100.0 / 12.0;
        double p = principal.doubleValue() * r / (1 - Math.pow(1 + r, -months));
        return round(BigDecimal.valueOf(p));
    }

    private static BigDecimal money(double amount) {
        if (!Double.isFinite(amount) || amount < 0) throw new IllegalArgumentException("principal must be a finite non-negative number");
        return round(BigDecimal.valueOf(amount));
    }

    /** Two decimals, half away from zero (BigDecimal HALF_UP rounds away from zero on ties). */
    private static BigDecimal round(BigDecimal value) { return value.setScale(2, RoundingMode.HALF_UP); }
}
