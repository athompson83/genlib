// SPDX-License-Identifier: Apache-2.0

public final class WcagContrastTest {
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
        eq(21.0, WcagContrast.contrastRatio2("#000", "#fff"), "bw");
        eq(4.54, WcagContrast.contrastRatio2("#767676", "#ffffff"), "grey");
        eq(4.51, WcagContrast.contrastRatio2("#1a73e8", "#ffffff"), "blue");
        eq(1.0, WcagContrast.contrastRatio2("#abc", "#aabbcc"), "same");
        eq(1.07, WcagContrast.contrastRatio2("#ffff00", "#ffffff"), "yellow");
        eq(4.54, WcagContrast.contrastRatio2("#FFFFFF", "#767676"), "order and case independent");
        check(WcagContrast.passes(WcagContrast.contrastRatio("#767676", "#ffffff"), "AA", false), "grey passes AA normal");
        check(!WcagContrast.passes(WcagContrast.contrastRatio("#767676", "#ffffff"), "AAA", false), "grey fails AAA normal");
        check(WcagContrast.passes(WcagContrast.contrastRatio("#767676", "#ffffff"), "AAA", true), "grey passes AAA large");
        check(!WcagContrast.passes(WcagContrast.contrastRatio("#ffff00", "#ffffff"), "AA", true), "yellow fails AA large");
        check(WcagContrast.passes(21.0, "AAA", false), "black on white passes AAA");
        check(!WcagContrast.passes(4.4999, "AA", false), "unrounded ratio compared");
        eq(0.0, WcagContrast.relativeLuminance("#000000"), "black luminance");
        eq(1.0, WcagContrast.relativeLuminance("#FFF"), "white luminance");
        for (String bad : new String[] {"fff", "#ff", "#ffff", "#gggggg", "#12345", "", "#１１１"}) {
            throwsIae(() -> WcagContrast.relativeLuminance(bad), "rejects '" + bad + "'");
        }
        throwsIae(() -> WcagContrast.passes(5, "A", false), "rejects level A");

        System.out.println("WcagContrastTest: " + passed + " passed, " + failed + " failed");
        if (failed > 0) System.exit(1);
    }
}
