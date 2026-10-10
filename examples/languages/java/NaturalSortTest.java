// SPDX-License-Identifier: Apache-2.0

import java.util.List;

public final class NaturalSortTest {
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
        eq(List.of("", "9", "10", "A", "a", "b", "file1", "File1.txt", "file1.txt", "file01.txt", "file2.txt", "file10.txt", "x02y1", "x2y9", "x2y10"), NaturalSort.naturalSort(List.of("file10.txt", "file2.txt", "File1.txt", "file1.txt", "file01.txt", "a", "A", "b", "10", "9", "x2y10", "x2y9", "x02y1", "", "file1")), "sorted 0");
        eq(List.of("v1.2.0", "v1.2.10", "v1.9.9", "v1.10.0", "v10.0"), NaturalSort.naturalSort(List.of("v1.10.0", "v1.2.0", "v1.9.9", "v10.0", "v1.2.10")), "sorted 1");
        eq(List.of("img1.png", "IMG2.png", "img10.png", "img12.png"), NaturalSort.naturalSort(List.of("img12.png", "img10.png", "IMG2.png", "img1.png")), "sorted 2");
        eq(List.of("a", "a0", "a00", "a000", "a1", "a01"), NaturalSort.naturalSort(List.of("a0", "a00", "a000", "a", "a1", "a01")), "sorted 3");
        eq(List.of("1x", "_x", "a", "Z", "z", "\u00C4"), NaturalSort.naturalSort(List.of("\u00C4", "Z", "a", "z", "_x", "1x")), "sorted 4");
        eq(-1, NaturalSort.naturalCompare("a2", "a10"), "compare 0");
        eq(1, NaturalSort.naturalCompare("a10", "a2"), "compare 1");
        eq(1, NaturalSort.naturalCompare("abc", "ABC"), "compare 2");
        eq(1, NaturalSort.naturalCompare("x01", "x1"), "compare 3");
        eq(0, NaturalSort.naturalCompare("x1", "x1"), "compare 4");
        eq(-1, NaturalSort.naturalCompare("", "a"), "compare 5");
        eq(1, NaturalSort.naturalCompare("a", "1"), "compare 6");
        eq(-1, NaturalSort.naturalCompare("99999999999999999999", "100000000000000000000"), "compare 7");
        eq(-1, NaturalSort.naturalCompare("\uFF61", "\uD83D\uDE00"), "code point order, not UTF-16 units");

        System.out.println("NaturalSortTest: " + passed + " passed, " + failed + " failed");
        if (failed > 0) System.exit(1);
    }
}
