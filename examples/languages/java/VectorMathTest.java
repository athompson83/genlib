// SPDX-License-Identifier: Apache-2.0

import java.util.List;

public final class VectorMathTest {
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

    private static void topKCase(double[] q, double[][] vs, int k, int[] idx, double[] sc, String name) {
        java.util.List<VectorMath.Scored> got = VectorMath.topK(q, vs, k);
        eq(idx.length, got.size(), name + " size");
        for (int i = 0; i < Math.min(idx.length, got.size()); i++) {
            eq(idx[i], got.get(i).index(), name + " index " + i);
            near(sc[i], got.get(i).score(), 1e-9, name + " score " + i);
        }
    }

    public static void main(String[] args) {
        near(32.0, VectorMath.dot(new double[] {1.0, 2.0, 3.0}, new double[] {4.0, 5.0, 6.0}), 1e-9, "dot 0");
        near(0.9746318461970762, VectorMath.cosine(new double[] {1.0, 2.0, 3.0}, new double[] {4.0, 5.0, 6.0}), 1e-9, "cosine 0");
        near(0.0, VectorMath.dot(new double[] {1.0, 0.0}, new double[] {0.0, 1.0}), 1e-9, "dot 1");
        near(0.0, VectorMath.cosine(new double[] {1.0, 0.0}, new double[] {0.0, 1.0}), 1e-9, "cosine 1");
        near(-2.0, VectorMath.dot(new double[] {1.0, 1.0}, new double[] {-1.0, -1.0}), 1e-9, "dot 2");
        near(-0.9999999999999998, VectorMath.cosine(new double[] {1.0, 1.0}, new double[] {-1.0, -1.0}), 1e-9, "cosine 2");
        near(0.0, VectorMath.dot(new double[] {0.0, 0.0}, new double[] {1.0, 2.0}), 1e-9, "dot 3");
        near(0.0, VectorMath.cosine(new double[] {0.0, 0.0}, new double[] {1.0, 2.0}), 1e-9, "cosine 3");
        near(25.0, VectorMath.dot(new double[] {3.0, 4.0}, new double[] {3.0, 4.0}), 1e-9, "dot 4");
        near(1.0, VectorMath.cosine(new double[] {3.0, 4.0}, new double[] {3.0, 4.0}), 1e-9, "cosine 4");
        near(-1.375, VectorMath.dot(new double[] {0.5, -1.5, 2.0}, new double[] {2.0, 0.25, -1.0}), 1e-9, "dot 5");
        near(-0.23969749850222494, VectorMath.cosine(new double[] {0.5, -1.5, 2.0}, new double[] {2.0, 0.25, -1.0}), 1e-9, "cosine 5");
        near(5.0, VectorMath.norm(new double[] {3.0, 4.0}), 1e-9, "norm 0");
        near(0.0, VectorMath.norm(new double[] {0.0, 0.0, 0.0}), 1e-9, "norm 1");
        near(2.0, VectorMath.norm(new double[] {1.0, 1.0, 1.0, 1.0}), 1e-9, "norm 2");
        near(2.5, VectorMath.norm(new double[] {-2.5}), 1e-9, "norm 3");
        nearAll(new double[] {0.6, 0.8}, VectorMath.normalize(new double[] {3.0, 4.0}), 1e-9, "normalize 0");
        nearAll(new double[] {0.0, 1.0}, VectorMath.normalize(new double[] {0.0, 5.0}), 1e-9, "normalize 1");
        nearAll(new double[] {0.5, 0.5, 0.5, 0.5}, VectorMath.normalize(new double[] {1.0, 1.0, 1.0, 1.0}), 1e-9, "normalize 2");
        topKCase(new double[] {1.0, 0.0}, new double[][] {new double[] {1.0, 0.0}, new double[] {0.99, 0.1}, new double[] {0.0, 1.0}, new double[] {0.7, 0.7}, new double[] {-1.0, 0.0}}, 0, new int[] {}, new double[] {}, "top_k 0");
        topKCase(new double[] {1.0, 0.0}, new double[][] {new double[] {1.0, 0.0}, new double[] {0.99, 0.1}, new double[] {0.0, 1.0}, new double[] {0.7, 0.7}, new double[] {-1.0, 0.0}}, 1, new int[] {0}, new double[] {1.0}, "top_k 1");
        topKCase(new double[] {1.0, 0.0}, new double[][] {new double[] {1.0, 0.0}, new double[] {0.99, 0.1}, new double[] {0.0, 1.0}, new double[] {0.7, 0.7}, new double[] {-1.0, 0.0}}, 3, new int[] {0, 1, 3}, new double[] {1.0, 0.9949371890224981, 0.7071067811865476}, "top_k 2");
        topKCase(new double[] {1.0, 0.0}, new double[][] {new double[] {1.0, 0.0}, new double[] {0.99, 0.1}, new double[] {0.0, 1.0}, new double[] {0.7, 0.7}, new double[] {-1.0, 0.0}}, 10, new int[] {0, 1, 3, 2, 4}, new double[] {1.0, 0.9949371890224981, 0.7071067811865476, 0.0, -1.0}, "top_k 3");
        topKCase(new double[] {0.2, 0.5, 0.1}, new double[][] {new double[] {0.1, 0.4, 0.2}, new double[] {0.9, 0.1, 0.0}, new double[] {0.2, 0.5, 0.1}, new double[] {0.0, 0.0, 1.0}, new double[] {0.3, 0.3, 0.3}, new double[] {0.21, 0.49, 0.12}}, 3, new int[] {2, 5, 0}, new double[] {1.0, 0.9990003934498585, 0.956182887467515}, "top_k 4");
        eq(List.of(0, 1, 4), VectorMath.mmr(new double[] {1.0, 0.0}, new double[][] {new double[] {1.0, 0.0}, new double[] {0.99, 0.1}, new double[] {0.0, 1.0}, new double[] {0.7, 0.7}, new double[] {-1.0, 0.0}}, 3, 0.5), "mmr 0");
        eq(List.of(0, 1, 3), VectorMath.mmr(new double[] {1.0, 0.0}, new double[][] {new double[] {1.0, 0.0}, new double[] {0.99, 0.1}, new double[] {0.0, 1.0}, new double[] {0.7, 0.7}, new double[] {-1.0, 0.0}}, 3, 1.0), "mmr 1");
        eq(List.of(0, 4, 2), VectorMath.mmr(new double[] {1.0, 0.0}, new double[][] {new double[] {1.0, 0.0}, new double[] {0.99, 0.1}, new double[] {0.0, 1.0}, new double[] {0.7, 0.7}, new double[] {-1.0, 0.0}}, 3, 0.0), "mmr 2");
        eq(List.of(0, 1, 3, 2, 4), VectorMath.mmr(new double[] {1.0, 0.0}, new double[][] {new double[] {1.0, 0.0}, new double[] {0.99, 0.1}, new double[] {0.0, 1.0}, new double[] {0.7, 0.7}, new double[] {-1.0, 0.0}}, 5, 0.7), "mmr 3");
        eq(List.of(2, 0, 1), VectorMath.mmr(new double[] {0.2, 0.5, 0.1}, new double[][] {new double[] {0.1, 0.4, 0.2}, new double[] {0.9, 0.1, 0.0}, new double[] {0.2, 0.5, 0.1}, new double[] {0.0, 0.0, 1.0}, new double[] {0.3, 0.3, 0.3}, new double[] {0.21, 0.49, 0.12}}, 3, 0.5), "mmr 4");
        eq(List.of(2, 3, 1, 4), VectorMath.mmr(new double[] {0.2, 0.5, 0.1}, new double[][] {new double[] {0.1, 0.4, 0.2}, new double[] {0.9, 0.1, 0.0}, new double[] {0.2, 0.5, 0.1}, new double[] {0.0, 0.0, 1.0}, new double[] {0.3, 0.3, 0.3}, new double[] {0.21, 0.49, 0.12}}, 4, 0.3), "mmr 5");
        eq(List.of(0, 1, 4), VectorMath.mmr(new double[] {1.0, 0.0}, new double[][] {new double[] {1.0, 0.0}, new double[] {0.99, 0.1}, new double[] {0.0, 1.0}, new double[] {0.7, 0.7}, new double[] {-1.0, 0.0}}, 3), "mmr default lambda");
        throwsIae(() -> VectorMath.cosine(new double[] {1.0, 2.0}, new double[] {1.0, 2.0, 3.0}), "length mismatch: cosine([1,2],[1,2,3])");
        throwsIae(() -> VectorMath.dot(new double[] {}, new double[] {}), "empty: dot([],[])");
        throwsIae(() -> VectorMath.normalize(new double[] {0.0, 0.0}), "normalize([0,0])");
        throwsIae(() -> VectorMath.topK(new double[] {1.0, 0.0}, new double[][] {new double[] {1.0, 0.0}}, -1), "top_k k=-1");
        throwsIae(() -> VectorMath.mmr(new double[] {1.0, 0.0}, new double[][] {new double[] {1.0, 0.0}}, 1, 1.5), "mmr lambda=1.5");

        System.out.println("VectorMathTest: " + passed + " passed, " + failed + " failed");
        if (failed > 0) System.exit(1);
    }
}
