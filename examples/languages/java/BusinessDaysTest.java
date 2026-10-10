// SPDX-License-Identifier: Apache-2.0

import java.util.List;

public final class BusinessDaysTest {
    private static int passed;
    private static int failed;

    private static void check(boolean ok, String name) {
        if (ok) passed++; else { failed++; System.err.println("FAIL: " + name); }
    }

    private static void eq(Object expected, Object actual, String name) {
        check(java.util.Objects.equals(expected, actual), name + " expected <" + expected + "> got <" + actual + ">");
    }

    private static void near(double expected, double actual, double tol, String name) {
        check(Math.abs(expected - actual) <= tol, name + " expected <" + expected + "> got <" + actual + ">");
    }

    private static void nearAll(double[] expected, double[] actual, double tol, String name) {
        check(expected.length == actual.length, name + " length");
        for (int i = 0; i < Math.min(expected.length, actual.length); i++) near(expected[i], actual[i], tol, name + "[" + i + "]");
    }

    private static void throwsIae(Runnable r, String name) {
        try { r.run(); check(false, name + " did not throw"); }
        catch (IllegalArgumentException e) { check(true, name); }
    }

    public static void main(String[] args) {
        eq(false, BusinessDays.isBusinessDay("2026-10-10", List.of(), List.of("SA", "SU")), "is 0");
        eq(true, BusinessDays.isBusinessDay("2026-10-12", List.of(), List.of("SA", "SU")), "is 1");
        eq(false, BusinessDays.isBusinessDay("2026-12-25", List.of("2026-12-25", "2026-12-28", "2027-01-01"), List.of("SA", "SU")), "is 2");
        eq(false, BusinessDays.isBusinessDay("2026-10-16", List.of(), List.of("FR", "SA")), "is 3");
        eq("2026-10-12", BusinessDays.addBusinessDays("2026-10-09", 1, List.of(), List.of("SA", "SU")), "add 0");
        eq("2026-10-09", BusinessDays.addBusinessDays("2026-10-12", -1, List.of(), List.of("SA", "SU")), "add 1");
        eq("2026-10-12", BusinessDays.addBusinessDays("2026-10-10", 0, List.of(), List.of("SA", "SU")), "add 2");
        eq("2026-10-12", BusinessDays.addBusinessDays("2026-10-12", 0, List.of(), List.of("SA", "SU")), "add 3");
        eq("2026-12-30", BusinessDays.addBusinessDays("2026-12-23", 3, List.of("2026-12-25", "2026-12-28", "2027-01-01"), List.of("SA", "SU")), "add 4");
        eq("2026-12-22", BusinessDays.addBusinessDays("2026-12-31", -5, List.of("2026-12-25", "2026-12-28", "2027-01-01"), List.of("SA", "SU")), "add 5");
        eq("2028-02-29", BusinessDays.addBusinessDays("2028-02-28", 1, List.of(), List.of("SA", "SU")), "add 6");
        eq("2026-10-28", BusinessDays.addBusinessDays("2026-10-14", 10, List.of(), List.of("FR", "SA")), "add 7");
        eq("2026-12-31", BusinessDays.addBusinessDays("2026-01-01", 260, List.of(), List.of("SA", "SU")), "add 8");
        eq("2026-10-11", BusinessDays.addBusinessDays("2026-10-11", 0, List.of(), List.of()), "add 9");
        eq(21L, BusinessDays.businessDaysBetween("2026-10-01", "2026-11-01", List.of("2026-10-12"), List.of("SA", "SU")), "between 0");
        eq(-22L, BusinessDays.businessDaysBetween("2026-11-01", "2026-10-01", List.of(), List.of("SA", "SU")), "between 1");
        eq(0L, BusinessDays.businessDaysBetween("2026-10-12", "2026-10-12", List.of(), List.of("SA", "SU")), "between 2");
        eq(7L, BusinessDays.businessDaysBetween("2026-12-21", "2027-01-04", List.of("2026-12-25", "2026-12-28", "2027-01-01"), List.of("SA", "SU")), "between 3");
        eq(261L, BusinessDays.businessDaysBetween("2026-01-01", "2027-01-01", List.of(), List.of("SA", "SU")), "between 4");
        eq(21L, BusinessDays.businessDaysBetween("2026-10-01", "2026-10-31", List.of(), List.of("FR", "SA")), "between 5");
        eq(0L, BusinessDays.businessDaysBetween("2026-10-10", "2026-10-12", List.of("2026-10-11"), List.of("SA", "SU")), "between 6");
        throwsIae(() -> BusinessDays.addBusinessDays("2026-02-30", 1), "invalid 0");
        throwsIae(() -> BusinessDays.addBusinessDays("2026-1-01", 1), "invalid 1");
        throwsIae(() -> BusinessDays.addBusinessDays("2026-01-01", 100001), "invalid 2");
        eq(false, BusinessDays.isBusinessDay("2026-10-10"), "default weekend");
        eq(-22L, BusinessDays.businessDaysBetween("2026-11-01", "2026-10-01"), "default between");
        throwsIae(() -> BusinessDays.isBusinessDay("2026-10-10", List.of(), List.of("MO", "TU", "WE", "TH", "FR", "SA", "SU")), "all seven weekend days");
        throwsIae(() -> BusinessDays.isBusinessDay("2026-10-10", List.of(), List.of("XX")), "unknown weekend day");
        throwsIae(() -> BusinessDays.isBusinessDay("0000-01-01"), "year zero");

        System.out.println("BusinessDaysTest: " + passed + " passed, " + failed + " failed");
        if (failed > 0) System.exit(1);
    }
}
