// SPDX-License-Identifier: Apache-2.0

public final class IsoDurationTest {
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
        Object[][] parse = {
            {"P1Y2M3DT4H5M6S", new IsoDuration.Parts(1, 2, 0, 3, 4, 5, 6000)},
            {"PT1H30M", new IsoDuration.Parts(0, 0, 0, 0, 1, 30, 0)},
            {"P2W", new IsoDuration.Parts(0, 0, 2, 0, 0, 0, 0)},
            {"PT0.5S", new IsoDuration.Parts(0, 0, 0, 0, 0, 0, 500)},
            {"PT36H", new IsoDuration.Parts(0, 0, 0, 0, 36, 0, 0)},
            {"P0D", new IsoDuration.Parts(0, 0, 0, 0, 0, 0, 0)},
            {"PT1.250S", new IsoDuration.Parts(0, 0, 0, 0, 0, 0, 1250)},
        };
        for (Object[] v : parse) eq(v[1], IsoDuration.parseDuration((String) v[0]), "parse " + v[0]);
        for (String bad : new String[] {"P", "PT", "1D", "P1H", "PT1D", "P-1D", "PT1.2345S", "P1.5D", "p1d", "P1DT", ""}) {
            throwsIae(() -> IsoDuration.parseDuration(bad), "invalid " + bad);
        }
        Object[][] ms = {{"PT1H30M", 5400000L}, {"P2W", 1209600000L}, {"P1DT0.5S", 86400500L}, {"PT36H", 129600000L}};
        for (Object[] v : ms) eq(v[1], IsoDuration.durationMilliseconds(IsoDuration.parseDuration((String) v[0])), "milliseconds " + v[0]);
        for (String ne : new String[] {"P1Y", "P1M"}) throwsIae(() -> IsoDuration.durationMilliseconds(IsoDuration.parseDuration(ne)), "not exact " + ne);
        Object[][] fmt = {{0L, "PT0S"}, {5400000L, "PT1H30M"}, {90061001L, "P1DT1H1M1.001S"}, {500L, "PT0.5S"}, {129600000L, "P1DT12H"}, {1209600000L, "P14D"}};
        for (Object[] v : fmt) eq(v[1], IsoDuration.formatDuration((Long) v[0]), "format " + v[0]);
        throwsIae(() -> IsoDuration.formatDuration(-1), "format negative");
        throwsIae(() -> IsoDuration.parseDuration("PT99999999999999999999S"), "component overflow");
        throwsIae(() -> IsoDuration.durationMilliseconds(IsoDuration.parseDuration("P9999999999999999W")), "milliseconds overflow");

        System.out.println("IsoDurationTest: " + passed + " passed, " + failed + " failed");
        if (failed > 0) System.exit(1);
    }
}
