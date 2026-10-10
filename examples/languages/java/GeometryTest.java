// SPDX-License-Identifier: Apache-2.0
import java.util.Arrays;

public final class GeometryTest {
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

    private static void near(double expected, double actual, double tol, String name) {
        check(Math.abs(expected - actual) <= tol, name + " expected <" + expected + "> got <" + actual + ">");
    }

    public static void main(String[] args) {
        double[][] square = {{0, 0}, {4, 0}, {4, 4}, {0, 4}};
        double[][] concave = {{0, 0}, {6, 0}, {6, 6}, {3, 3}, {0, 6}};
        Object[][] pip = {
            {square, new double[] {2, 2}, true}, {square, new double[] {5, 2}, false}, {square, new double[] {4, 2}, true},
            {square, new double[] {0, 0}, true}, {square, new double[] {2, 4.000001}, false}, {concave, new double[] {3, 4}, false},
            {concave, new double[] {3, 2}, true}, {concave, new double[] {1, 5}, true}, {concave, new double[] {3, 3}, true},
        };
        for (Object[] v : pip) {
            double[] p = (double[]) v[1];
            eq(v[2], Geometry.pointInPolygon(p, (double[][]) v[0]), "pip " + Arrays.toString(p));
        }
        double[][] closed = {{0, 0}, {4, 0}, {4, 4}, {0, 4}, {0, 0}};
        eq(true, Geometry.pointInPolygon(new double[] {2, 2}, closed), "pip closed ring");
        eq(16.0, Geometry.signedArea(square), "area square");
        eq(-16.0, Geometry.signedArea(new double[][] {{0, 4}, {4, 4}, {4, 0}, {0, 0}}), "area clockwise");
        eq(27.0, Geometry.signedArea(concave), "area concave");
        eq(16.0, Geometry.signedArea(closed), "area closed ring");
        double[] c1 = Geometry.centroid(square);
        near(2.0, c1[0], 1e-9, "centroid square x");
        near(2.0, c1[1], 1e-9, "centroid square y");
        double[] c2 = Geometry.centroid(concave);
        near(3.0, c2[0], 1e-9, "centroid concave x");
        near(2.3333333333333335, c2[1], 1e-9, "centroid concave y");
        double[][] line = {{0, 0}, {1, 0.1}, {2, -0.1}, {3, 5}, {4, 6}, {5, 7}, {6, 8.1}, {7, 9}, {8, 9}, {9, 9}};
        check(Arrays.deepEquals(new double[][] {{0, 0}, {2, -0.1}, {3, 5}, {7, 9}, {9, 9}}, Geometry.simplify(line, 1)), "simplify tolerance 1");
        check(Arrays.deepEquals(new double[][] {{0, 0}, {1, 0.1}, {2, -0.1}, {3, 5}, {6, 8.1}, {7, 9}, {9, 9}}, Geometry.simplify(line, 0.05)), "simplify tolerance 0.05");
        check(Arrays.deepEquals(new double[][] {{0, 0}, {5, 5}}, Geometry.simplify(new double[][] {{0, 0}, {5, 5}}, 1)), "simplify two points");
        double a1 = Geometry.ringAreaSquareMeters(new double[][] {{0, 0}, {1, 0}, {1, 1}, {0, 1}});
        near(12391399902.070992, a1, 12391399902.070992 * 1e-9, "ring area 1 degree");
        double a2 = Geometry.ringAreaSquareMeters(new double[][] {{-0.13, 51.5}, {-0.12, 51.5}, {-0.12, 51.51}, {-0.13, 51.51}});
        near(771337.3090775362, a2, 771337.3090775362 * 1e-9, "ring area london");
        throwsIae(() -> Geometry.centroid(new double[][] {{0, 0}, {1, 1}, {2, 2}}), "centroid zero area");
        throwsIae(() -> Geometry.signedArea(new double[][] {{0, 0}, {1, 1}, {0, 0}}), "ring too short");
        throwsIae(() -> Geometry.simplify(line, -1), "negative tolerance");
        throwsIae(() -> Geometry.pointInPolygon(new double[] {Double.NaN, 0}, square), "NaN point");

        System.out.println("GeometryTest: " + passed + " passed, " + failed + " failed");
        if (failed > 0) System.exit(1);
    }
}
