// SPDX-License-Identifier: Apache-2.0
// Every vector line is copied from the shared wave 7 vectors (vectors.json) used by all Genlib languages.

/** Wave 7 vectors (shared with every Genlib language) for feature-flags. */
public final class FeatureFlagsTest {
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

    /** Chi-square statistic of the 2x2 contingency table of two 0/1 assignments. */
    private static double chiSquare2x2(double[][] t) {
        double n = t[0][0] + t[0][1] + t[1][0] + t[1][1];
        double chi = 0;
        for (int i = 0; i < 2; i++) {
            for (int j = 0; j < 2; j++) {
                double e = (t[i][0] + t[i][1]) * (t[0][j] + t[1][j]) / n;
                chi += (t[i][j] - e) * (t[i][j] - e) / e;
            }
        }
        return chi;
    }

    public static void main(String[] args) {
        eq(new FeatureFlags.Result(true, "rollout", 849, null), FeatureFlags.evaluateFlag(new FeatureFlags.Flag("new-checkout").rolloutPercent(25.0), "user-1"), "flag case 0");
        eq(new FeatureFlags.Result(false, "excluded", 5308, null), FeatureFlags.evaluateFlag(new FeatureFlags.Flag("new-checkout").rolloutPercent(25.0), "user-2"), "flag case 1");
        eq(new FeatureFlags.Result(false, "excluded", 5247, null), FeatureFlags.evaluateFlag(new FeatureFlags.Flag("new-checkout").rolloutPercent(25.0), "user-3"), "flag case 2");
        eq(new FeatureFlags.Result(false, "excluded", 9209, null), FeatureFlags.evaluateFlag(new FeatureFlags.Flag("new-checkout").rolloutPercent(25.0), "user-42"), "flag case 3");
        eq(new FeatureFlags.Result(false, "excluded", 9060, null), FeatureFlags.evaluateFlag(new FeatureFlags.Flag("new-checkout").rolloutPercent(25.0), "alice@example.com"), "flag case 4");
        eq(new FeatureFlags.Result(false, "deny", 849, null), FeatureFlags.evaluateFlag(new FeatureFlags.Flag("new-checkout").allow("user-2").deny("user-1").rolloutPercent(25.0), "user-1"), "flag case 5");
        eq(new FeatureFlags.Result(true, "allow", 5308, null), FeatureFlags.evaluateFlag(new FeatureFlags.Flag("new-checkout").allow("user-2").deny("user-1").rolloutPercent(25.0), "user-2"), "flag case 6");
        eq(new FeatureFlags.Result(false, "disabled", 8844, null), FeatureFlags.evaluateFlag(new FeatureFlags.Flag("beta").enabled(false).allow("vip"), "vip"), "flag case 7");
        eq(new FeatureFlags.Result(false, "excluded", 6875, null), FeatureFlags.evaluateFlag(new FeatureFlags.Flag("banner").rolloutPercent(0.0), "user-1"), "flag case 8");
        eq(new FeatureFlags.Result(true, "rollout", 6875, null), FeatureFlags.evaluateFlag(new FeatureFlags.Flag("banner").rolloutPercent(100.0), "user-1"), "flag case 9");
        eq(new FeatureFlags.Result(false, "excluded", 8197, null), FeatureFlags.evaluateFlag(new FeatureFlags.Flag("banner").rolloutPercent(12.34), "user-9"), "flag case 10");
        eq(new FeatureFlags.Result(true, "rollout", 6435, "control"), FeatureFlags.evaluateFlag(new FeatureFlags.Flag("pricing-test").variant("control", 50).variant("annual-first", 30).variant("monthly-first", 20), "u1"), "flag case 11");
        eq(new FeatureFlags.Result(true, "rollout", 401, "annual-first"), FeatureFlags.evaluateFlag(new FeatureFlags.Flag("pricing-test").variant("control", 50).variant("annual-first", 30).variant("monthly-first", 20), "u2"), "flag case 12");
        eq(new FeatureFlags.Result(true, "rollout", 9955, "monthly-first"), FeatureFlags.evaluateFlag(new FeatureFlags.Flag("pricing-test").variant("control", 50).variant("annual-first", 30).variant("monthly-first", 20), "u3"), "flag case 13");
        eq(new FeatureFlags.Result(true, "rollout", 8249, "annual-first"), FeatureFlags.evaluateFlag(new FeatureFlags.Flag("pricing-test").variant("control", 50).variant("annual-first", 30).variant("monthly-first", 20), "u4"), "flag case 14");
        eq(new FeatureFlags.Result(true, "rollout", 6254, "control"), FeatureFlags.evaluateFlag(new FeatureFlags.Flag("pricing-test").variant("control", 50).variant("annual-first", 30).variant("monthly-first", 20), "u5"), "flag case 15");
        eq(new FeatureFlags.Result(true, "rollout", 7068, "control"), FeatureFlags.evaluateFlag(new FeatureFlags.Flag("pricing-test").variant("control", 50).variant("annual-first", 30).variant("monthly-first", 20), "\u00FCn\u00EFcode"), "flag case 16");
        throwsIae(() -> FeatureFlags.evaluateFlag(new FeatureFlags.Flag("bad key"), "u"), "flag invalid 0");
        throwsIae(() -> FeatureFlags.evaluateFlag(new FeatureFlags.Flag("k").rolloutPercent(101.0), "u"), "flag invalid 1");
        throwsIae(() -> FeatureFlags.evaluateFlag(new FeatureFlags.Flag("k").rolloutPercent(12.345), "u"), "flag invalid 2");
        throwsIae(() -> FeatureFlags.evaluateFlag(new FeatureFlags.Flag("k").variant("a", 0), "u"), "flag invalid 3");
        throwsIae(() -> FeatureFlags.evaluateFlag(new FeatureFlags.Flag(""), "u"), "flag invalid 4");

        // Plain FNV-1a's low bit is the parity of the input bytes, so two 50/50 experiments with similar keys
        // put every subject in the same half of both. The fmix32 finalizer must keep them independent.
        for (String[] keys : new String[][] {{"checkout-a", "checkout-b"}, {"exp1", "exp2"}}) {
            double[][] parity = new double[2][2];
            double[][] arms = new double[2][2];
            FeatureFlags.Flag v1 = new FeatureFlags.Flag(keys[0]).variant("a", 1).variant("b", 1);
            FeatureFlags.Flag v2 = new FeatureFlags.Flag(keys[1]).variant("a", 1).variant("b", 1);
            for (int i = 0; i < 10000; i++) {
                String u = "u" + i;
                parity[FeatureFlags.evaluateFlag(new FeatureFlags.Flag(keys[0]), u).bucket() % 2][FeatureFlags.evaluateFlag(new FeatureFlags.Flag(keys[1]), u).bucket() % 2]++;
                arms["b".equals(FeatureFlags.evaluateFlag(v1, u).variant()) ? 1 : 0]["b".equals(FeatureFlags.evaluateFlag(v2, u).variant()) ? 1 : 0]++;
            }
            double cp = chiSquare2x2(parity);
            double ca = chiSquare2x2(arms);
            check(cp < 10.83, "bucket parity " + keys[0] + "/" + keys[1] + " chi-square " + cp);
            check(ca < 10.83, "50/50 variants " + keys[0] + "/" + keys[1] + " chi-square " + ca);
        }
        int[] counts = new int[100];
        for (int i = 0; i < 10000; i++) counts[FeatureFlags.evaluateFlag(new FeatureFlags.Flag("checkout-a"), "u" + i).bucket() % 100]++;
        boolean uniform = true;
        for (int n : counts) uniform &= Math.abs(n - 100) <= 40;
        check(uniform, "100 buckets each get 100 +/- 40 of 10000 subjects");

        System.out.println("FeatureFlagsTest: " + passed + " passed, " + failed + " failed");
        if (failed > 0) System.exit(1);
    }
}
