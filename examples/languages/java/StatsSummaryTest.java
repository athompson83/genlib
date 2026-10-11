// SPDX-License-Identifier: Apache-2.0
// Generated from the wave-12 capability vectors; edit the vectors, not the literals.

import java.util.ArrayList;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.List;

public final class StatsSummaryTest {
    private static final Object NULL = null;
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

    /** Relative tolerance 1e-9 (absolute 1e-12 near zero). */
    private static void near(double expected, double actual, String name) {
        check(Math.abs(expected - actual) <= Math.max(1e-9 * Math.max(Math.abs(expected), Math.abs(actual)), 1e-12),
            name + " expected <" + expected + "> got <" + actual + ">");
    }

    private static void throwsIae(Runnable r, String name) {
        try { r.run(); check(false, name + " did not throw"); }
        catch (IllegalArgumentException e) { check(true, name); }
    }

    private static void throwsMsg(Runnable r, String prefix, String name) {
        try { r.run(); check(false, name + " did not throw"); }
        catch (IllegalArgumentException e) { check(e.getMessage() != null && e.getMessage().startsWith(prefix), name + " message <" + e.getMessage() + ">"); }
    }

    private static LinkedHashMap<String, Object> omap(Object... kv) {
        LinkedHashMap<String, Object> m = new LinkedHashMap<>();
        for (int i = 0; i < kv.length; i += 2) m.put((String) kv[i], kv[i + 1]);
        return m;
    }

    private static ArrayList<Object> lst(Object... xs) { return new ArrayList<>(Arrays.asList(xs)); }

