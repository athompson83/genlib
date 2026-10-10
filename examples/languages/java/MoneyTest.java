// SPDX-License-Identifier: Apache-2.0
import java.util.Arrays;

public final class MoneyTest {
    private static int passed;
    private static int failed;

    private static void check(boolean ok, String name) {
        if (ok) passed++; else { failed++; System.err.println("FAIL: " + name); }
    }

    private static void eq(Object expected, Object actual, String name) {
        check(expected.equals(actual), name + " expected <" + expected + "> got <" + actual + ">");
    }

    private static void throwsIae(Runnable r, String name) {
        try { r.run(); check(false, name + " did not throw"); }
        catch (IllegalArgumentException e) { check(true, name); }
    }

    private static void eqArr(long[] expected, long[] actual, String name) {
        check(Arrays.equals(expected, actual), name + " expected " + Arrays.toString(expected) + " got " + Arrays.toString(actual));
    }

    public static void main(String[] args) {
        eq(1234L, Money.toMinor("12.34", "USD"), "toMinor 12.34 USD");
        eq(-50L, Money.toMinor("-0.5", "USD"), "toMinor -0.5 USD");
        eq(1000L, Money.toMinor("1000", "JPY"), "toMinor 1000 JPY");
        eq(1234L, Money.toMinor("1.234", "BHD"), "toMinor 1.234 BHD");
        eq(700L, Money.toMinor("7", "USD"), "toMinor 7 USD");
        throwsIae(() -> Money.toMinor("1.5", "JPY"), "toMinor JPY fraction");
        throwsIae(() -> Money.toMinor("12.345", "USD"), "toMinor too many digits");
        throwsIae(() -> Money.toMinor("1,000.00", "USD"), "toMinor grouping");
        throwsIae(() -> Money.toMinor(".5", "USD"), "toMinor missing integer part");
        throwsIae(() -> Money.toMinor("5.", "USD"), "toMinor missing fraction digits");
        throwsIae(() -> Money.toMinor("1e3", "USD"), "toMinor exponent");
        throwsIae(() -> Money.toMinor(" 1", "USD"), "toMinor space");
        throwsIae(() -> Money.toMinor("+1", "USD"), "toMinor plus");
        throwsIae(() -> Money.toMinor("12", "XXX"), "toMinor unknown currency");
        throwsIae(() -> Money.toMinor("12", "usd"), "toMinor lowercase currency");
        throwsIae(() -> Money.toMinor("99999999999999999999", "USD"), "toMinor overflow");

        eq("12.34", Money.formatMinor(1234, "USD"), "format 1234 USD");
        eq("-0.05", Money.formatMinor(-5, "USD"), "format -5 USD");
        eq("500", Money.formatMinor(500, "JPY"), "format 500 JPY");
        eq("0.001", Money.formatMinor(1, "BHD"), "format 1 BHD");
        eq("0.00", Money.formatMinor(0, "EUR"), "format 0 EUR");
        eq("-92233720368547758.08", Money.formatMinor(Long.MIN_VALUE, "USD"), "format Long.MIN_VALUE");

        eq(165L, Money.applyRate(1999, "0.0825"), "applyRate r1");
        eq(12L, Money.applyRate(25, "0.5"), "applyRate r2 half to even down");
        eq(18L, Money.applyRate(35, "0.5"), "applyRate r3 half to even up");
        eq(-12L, Money.applyRate(-25, "0.5"), "applyRate r4 negative");
        eq(1070L, Money.applyRate(1000, "1.07"), "applyRate r5");
        throwsIae(() -> Money.applyRate(1, "0.1234567890"), "applyRate 10 fraction digits");
        throwsIae(() -> Money.applyRate(1, "1e2"), "applyRate exponent");
        throwsIae(() -> Money.applyRate(Long.MAX_VALUE, "2"), "applyRate overflow");

        eqArr(new long[] {34, 33, 33}, Money.allocate(100, new int[] {1, 1, 1}), "allocate a1");
        eqArr(new long[] {2, 3}, Money.allocate(5, new int[] {3, 7}), "allocate a2");
        eqArr(new long[] {-34, -33, -33}, Money.allocate(-100, new int[] {1, 1, 1}), "allocate a3");
        eqArr(new long[] {0, 1000}, Money.allocate(1000, new int[] {0, 1}), "allocate a4");
        eqArr(new long[] {0, 1}, Money.allocate(1, new int[] {3, 7}), "allocate a5");
        eqArr(new long[] {0, 1, 0}, Money.allocate(1, new int[] {0, 1, 1}), "allocate a6");
        eqArr(new long[] {1, 9}, Money.allocate(10, new int[] {1, 8}), "allocate a7");
        throwsIae(() -> Money.allocate(1, new int[] {}), "allocate empty");
        throwsIae(() -> Money.allocate(1, new int[] {0, 0}), "allocate zero sum");
        throwsIae(() -> Money.allocate(1, new int[] {1, -1}), "allocate negative ratio");

        System.out.println("MoneyTest: " + passed + " passed, " + failed + " failed");
        if (failed > 0) System.exit(1);
    }
}
