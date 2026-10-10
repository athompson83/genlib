// SPDX-License-Identifier: Apache-2.0

public final class TileMathTest {
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

    private static void near(double[] expected, double[] actual, double tol, String name) {
        boolean ok = expected.length == actual.length;
        for (int i = 0; ok && i < expected.length; i++) ok = Math.abs(expected[i] - actual[i]) <= tol;
        check(ok, name + " expected " + java.util.Arrays.toString(expected) + " got " + java.util.Arrays.toString(actual));
    }

    public static void main(String[] args) {
        double[][] tiles = {{-122.4194, 37.7749, 12, 655, 1583}, {0, 0, 0, 0, 0}, {2.3522, 48.8566, 15, 16598, 11273}, {179.9999, -89.9, 3, 7, 7}, {-180, 85.1, 2, 0, 0}};
        for (double[] t : tiles) {
            eq(new TileMath.Tile((long) t[3], (long) t[4], (int) t[2]), TileMath.lonLatToTile(t[0], t[1], (int) t[2]), "tile " + t[0] + "," + t[1] + "@" + (int) t[2]);
        }
        near(new double[] {-180.0, -85.0511287798066, 180.0, 85.0511287798066}, TileMath.tileBounds(0, 0, 0), 1e-9, "bounds 0/0/0");
        near(new double[] {-122.431640625, 37.718590325588146, -122.34375, 37.78808138412046}, TileMath.tileBounds(655, 1583, 12), 1e-9, "bounds 12/655/1583");
        near(new double[] {0.0, -85.0511287798066, 180.0, 0.0}, TileMath.tileBounds(1, 1, 1), 1e-9, "bounds 1/1/1");
        Object[][] qk = {{3L, 5L, 3, "213"}, {655L, 1583L, 12, "023010203333"}, {0L, 0L, 1, "0"}};
        for (Object[] q : qk) {
            eq(q[3], TileMath.tileToQuadkey((Long) q[0], (Long) q[1], (Integer) q[2]), "quadkey " + q[3]);
            eq(new TileMath.Tile((Long) q[0], (Long) q[1], (Integer) q[2]), TileMath.quadkeyToTile((String) q[3]), "quadkey to tile " + q[3]);
        }
        eq(new TileMath.Tile(0, 0, 0), TileMath.quadkeyToTile(""), "empty quadkey is zoom 0");
        eq("", TileMath.tileToQuadkey(0, 0, 0), "zoom 0 quadkey");
        near(new double[] {0.0, -7.081154551613622e-10}, TileMath.lonLatToMercator(0, 0), 1e-6, "mercator 0,0");
        near(new double[] {-13627665.271218073, 4547675.354340557}, TileMath.lonLatToMercator(-122.4194, 37.7749), 1e-6, "mercator sf");
        near(new double[] {20037508.342789244, 20037508.342789244}, TileMath.lonLatToMercator(180, 85.05112877980659), 1e-6, "mercator corner");
        throwsIae(() -> TileMath.lonLatToTile(0, 0, 25), "zoom 25");
        throwsIae(() -> TileMath.lonLatToTile(0, 0, -1), "zoom -1");
        throwsIae(() -> TileMath.lonLatToTile(Double.NaN, 0, 3), "NaN lon");
        throwsIae(() -> TileMath.lonLatToTile(180.1, 0, 3), "lon out of range");
        throwsIae(() -> TileMath.tileBounds(2, 0, 1), "x out of range");
        throwsIae(() -> TileMath.tileBounds(0, -1, 1), "y negative");
        throwsIae(() -> TileMath.quadkeyToTile("0124"), "quadkey digit 4");
        throwsIae(() -> TileMath.lonLatToMercator(0, 85.1), "mercator lat too large");

        System.out.println("TileMathTest: " + passed + " passed, " + failed + " failed");
        if (failed > 0) System.exit(1);
    }
}
