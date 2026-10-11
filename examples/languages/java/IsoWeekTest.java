// SPDX-License-Identifier: Apache-2.0
// Generated from the wave-10 capability vectors; edit the vectors, not the literals.

import java.util.List;

public final class IsoWeekTest {
    private static int passed;
    private static int failed;

    private static void check(boolean ok, String name) {
        if (ok) passed++; else { failed++; System.err.println("FAIL: " + name); }
    }

    private static void eq(Object expected, Object actual, String name) {
        check(java.util.Objects.equals(expected, actual), name + " expected <" + expected + "> got <" + actual + ">");
    }

    /** Equality plus identical toString, so map entry order is checked too. */
    private static void eqOrd(Object expected, Object actual, String name) {
        eq(expected, actual, name);
        eq(String.valueOf(expected), String.valueOf(actual), name + " (order)");
    }

    private static void throwsIae(Runnable r, String name) {
        try { r.run(); check(false, name + " did not throw"); }
        catch (IllegalArgumentException e) { check(true, name); }
    }

    private static void throwsMsg(Runnable r, String prefix, String name) {
        try { r.run(); check(false, name + " did not throw"); }
        catch (IllegalArgumentException e) { check(e.getMessage() != null && e.getMessage().startsWith(prefix), name + " message <" + e.getMessage() + ">"); }
    }

    private static java.util.LinkedHashMap<String, String> omap(String... kv) {
        java.util.LinkedHashMap<String, String> m = new java.util.LinkedHashMap<>();
        for (int i = 0; i < kv.length; i += 2) m.put(kv[i], kv[i + 1]);
        return m;
    }

    private static java.util.LinkedHashMap<String, Object> omapObj(Object... kv) {
        java.util.LinkedHashMap<String, Object> m = new java.util.LinkedHashMap<>();
        for (int i = 0; i < kv.length; i += 2) m.put((String) kv[i], kv[i + 1]);
        return m;
    }

    private static byte[] hex(String s) {
        byte[] b = new byte[s.length() / 2];
        for (int i = 0; i < b.length; i++) b[i] = (byte) Integer.parseInt(s.substring(2 * i, 2 * i + 2), 16);
        return b;
    }

