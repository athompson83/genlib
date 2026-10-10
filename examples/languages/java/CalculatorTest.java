// SPDX-License-Identifier: Apache-2.0
import java.math.BigDecimal;
import java.util.List;
import java.util.Map;

public final class CalculatorTest {
    private static int passed;
    private static int failed;

    private static void check(boolean ok, String name) {
        if (ok) passed++; else { failed++; System.err.println("FAIL: " + name); }
    }

    private static void eq(double expected, double actual, String name) {
        check(Math.abs(expected - actual) < 1e-9, name + " expected <" + expected + "> got <" + actual + ">");
    }

    private static void throwsIae(Runnable r, String name) {
        try { r.run(); check(false, name + " did not throw"); }
        catch (IllegalArgumentException e) { check(true, name); }
    }

    public static void main(String[] args) {
        eq(14, Calculator.evaluate("2 + 3 * 4"), "precedence");
        eq(20, Calculator.evaluate("(2+3)*4"), "parentheses");
        eq(512, Calculator.evaluate("2^3^2"), "right-associative power");
        eq(-4, Calculator.evaluate("-2^2"), "unary minus looser than power");
        eq(2, Calculator.evaluate("10 % 4"), "remainder");
        eq(-1, Calculator.evaluate("-7 % 3"), "remainder sign of dividend");
        eq(50, Calculator.evaluate("1.5e2 / 3"), "exponent literal");
        eq(6.5, Calculator.evaluate("a*2+b", Map.of("a", 3.0, "b", 0.5)), "variables");
        for (String bad : new String[]{"1/0", "2 % 0", "(1+2", "1+", "x+1", "", "1 + 2)", "2^99999", "1..2", "2e"}) {
            throwsIae(() -> Calculator.evaluate(bad), "rejects \"" + bad + "\"");
        }
        throwsIae(() -> Calculator.evaluate("1+".repeat(500) + "1"), "rejects input over 1000 chars");

        eq(1199.10, Calculator.loanPayment(200000, 6, 360), "loan payment 30y");
        eq(1000.00, Calculator.loanPayment(10000, 0, 10), "loan payment zero rate");
        eq(88.85, Calculator.loanPayment(1000, 12, 12), "loan payment 1y");

        List<Calculator.Row> rows = Calculator.amortizationSchedule(1000, 12, 12);
        check(rows.size() == 12, "schedule has 12 rows");
        Calculator.Row first = rows.get(0);
        eq(10.00, first.interest(), "row 1 interest");
        eq(78.85, first.principal(), "row 1 principal");
        eq(921.15, first.balance(), "row 1 balance");
        eq(0.00, rows.get(11).balance(), "final balance zero");
        BigDecimal principalSum = BigDecimal.ZERO;
        for (Calculator.Row row : rows) principalSum = principalSum.add(BigDecimal.valueOf(row.principal()));
        check(principalSum.compareTo(new BigDecimal("1000.00")) == 0, "principal sums to 1000.00, got " + principalSum);

        eq(1647.01, Calculator.compoundInterest(1000, 5, 12, 10), "compound interest");

        System.out.println("CalculatorTest: " + passed + " passed, " + failed + " failed");
        if (failed > 0) System.exit(1);
    }
}
