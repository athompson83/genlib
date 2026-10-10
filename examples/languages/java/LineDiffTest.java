// SPDX-License-Identifier: Apache-2.0
// Every vector line is copied from the shared wave 7 vectors (vectors.json) used by all Genlib languages.

/** Wave 7 vectors (shared with every Genlib language) for line-diff. */
public final class LineDiffTest {
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
        eq(java.util.List.<LineDiff.Op>of(new LineDiff.Op("=", "a"), new LineDiff.Op("-", "b"), new LineDiff.Op("+", "B"), new LineDiff.Op("=", "c")), LineDiff.diffLines("a\nb\nc\n", "a\nB\nc\n"), "diffLines 0");
        eq(java.util.List.<LineDiff.Op>of(new LineDiff.Op("+", "x")), LineDiff.diffLines("", "x\n"), "diffLines 1");
        eq(java.util.List.<LineDiff.Op>of(new LineDiff.Op("-", "x")), LineDiff.diffLines("x\n", ""), "diffLines 2");
        eq(java.util.List.<LineDiff.Op>of(new LineDiff.Op("=", "one"), new LineDiff.Op("-", "two"), new LineDiff.Op("+", "TWO"), new LineDiff.Op("=", "three"), new LineDiff.Op("=", "four"), new LineDiff.Op("=", "five"), new LineDiff.Op("=", "six"), new LineDiff.Op("=", "seven"), new LineDiff.Op("=", "eight"), new LineDiff.Op("-", "nine"), new LineDiff.Op("+", "NINE"), new LineDiff.Op("=", "ten")), LineDiff.diffLines("one\ntwo\nthree\nfour\nfive\nsix\nseven\neight\nnine\nten\n", "one\nTWO\nthree\nfour\nfive\nsix\nseven\neight\nNINE\nten\n"), "diffLines 3");
        eq(java.util.List.<LineDiff.Op>of(new LineDiff.Op("=", "1"), new LineDiff.Op("=", "2"), new LineDiff.Op("-", "3"), new LineDiff.Op("+", "X"), new LineDiff.Op("=", "4"), new LineDiff.Op("=", "5"), new LineDiff.Op("=", "6"), new LineDiff.Op("=", "7"), new LineDiff.Op("=", "8"), new LineDiff.Op("=", "9"), new LineDiff.Op("=", "10"), new LineDiff.Op("=", "11"), new LineDiff.Op("=", "12"), new LineDiff.Op("=", "13"), new LineDiff.Op("-", "14"), new LineDiff.Op("+", "Y"), new LineDiff.Op("=", "15"), new LineDiff.Op("=", "16")), LineDiff.diffLines("1\n2\n3\n4\n5\n6\n7\n8\n9\n10\n11\n12\n13\n14\n15\n16\n", "1\n2\nX\n4\n5\n6\n7\n8\n9\n10\n11\n12\n13\nY\n15\n16\n"), "diffLines 4");
        eq(java.util.List.<LineDiff.Op>of(new LineDiff.Op("=", "a"), new LineDiff.Op("=", "b")), LineDiff.diffLines("a\nb\n", "a\nb"), "diffLines 5");
        eq(java.util.List.<LineDiff.Op>of(new LineDiff.Op("=", "a"), new LineDiff.Op("-", "b"), new LineDiff.Op("+", "c")), LineDiff.diffLines("a\nb", "a\nc"), "diffLines 6");
        eq(java.util.List.<LineDiff.Op>of(new LineDiff.Op("=", "same")), LineDiff.diffLines("same\n", "same\n"), "diffLines 7");
        eq(java.util.List.<LineDiff.Op>of(new LineDiff.Op("-", "a"), new LineDiff.Op("=", "b"), new LineDiff.Op("=", "c"), new LineDiff.Op("=", "d"), new LineDiff.Op("+", "e")), LineDiff.diffLines("a\nb\nc\nd\n", "b\nc\nd\ne\n"), "diffLines 8");
        eq(java.util.List.<LineDiff.Op>of(new LineDiff.Op("-", "x"), new LineDiff.Op("=", "y"), new LineDiff.Op("+", "x")), LineDiff.diffLines("x\ny\n", "y\nx\n"), "diffLines 9");
        eq("--- old.txt\n+++ new.txt\n@@ -1,3 +1,3 @@\n a\n-b\n+B\n c\n", LineDiff.unifiedDiff("a\nb\nc\n", "a\nB\nc\n", "old.txt", "new.txt", 3), "unifiedDiff 0");
        eq("--- old.txt\n+++ new.txt\n@@ -0,0 +1 @@\n+x\n", LineDiff.unifiedDiff("", "x\n", "old.txt", "new.txt", 3), "unifiedDiff 1");
        eq("--- old.txt\n+++ new.txt\n@@ -1 +0,0 @@\n-x\n", LineDiff.unifiedDiff("x\n", "", "old.txt", "new.txt", 3), "unifiedDiff 2");
        eq("--- old.txt\n+++ new.txt\n@@ -1,10 +1,10 @@\n one\n-two\n+TWO\n three\n four\n five\n six\n seven\n eight\n-nine\n+NINE\n ten\n", LineDiff.unifiedDiff("one\ntwo\nthree\nfour\nfive\nsix\nseven\neight\nnine\nten\n", "one\nTWO\nthree\nfour\nfive\nsix\nseven\neight\nNINE\nten\n", "old.txt", "new.txt", 3), "unifiedDiff 3");
        eq("--- old.txt\n+++ new.txt\n@@ -1,6 +1,6 @@\n 1\n 2\n-3\n+X\n 4\n 5\n 6\n@@ -11,6 +11,6 @@\n 11\n 12\n 13\n-14\n+Y\n 15\n 16\n", LineDiff.unifiedDiff("1\n2\n3\n4\n5\n6\n7\n8\n9\n10\n11\n12\n13\n14\n15\n16\n", "1\n2\nX\n4\n5\n6\n7\n8\n9\n10\n11\n12\n13\nY\n15\n16\n", "old.txt", "new.txt", 3), "unifiedDiff 4");
        eq("--- old.txt\n+++ new.txt\n@@ -1,2 +1,2 @@\n a\n-b\n+b\n\\ No newline at end of file\n", LineDiff.unifiedDiff("a\nb\n", "a\nb", "old.txt", "new.txt", 3), "unifiedDiff 5");
        eq("--- old.txt\n+++ new.txt\n@@ -1,2 +1,2 @@\n a\n-b\n\\ No newline at end of file\n+c\n\\ No newline at end of file\n", LineDiff.unifiedDiff("a\nb", "a\nc", "old.txt", "new.txt", 3), "unifiedDiff 6");
        eq("", LineDiff.unifiedDiff("same\n", "same\n", "old.txt", "new.txt", 3), "unifiedDiff 7");
        eq("--- old.txt\n+++ new.txt\n@@ -1,4 +1,4 @@\n-a\n b\n c\n d\n+e\n", LineDiff.unifiedDiff("a\nb\nc\nd\n", "b\nc\nd\ne\n", "old.txt", "new.txt", 3), "unifiedDiff 8");
        eq("--- old.txt\n+++ new.txt\n@@ -1,2 +1,2 @@\n-x\n y\n+x\n", LineDiff.unifiedDiff("x\ny\n", "y\nx\n", "old.txt", "new.txt", 3), "unifiedDiff 9");

        System.out.println("LineDiffTest: " + passed + " passed, " + failed + " failed");
        if (failed > 0) System.exit(1);
    }
}