    public static void main(String[] args) {
        {
            StatsSummary.Summary s = StatsSummary.summary(new double[] {1.0});
            eq(1, s.count(), "summary 0 count");
            near(1.0, s.sum(), "summary 0 sum");
            near(1.0, s.min(), "summary 0 min");
            near(1.0, s.max(), "summary 0 max");
            near(1.0, s.mean(), "summary 0 mean");
            near(1.0, s.median(), "summary 0 median");
            near(0.0, s.variance(), "summary 0 variance");
            near(0.0, s.stddev(), "summary 0 stddev");
            near(1.0, s.p25(), "summary 0 p25");
            near(1.0, s.p75(), "summary 0 p75");
            near(1.0, s.p90(), "summary 0 p90");
            near(1.0, s.p95(), "summary 0 p95");
            near(1.0, s.p99(), "summary 0 p99");
        }
        {
            StatsSummary.Summary s = StatsSummary.summary(new double[] {1.0, 2.0});
            eq(2, s.count(), "summary 1 count");
            near(3.0, s.sum(), "summary 1 sum");
            near(1.0, s.min(), "summary 1 min");
            near(2.0, s.max(), "summary 1 max");
            near(1.5, s.mean(), "summary 1 mean");
            near(1.5, s.median(), "summary 1 median");
            near(0.5, s.variance(), "summary 1 variance");
            near(0.7071067811865476, s.stddev(), "summary 1 stddev");
            near(1.25, s.p25(), "summary 1 p25");
            near(1.75, s.p75(), "summary 1 p75");
            near(1.9, s.p90(), "summary 1 p90");
            near(1.95, s.p95(), "summary 1 p95");
            near(1.99, s.p99(), "summary 1 p99");
        }
        {
            StatsSummary.Summary s = StatsSummary.summary(new double[] {3.0, 1.0, 2.0});
            eq(3, s.count(), "summary 2 count");
            near(6.0, s.sum(), "summary 2 sum");
            near(1.0, s.min(), "summary 2 min");
            near(3.0, s.max(), "summary 2 max");
            near(2.0, s.mean(), "summary 2 mean");
            near(2.0, s.median(), "summary 2 median");
            near(1.0, s.variance(), "summary 2 variance");
            near(1.0, s.stddev(), "summary 2 stddev");
            near(1.5, s.p25(), "summary 2 p25");
            near(2.5, s.p75(), "summary 2 p75");
            near(2.8, s.p90(), "summary 2 p90");
            near(2.9, s.p95(), "summary 2 p95");
            near(2.98, s.p99(), "summary 2 p99");
        }
        {
            StatsSummary.Summary s = StatsSummary.summary(new double[] {2.0, 4.0, 4.0, 4.0, 5.0, 5.0, 7.0, 9.0});
            eq(8, s.count(), "summary 3 count");
            near(40.0, s.sum(), "summary 3 sum");
            near(2.0, s.min(), "summary 3 min");
            near(9.0, s.max(), "summary 3 max");
            near(5.0, s.mean(), "summary 3 mean");
            near(4.5, s.median(), "summary 3 median");
            near(4.571428571428571, s.variance(), "summary 3 variance");
            near(2.138089935299395, s.stddev(), "summary 3 stddev");
            near(4.0, s.p25(), "summary 3 p25");
            near(5.5, s.p75(), "summary 3 p75");
            near(7.6, s.p90(), "summary 3 p90");
            near(8.3, s.p95(), "summary 3 p95");
            near(8.86, s.p99(), "summary 3 p99");
        }
        {
            StatsSummary.Summary s = StatsSummary.summary(new double[] {1.5, 2.5, -3.25, 10.0, 0.0});
            eq(5, s.count(), "summary 4 count");
            near(10.75, s.sum(), "summary 4 sum");
            near(-3.25, s.min(), "summary 4 min");
            near(10.0, s.max(), "summary 4 max");
            near(2.15, s.mean(), "summary 4 mean");
            near(1.5, s.median(), "summary 4 median");
            near(23.9875, s.variance(), "summary 4 variance");
            near(4.897703543498729, s.stddev(), "summary 4 stddev");
            near(0.0, s.p25(), "summary 4 p25");
            near(2.5, s.p75(), "summary 4 p75");
            near(7.000000000000001, s.p90(), "summary 4 p90");
            near(8.499999999999998, s.p95(), "summary 4 p95");
            near(9.7, s.p99(), "summary 4 p99");
        }
        {
            StatsSummary.Summary s = StatsSummary.summary(new double[] {10.0, 20.0, 30.0, 40.0, 50.0, 60.0, 70.0, 80.0, 90.0, 100.0});
            eq(10, s.count(), "summary 5 count");
            near(550.0, s.sum(), "summary 5 sum");
            near(10.0, s.min(), "summary 5 min");
            near(100.0, s.max(), "summary 5 max");
            near(55.0, s.mean(), "summary 5 mean");
            near(55.0, s.median(), "summary 5 median");
            near(916.6666666666666, s.variance(), "summary 5 variance");
            near(30.276503540974915, s.stddev(), "summary 5 stddev");
            near(32.5, s.p25(), "summary 5 p25");
            near(77.5, s.p75(), "summary 5 p75");
            near(91.0, s.p90(), "summary 5 p90");
            near(95.5, s.p95(), "summary 5 p95");
            near(99.1, s.p99(), "summary 5 p99");
        }
        {
            StatsSummary.Summary s = StatsSummary.summary(new double[] {1000000004.0, 1000000007.0, 1000000013.0, 1000000016.0});
            eq(4, s.count(), "summary 6 count");
            near(4000000040.0, s.sum(), "summary 6 sum");
            near(1000000004.0, s.min(), "summary 6 min");
            near(1000000016.0, s.max(), "summary 6 max");
            near(1000000010.0, s.mean(), "summary 6 mean");
            near(1000000010.0, s.median(), "summary 6 median");
            near(30.0, s.variance(), "summary 6 variance");
            near(5.477225575051661, s.stddev(), "summary 6 stddev");
            near(1000000006.25, s.p25(), "summary 6 p25");
            near(1000000013.75, s.p75(), "summary 6 p75");
            near(1000000015.1, s.p90(), "summary 6 p90");
            near(1000000015.55, s.p95(), "summary 6 p95");
            near(1000000015.91, s.p99(), "summary 6 p99");
        }
        near(2.0, StatsSummary.percentile(new double[] {2.0, 4.0, 4.0, 4.0, 5.0, 5.0, 7.0, 9.0}, 0.0), "percentile 0");
        near(3.4, StatsSummary.percentile(new double[] {2.0, 4.0, 4.0, 4.0, 5.0, 5.0, 7.0, 9.0}, 10.0), "percentile 1");
        near(4.0, StatsSummary.percentile(new double[] {2.0, 4.0, 4.0, 4.0, 5.0, 5.0, 7.0, 9.0}, 33.3), "percentile 2");
        near(4.5, StatsSummary.percentile(new double[] {2.0, 4.0, 4.0, 4.0, 5.0, 5.0, 7.0, 9.0}, 50.0), "percentile 3");
        near(8.986, StatsSummary.percentile(new double[] {2.0, 4.0, 4.0, 4.0, 5.0, 5.0, 7.0, 9.0}, 99.9), "percentile 4");
        near(9.0, StatsSummary.percentile(new double[] {2.0, 4.0, 4.0, 4.0, 5.0, 5.0, 7.0, 9.0}, 100.0), "percentile 5");
        near(-3.25, StatsSummary.percentile(new double[] {1.5, 2.5, -3.25, 10.0, 0.0}, 0.0), "percentile 6");
        near(-1.95, StatsSummary.percentile(new double[] {1.5, 2.5, -3.25, 10.0, 0.0}, 10.0), "percentile 7");
        near(0.4979999999999998, StatsSummary.percentile(new double[] {1.5, 2.5, -3.25, 10.0, 0.0}, 33.3), "percentile 8");
        near(1.5, StatsSummary.percentile(new double[] {1.5, 2.5, -3.25, 10.0, 0.0}, 50.0), "percentile 9");
        near(9.970000000000002, StatsSummary.percentile(new double[] {1.5, 2.5, -3.25, 10.0, 0.0}, 99.9), "percentile 10");
        near(10.0, StatsSummary.percentile(new double[] {1.5, 2.5, -3.25, 10.0, 0.0}, 100.0), "percentile 11");
        near(10.0, StatsSummary.percentile(new double[] {10.0, 20.0, 30.0, 40.0, 50.0, 60.0, 70.0, 80.0, 90.0, 100.0}, 0.0), "percentile 12");
        near(19.0, StatsSummary.percentile(new double[] {10.0, 20.0, 30.0, 40.0, 50.0, 60.0, 70.0, 80.0, 90.0, 100.0}, 10.0), "percentile 13");
        near(39.97, StatsSummary.percentile(new double[] {10.0, 20.0, 30.0, 40.0, 50.0, 60.0, 70.0, 80.0, 90.0, 100.0}, 33.3), "percentile 14");
        near(55.0, StatsSummary.percentile(new double[] {10.0, 20.0, 30.0, 40.0, 50.0, 60.0, 70.0, 80.0, 90.0, 100.0}, 50.0), "percentile 15");
        near(99.91, StatsSummary.percentile(new double[] {10.0, 20.0, 30.0, 40.0, 50.0, 60.0, 70.0, 80.0, 90.0, 100.0}, 99.9), "percentile 16");
        near(100.0, StatsSummary.percentile(new double[] {10.0, 20.0, 30.0, 40.0, 50.0, 60.0, 70.0, 80.0, 90.0, 100.0}, 100.0), "percentile 17");
        {
            StatsSummary.Histogram h = StatsSummary.histogram(new double[] {1.0, 2.0, 2.5, 3.0, 5.0, 9.0, -1.0, 10.0, 11.0}, new double[] {0.0, 2.0, 5.0, 10.0});
            check(Arrays.equals(new int[] {1, 3, 3}, h.counts()), "histogram 0 counts " + Arrays.toString(h.counts()));
            eq(1, h.below(), "histogram 0 below");
            eq(1, h.above(), "histogram 0 above");
        }
        {
            StatsSummary.Histogram h = StatsSummary.histogram(new double[] {0.5}, new double[] {0.0, 1.0});
            check(Arrays.equals(new int[] {1}, h.counts()), "histogram 1 counts " + Arrays.toString(h.counts()));
            eq(0, h.below(), "histogram 1 below");
            eq(0, h.above(), "histogram 1 above");
        }
        throwsIae(() -> StatsSummary.summary(new double[] {}), "invalid summary 0");
        throwsIae(() -> StatsSummary.percentile(new double[] {1.0, 2.0}, -1.0), "invalid percentile 0");
        throwsIae(() -> StatsSummary.percentile(new double[] {1.0, 2.0}, 100.5), "invalid percentile 1");
        throwsIae(() -> StatsSummary.histogram(new double[] {1.0}, new double[] {0.0}), "invalid edges 0");
        throwsIae(() -> StatsSummary.histogram(new double[] {1.0}, new double[] {1.0, 1.0}), "invalid edges 1");
        throwsIae(() -> StatsSummary.histogram(new double[] {1.0}, new double[] {2.0, 1.0}), "invalid edges 2");
        throwsIae(() -> StatsSummary.summary(new double[] {1.0, Double.NaN}), "NaN rejected");
        throwsIae(() -> StatsSummary.percentile(new double[] {Double.POSITIVE_INFINITY}, 50), "infinity rejected");

        System.out.println("StatsSummaryTest: " + passed + " passed, " + failed + " failed");
        if (failed > 0) System.exit(1);
    }
}
