// SPDX-License-Identifier: Apache-2.0

public final class CronNextTest {
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

    public static void main(String[] args) {
        String[][] vectors = {
            {"*/15 * * * *", "2026-10-10T12:07:30Z", "2026-10-10T12:15:00Z"},
            {"0 9 * * 1-5", "2026-10-10T12:00:00Z", "2026-10-12T09:00:00Z"},
            {"30 2 1 * *", "2026-10-10T00:00:00Z", "2026-11-01T02:30:00Z"},
            {"0 0 29 2 *", "2026-03-01T00:00:00Z", "2028-02-29T00:00:00Z"},
            {"0 12 13 * 5", "2026-10-10T00:00:00Z", "2026-10-13T12:00:00Z"},
            {"59 23 31 12 *", "2026-12-31T23:59:00Z", "2027-12-31T23:59:00Z"},
            {"0 0 * * 0", "2026-10-10T00:00:00Z", "2026-10-11T00:00:00Z"},
            {"5,10 8-9 * * *", "2026-10-10T09:10:00Z", "2026-10-11T08:05:00Z"},
        };
        for (String[] v : vectors) eq(v[2], CronNext.nextRun(v[0], v[1]), "cron '" + v[0] + "' after " + v[1]);
        eq("2026-10-11T00:00:00Z", CronNext.nextRun("0 0 * * 7", "2026-10-10T00:00:00Z"), "day-of-week 7 is Sunday");
        eq("2026-10-16T12:00:00Z", CronNext.nextRun("0 12 * * 5", "2026-10-13T12:00:00Z"), "dow only must match");
        eq("2026-10-10T12:20:00Z", CronNext.nextRun("20/20 * * * *", "2026-10-10T12:00:00Z"), "N/step starts at N");
        eq("2026-10-10T12:01:00Z", CronNext.nextRun("* * * * *", "2026-10-10T12:00:59.999Z"), "seconds truncated, strictly after");
        for (String bad : new String[] {"* * * *", "60 * * * *", "* 24 * * *", "* * 0 * *", "* * * 13 *", "* * * * 8",
                "5-1 * * * *", "*/0 * * * *", "a * * * *", "1,,2 * * * *", "MON * * * *", "* * ? * *"}) {
            throwsIae(() -> CronNext.nextRun(bad, "2026-10-10T00:00:00Z"), "rejects '" + bad + "'");
        }
        throwsIae(() -> CronNext.nextRun("0 0 30 2 *", "2026-10-10T00:00:00Z"), "gives up after 5 years");
        throwsIae(() -> CronNext.nextRun("* * * * *", "2026-10-10 00:00"), "rejects bad after");

        System.out.println("CronNextTest: " + passed + " passed, " + failed + " failed");
        if (failed > 0) System.exit(1);
    }
}