    public static void main(String[] args) {
        eq(new IsoWeek.WeekDate(2020, 53, 7), IsoWeek.isoWeek(2021, 1, 3), "isoWeek 0");
        eq("2020-W53-7", IsoWeek.formatIsoWeek(2021, 1, 3), "format 0");
        eq(new IsoWeek.Date(2021, 1, 3), IsoWeek.fromIsoWeek(2020, 53, 7), "round trip 0");
        eq(new IsoWeek.WeekDate(2021, 1, 1), IsoWeek.isoWeek(2021, 1, 4), "isoWeek 1");
        eq("2021-W01-1", IsoWeek.formatIsoWeek(2021, 1, 4), "format 1");
        eq(new IsoWeek.Date(2021, 1, 4), IsoWeek.fromIsoWeek(2021, 1, 1), "round trip 1");
        eq(new IsoWeek.WeekDate(2020, 53, 4), IsoWeek.isoWeek(2020, 12, 31), "isoWeek 2");
        eq("2020-W53-4", IsoWeek.formatIsoWeek(2020, 12, 31), "format 2");
        eq(new IsoWeek.Date(2020, 12, 31), IsoWeek.fromIsoWeek(2020, 53, 4), "round trip 2");
        eq(new IsoWeek.WeekDate(2026, 41, 7), IsoWeek.isoWeek(2026, 10, 11), "isoWeek 3");
        eq("2026-W41-7", IsoWeek.formatIsoWeek(2026, 10, 11), "format 3");
        eq(new IsoWeek.Date(2026, 10, 11), IsoWeek.fromIsoWeek(2026, 41, 7), "round trip 3");
        eq(new IsoWeek.WeekDate(2009, 1, 1), IsoWeek.isoWeek(2008, 12, 29), "isoWeek 4");
        eq("2009-W01-1", IsoWeek.formatIsoWeek(2008, 12, 29), "format 4");
        eq(new IsoWeek.Date(2008, 12, 29), IsoWeek.fromIsoWeek(2009, 1, 1), "round trip 4");
        eq(new IsoWeek.WeekDate(2009, 53, 7), IsoWeek.isoWeek(2010, 1, 3), "isoWeek 5");
        eq("2009-W53-7", IsoWeek.formatIsoWeek(2010, 1, 3), "format 5");
        eq(new IsoWeek.Date(2010, 1, 3), IsoWeek.fromIsoWeek(2009, 53, 7), "round trip 5");
        eq(new IsoWeek.WeekDate(2015, 53, 4), IsoWeek.isoWeek(2015, 12, 31), "isoWeek 6");
        eq("2015-W53-4", IsoWeek.formatIsoWeek(2015, 12, 31), "format 6");
        eq(new IsoWeek.Date(2015, 12, 31), IsoWeek.fromIsoWeek(2015, 53, 4), "round trip 6");
        eq(new IsoWeek.WeekDate(2015, 53, 5), IsoWeek.isoWeek(2016, 1, 1), "isoWeek 7");
        eq("2015-W53-5", IsoWeek.formatIsoWeek(2016, 1, 1), "format 7");
        eq(new IsoWeek.Date(2016, 1, 1), IsoWeek.fromIsoWeek(2015, 53, 5), "round trip 7");
        eq(new IsoWeek.WeekDate(2025, 1, 1), IsoWeek.isoWeek(2024, 12, 30), "isoWeek 8");
        eq("2025-W01-1", IsoWeek.formatIsoWeek(2024, 12, 30), "format 8");
        eq(new IsoWeek.Date(2024, 12, 30), IsoWeek.fromIsoWeek(2025, 1, 1), "round trip 8");
        eq(new IsoWeek.WeekDate(1, 1, 1), IsoWeek.isoWeek(1, 1, 1), "isoWeek 9");
        eq("0001-W01-1", IsoWeek.formatIsoWeek(1, 1, 1), "format 9");
        eq(new IsoWeek.Date(1, 1, 1), IsoWeek.fromIsoWeek(1, 1, 1), "round trip 9");
        eq(new IsoWeek.WeekDate(9999, 52, 5), IsoWeek.isoWeek(9999, 12, 31), "isoWeek 10");
        eq("9999-W52-5", IsoWeek.formatIsoWeek(9999, 12, 31), "format 10");
        eq(new IsoWeek.Date(9999, 12, 31), IsoWeek.fromIsoWeek(9999, 52, 5), "round trip 10");
        eq(53, IsoWeek.weeksInYear(2015), "weeksInYear 0");
        eq(52, IsoWeek.weeksInYear(2016), "weeksInYear 1");
        eq(53, IsoWeek.weeksInYear(2020), "weeksInYear 2");
        eq(52, IsoWeek.weeksInYear(2021), "weeksInYear 3");
        eq(53, IsoWeek.weeksInYear(2026), "weeksInYear 4");
        eq(53, IsoWeek.weeksInYear(2032), "weeksInYear 5");
        eq(53, IsoWeek.weeksInYear(2037), "weeksInYear 6");
        eq(new IsoWeek.Date(2021, 1, 1), IsoWeek.fromIsoWeek(2020, 53, 5), "fromIsoWeek 0");
        eq(new IsoWeek.Date(2025, 12, 29), IsoWeek.fromIsoWeek(2026, 1, 1), "fromIsoWeek 1");
        eq(new IsoWeek.Date(2008, 12, 29), IsoWeek.fromIsoWeek(2009, 1, 1), "fromIsoWeek 2");
        eq(new IsoWeek.Date(2026, 10, 11), IsoWeek.parseIsoWeek("2026-W41-7"), "parse 0");
        eq(new IsoWeek.Date(2026, 10, 11), IsoWeek.parseIsoWeek("2026W417"), "parse 1");
        eq(new IsoWeek.Date(2026, 10, 5), IsoWeek.parseIsoWeek("2026-W41"), "parse 2");
        eq(new IsoWeek.Date(2021, 1, 1), IsoWeek.parseIsoWeek("2020-W53-5"), "parse 3");
        throwsIae(() -> IsoWeek.parseIsoWeek("2021-W53-1"), "invalid 0");
        throwsIae(() -> IsoWeek.parseIsoWeek("2026-W00-1"), "invalid 1");
        throwsIae(() -> IsoWeek.parseIsoWeek("2026-W10-8"), "invalid 2");
        throwsIae(() -> IsoWeek.parseIsoWeek("26-W10-1"), "invalid 3");
        throwsIae(() -> IsoWeek.parseIsoWeek("2026-w10-1"), "invalid 4");
        throwsIae(() -> IsoWeek.parseIsoWeek("2026-W1-1"), "invalid 5");
        throwsIae(() -> IsoWeek.isoWeek(2021, 2, 29), "invalid date 2021-02-29");
        throwsIae(() -> IsoWeek.fromIsoWeek(9999, 52, 7), "result past year 9999");

        System.out.println("IsoWeekTest: " + passed + " passed, " + failed + " failed");
        if (failed > 0) System.exit(1);
    }
}
