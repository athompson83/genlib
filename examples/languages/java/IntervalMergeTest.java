// SPDX-License-Identifier: Apache-2.0
// Generated from the wave-12 capability vectors; edit the vectors, not the literals.

import java.util.ArrayList;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.List;

public final class IntervalMergeTest {
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
        check(Arrays.deepEquals(new long[][] {{1L, 6L}, {8L, 10L}, {15L, 20L}}, IntervalMerge.merge(new long[][] {{1L, 3L}, {2L, 6L}, {8L, 10L}, {15L, 18L}, {18L, 20L}})), "merge 0 " + Arrays.deepToString(IntervalMerge.merge(new long[][] {{1L, 3L}, {2L, 6L}, {8L, 10L}, {15L, 18L}, {18L, 20L}})));
        check(Arrays.deepEquals(new long[][] {{1L, 3L}, {5L, 7L}}, IntervalMerge.merge(new long[][] {{5L, 7L}, {1L, 2L}, {2L, 3L}})), "merge 1 " + Arrays.deepToString(IntervalMerge.merge(new long[][] {{5L, 7L}, {1L, 2L}, {2L, 3L}})));
        check(Arrays.deepEquals(new long[][] {}, IntervalMerge.merge(new long[][] {})), "merge 2 " + Arrays.deepToString(IntervalMerge.merge(new long[][] {})));
        check(Arrays.deepEquals(new long[][] {{-5L, 4L}}, IntervalMerge.merge(new long[][] {{-5L, -1L}, {-3L, 4L}})), "merge 3 " + Arrays.deepToString(IntervalMerge.merge(new long[][] {{-5L, -1L}, {-3L, 4L}})));
        check(Arrays.deepEquals(new long[][] {{1L, 2L}, {5L, 6L}, {8L, 9L}, {17L, 20L}}, IntervalMerge.intersect(new long[][] {{1L, 3L}, {2L, 6L}, {8L, 10L}, {15L, 18L}, {18L, 20L}}, new long[][] {{0L, 2L}, {5L, 9L}, {17L, 30L}})), "intersect 0 " + Arrays.deepToString(IntervalMerge.intersect(new long[][] {{1L, 3L}, {2L, 6L}, {8L, 10L}, {15L, 18L}, {18L, 20L}}, new long[][] {{0L, 2L}, {5L, 9L}, {17L, 30L}})));
        check(Arrays.deepEquals(new long[][] {}, IntervalMerge.intersect(new long[][] {{1L, 2L}}, new long[][] {{2L, 3L}})), "intersect 1 " + Arrays.deepToString(IntervalMerge.intersect(new long[][] {{1L, 2L}}, new long[][] {{2L, 3L}})));
        check(Arrays.deepEquals(new long[][] {{10L, 20L}, {30L, 40L}}, IntervalMerge.intersect(new long[][] {{0L, 100L}}, new long[][] {{10L, 20L}, {30L, 40L}})), "intersect 2 " + Arrays.deepToString(IntervalMerge.intersect(new long[][] {{0L, 100L}}, new long[][] {{10L, 20L}, {30L, 40L}})));
        check(Arrays.deepEquals(new long[][] {{2L, 5L}, {9L, 10L}, {15L, 17L}}, IntervalMerge.subtract(new long[][] {{1L, 3L}, {2L, 6L}, {8L, 10L}, {15L, 18L}, {18L, 20L}}, new long[][] {{0L, 2L}, {5L, 9L}, {17L, 30L}})), "subtract 0 " + Arrays.deepToString(IntervalMerge.subtract(new long[][] {{1L, 3L}, {2L, 6L}, {8L, 10L}, {15L, 18L}, {18L, 20L}}, new long[][] {{0L, 2L}, {5L, 9L}, {17L, 30L}})));
        check(Arrays.deepEquals(new long[][] {{0L, 2L}, {3L, 5L}, {7L, 10L}}, IntervalMerge.subtract(new long[][] {{0L, 10L}}, new long[][] {{2L, 3L}, {5L, 7L}})), "subtract 1 " + Arrays.deepToString(IntervalMerge.subtract(new long[][] {{0L, 10L}}, new long[][] {{2L, 3L}, {5L, 7L}})));
        check(Arrays.deepEquals(new long[][] {}, IntervalMerge.subtract(new long[][] {{0L, 10L}}, new long[][] {{0L, 10L}})), "subtract 2 " + Arrays.deepToString(IntervalMerge.subtract(new long[][] {{0L, 10L}}, new long[][] {{0L, 10L}})));
        check(Arrays.deepEquals(new long[][] {{0L, 10L}}, IntervalMerge.subtract(new long[][] {{0L, 10L}}, new long[][] {})), "subtract 3 " + Arrays.deepToString(IntervalMerge.subtract(new long[][] {{0L, 10L}}, new long[][] {})));
        check(Arrays.deepEquals(new long[][] {{0L, 1L}, {6L, 8L}, {10L, 15L}, {20L, 25L}}, IntervalMerge.gaps(new long[][] {{1L, 3L}, {2L, 6L}, {8L, 10L}, {15L, 18L}, {18L, 20L}}, 0L, 25L)), "gaps 0 " + Arrays.deepToString(IntervalMerge.gaps(new long[][] {{1L, 3L}, {2L, 6L}, {8L, 10L}, {15L, 18L}, {18L, 20L}}, 0L, 25L)));
        check(Arrays.deepEquals(new long[][] {{3L, 5L}}, IntervalMerge.gaps(new long[][] {}, 3L, 5L)), "gaps 1 " + Arrays.deepToString(IntervalMerge.gaps(new long[][] {}, 3L, 5L)));
        eq(12L, IntervalMerge.total(new long[][] {{1L, 3L}, {2L, 6L}, {8L, 10L}, {15L, 18L}, {18L, 20L}}), "total 0");
        eq(19L, IntervalMerge.total(new long[][] {{0L, 2L}, {5L, 9L}, {17L, 30L}}), "total 1");
        eq(true, IntervalMerge.overlaps(new long[] {1L, 3L}, new long[] {2L, 4L}), "overlaps 0");
        eq(false, IntervalMerge.overlaps(new long[] {1L, 3L}, new long[] {3L, 4L}), "overlaps 1");
        eq(true, IntervalMerge.overlaps(new long[] {5L, 9L}, new long[] {6L, 7L}), "overlaps 2");
        eq(false, IntervalMerge.overlaps(new long[] {1L, 2L}, new long[] {5L, 6L}), "overlaps 3");
        eq(false, IntervalMerge.contains(new long[][] {{1L, 3L}, {2L, 6L}, {8L, 10L}, {15L, 18L}, {18L, 20L}}, 6L), "contains 0");
        eq(true, IntervalMerge.contains(new long[][] {{1L, 3L}, {2L, 6L}, {8L, 10L}, {15L, 18L}, {18L, 20L}}, 5L), "contains 1");
        eq(false, IntervalMerge.contains(new long[][] {{1L, 3L}, {2L, 6L}, {8L, 10L}, {15L, 18L}, {18L, 20L}}, 20L), "contains 2");
        eq(true, IntervalMerge.contains(new long[][] {{1L, 3L}, {2L, 6L}, {8L, 10L}, {15L, 18L}, {18L, 20L}}, 19L), "contains 3");
        eq(false, IntervalMerge.contains(new long[][] {{1L, 3L}, {2L, 6L}, {8L, 10L}, {15L, 18L}, {18L, 20L}}, 0L), "contains 4");
        throwsIae(() -> IntervalMerge.merge(new long[][] {{3L, 3L}}), "invalid 0");
        throwsIae(() -> IntervalMerge.merge(new long[][] {{5L, 1L}}), "invalid 1");
        throwsIae(() -> IntervalMerge.gaps(new long[0][], 5L, 5L), "invalid gap bounds");
        throwsIae(() -> IntervalMerge.overlaps(new long[] {2L, 2L}, new long[] {1L, 3L}), "invalid overlaps");

        System.out.println("IntervalMergeTest: " + passed + " passed, " + failed + " failed");
        if (failed > 0) System.exit(1);
    }
}
