// SPDX-License-Identifier: Apache-2.0
import java.util.List;

/** Wave 6 vectors (shared with every Genlib language) for rrule. */
public final class RRuleTest {
    private static int passed;
    private static int failed;

    private static void check(boolean ok, String name) {
        if (ok) passed++; else { failed++; System.err.println("FAIL: " + name); }
    }

    private static void eq(Object expected, Object actual, String name) {
        check(java.util.Objects.equals(expected, actual), name + " expected <" + expected + "> got <" + actual + ">");
    }

    private static void throwsIae(Runnable r, String name) {
        try { r.run(); check(false, name + " did not throw"); }
        catch (IllegalArgumentException e) { check(true, name); }
    }

    public static void main(String[] args) {
        eq(List.of("2026-01-31T09:00:00Z", "2026-03-31T09:00:00Z", "2026-05-31T09:00:00Z", "2026-07-31T09:00:00Z", "2026-08-31T09:00:00Z"), RRule.expandRRule("2026-01-31T09:00:00Z", "FREQ=MONTHLY;COUNT=5"), "rrule " + "FREQ=MONTHLY;COUNT=5");
        eq(List.of("2026-10-12T09:30:00Z", "2026-10-14T09:30:00Z", "2026-10-16T09:30:00Z", "2026-10-19T09:30:00Z", "2026-10-21T09:30:00Z", "2026-10-23T09:30:00Z", "2026-10-26T09:30:00Z"), RRule.expandRRule("2026-10-12T09:30:00Z", "FREQ=WEEKLY;BYDAY=MO,WE,FR;COUNT=7"), "rrule " + "FREQ=WEEKLY;BYDAY=MO,WE,FR;COUNT=7");
        eq(List.of("2026-10-01T00:00:00Z", "2026-10-11T00:00:00Z", "2026-10-21T00:00:00Z", "2026-10-31T00:00:00Z", "2026-11-10T00:00:00Z"), RRule.expandRRule("2026-10-01T00:00:00Z", "FREQ=DAILY;INTERVAL=10;UNTIL=20261115T000000Z"), "rrule " + "FREQ=DAILY;INTERVAL=10;UNTIL=20261115T000000Z");
        eq(List.of("2026-01-30T12:00:00Z", "2026-02-27T12:00:00Z", "2026-03-27T12:00:00Z", "2026-04-24T12:00:00Z"), RRule.expandRRule("2026-01-01T12:00:00Z", "FREQ=MONTHLY;BYDAY=-1FR;COUNT=4"), "rrule " + "FREQ=MONTHLY;BYDAY=-1FR;COUNT=4");
        eq(List.of("2026-01-13T12:00:00Z", "2026-01-27T12:00:00Z", "2026-02-10T12:00:00Z", "2026-02-24T12:00:00Z", "2026-03-10T12:00:00Z", "2026-03-24T12:00:00Z"), RRule.expandRRule("2026-01-01T12:00:00Z", "FREQ=MONTHLY;BYDAY=2TU,4TU;COUNT=6"), "rrule " + "FREQ=MONTHLY;BYDAY=2TU,4TU;COUNT=6");
        eq(List.of("2026-01-31T08:00:00Z", "2026-02-01T08:00:00Z", "2026-02-28T08:00:00Z", "2026-03-01T08:00:00Z", "2026-03-31T08:00:00Z", "2026-04-01T08:00:00Z"), RRule.expandRRule("2026-01-15T08:00:00Z", "FREQ=MONTHLY;BYMONTHDAY=1,-1;COUNT=6"), "rrule " + "FREQ=MONTHLY;BYMONTHDAY=1,-1;COUNT=6");
        eq(List.of("2028-02-29T00:00:00Z", "2032-02-29T00:00:00Z", "2036-02-29T00:00:00Z"), RRule.expandRRule("2028-02-29T00:00:00Z", "FREQ=YEARLY;COUNT=3"), "rrule " + "FREQ=YEARLY;COUNT=3");
        eq(List.of("2026-03-10T10:00:00Z", "2026-09-10T10:00:00Z", "2027-03-10T10:00:00Z", "2027-09-10T10:00:00Z", "2028-03-10T10:00:00Z"), RRule.expandRRule("2026-03-10T10:00:00Z", "FREQ=YEARLY;BYMONTH=3,9;COUNT=5"), "rrule " + "FREQ=YEARLY;BYMONTH=3,9;COUNT=5");
        eq(List.of("2026-10-27T18:00:00Z", "2026-11-10T18:00:00Z", "2026-11-24T18:00:00Z"), RRule.expandRRule("2026-10-14T18:00:00Z", "FREQ=WEEKLY;INTERVAL=2;BYDAY=TU;COUNT=3"), "rrule " + "FREQ=WEEKLY;INTERVAL=2;BYDAY=TU;COUNT=3");
        eq(List.of("2026-10-14T18:00:00Z", "2026-10-21T18:00:00Z"), RRule.expandRRule("2026-10-14T18:00:00Z", "FREQ=WEEKLY;COUNT=2"), "rrule " + "FREQ=WEEKLY;COUNT=2");
        eq(List.of("2026-01-31T09:00:00Z", "2026-03-31T09:00:00Z", "2026-05-31T09:00:00Z", "2026-07-31T09:00:00Z"), RRule.expandRRule("2026-01-31T09:00:00Z", "FREQ=MONTHLY;INTERVAL=2;BYMONTHDAY=31;UNTIL=20261231T235959Z"), "rrule " + "FREQ=MONTHLY;INTERVAL=2;BYMONTHDAY=31;UNTIL=20261231T235959Z");
        throwsIae(() -> RRule.expandRRule("2026-01-01T00:00:00Z", "FREQ=HOURLY"), "invalid " + "FREQ=HOURLY");
        throwsIae(() -> RRule.expandRRule("2026-01-01T00:00:00Z", "COUNT=3"), "invalid " + "COUNT=3");
        throwsIae(() -> RRule.expandRRule("2026-01-01T00:00:00Z", "FREQ=DAILY;COUNT=2;UNTIL=20261231T000000Z"), "invalid " + "FREQ=DAILY;COUNT=2;UNTIL=20261231T000000Z");
        throwsIae(() -> RRule.expandRRule("2026-01-01T00:00:00Z", "FREQ=WEEKLY;BYDAY=1MO"), "invalid " + "FREQ=WEEKLY;BYDAY=1MO");
        throwsIae(() -> RRule.expandRRule("2026-01-01T00:00:00Z", "FREQ=DAILY;BYDAY=MO"), "invalid " + "FREQ=DAILY;BYDAY=MO");
        throwsIae(() -> RRule.expandRRule("2026-01-01T00:00:00Z", "FREQ=MONTHLY;BYMONTHDAY=32"), "invalid " + "FREQ=MONTHLY;BYMONTHDAY=32");
        throwsIae(() -> RRule.expandRRule("2026-01-01T00:00:00Z", "FREQ=MONTHLY;BYSETPOS=1"), "invalid " + "FREQ=MONTHLY;BYSETPOS=1");
        throwsIae(() -> RRule.expandRRule("2026-01-01T00:00:00Z", "FREQ=WEEKLY;INTERVAL=0"), "invalid " + "FREQ=WEEKLY;INTERVAL=0");
        throwsIae(() -> RRule.expandRRule("2026-01-01T00:00:00Z", "FREQ=MONTHLY;BYDAY=MO;BYMONTHDAY=1"), "invalid " + "FREQ=MONTHLY;BYDAY=MO;BYMONTHDAY=1");
        throwsIae(() -> RRule.expandRRule("2026-01-01T00:00:00Z", "FREQ=YEARLY;UNTIL=2026-12-31"), "invalid " + "FREQ=YEARLY;UNTIL=2026-12-31");
        throwsIae(() -> RRule.expandRRule("2026-01-01T00:00:00Z", "FREQ=DAILY;FREQ=DAILY"), "invalid " + "FREQ=DAILY;FREQ=DAILY");
        throwsIae(() -> RRule.expandRRule("2026-01-01T00:00:00Z", "FREQ=WEEKLY;BYDAY=XX"), "invalid " + "FREQ=WEEKLY;BYDAY=XX");
        eq(3, RRule.expandRRule("2026-01-01T00:00:00Z", "FREQ=DAILY", 3).size(), "limit");
        eq(50, RRule.expandRRule("2026-01-01T00:00:00Z", "FREQ=DAILY").size(), "default limit");
        throwsIae(() -> RRule.expandRRule("2026-01-01T00:00:00Z", "FREQ=DAILY", 1001), "limit too large");
        throwsIae(() -> RRule.expandRRule("2026-01-01T00:00:00Z", "FREQ=DAILY", 0), "limit zero");
        throwsIae(() -> RRule.expandRRule("2026-02-30T00:00:00Z", "FREQ=DAILY"), "bad dtstart");
        throwsIae(() -> RRule.expandRRule("2026-01-01 00:00:00", "FREQ=DAILY"), "dtstart format");

        System.out.println("RRuleTest: " + passed + " passed, " + failed + " failed");
        if (failed > 0) System.exit(1);
    }
}
