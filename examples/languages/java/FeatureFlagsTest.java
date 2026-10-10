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

    public static void main(String[] args) {
        eq(new FeatureFlags.Result(false, "excluded", 4063, null), FeatureFlags.evaluateFlag(new FeatureFlags.Flag("new-checkout").rolloutPercent(25.0), "user-1"), "flag case 0");
        eq(new FeatureFlags.Result(true, "rollout", 1682, null), FeatureFlags.evaluateFlag(new FeatureFlags.Flag("new-checkout").rolloutPercent(25.0), "user-2"), "flag case 1");
        eq(new FeatureFlags.Result(false, "excluded", 9301, null), FeatureFlags.evaluateFlag(new FeatureFlags.Flag("new-checkout").rolloutPercent(25.0), "user-3"), "flag case 2");
        eq(new FeatureFlags.Result(false, "excluded", 9926, null), FeatureFlags.evaluateFlag(new FeatureFlags.Flag("new-checkout").rolloutPercent(25.0), "user-42"), "flag case 3");
        eq(new FeatureFlags.Result(false, "excluded", 2919, null), FeatureFlags.evaluateFlag(new FeatureFlags.Flag("new-checkout").rolloutPercent(25.0), "alice@example.com"), "flag case 4");
        eq(new FeatureFlags.Result(false, "deny", 4063, null), FeatureFlags.evaluateFlag(new FeatureFlags.Flag("new-checkout").allow("user-2").deny("user-1").rolloutPercent(25.0), "user-1"), "flag case 5");
        eq(new FeatureFlags.Result(true, "allow", 1682, null), FeatureFlags.evaluateFlag(new FeatureFlags.Flag("new-checkout").allow("user-2").deny("user-1").rolloutPercent(25.0), "user-2"), "flag case 6");
        eq(new FeatureFlags.Result(false, "disabled", 3546, null), FeatureFlags.evaluateFlag(new FeatureFlags.Flag("beta").enabled(false).allow("vip"), "vip"), "flag case 7");
        eq(new FeatureFlags.Result(false, "excluded", 6646, null), FeatureFlags.evaluateFlag(new FeatureFlags.Flag("banner").rolloutPercent(0.0), "user-1"), "flag case 8");
        eq(new FeatureFlags.Result(true, "rollout", 6646, null), FeatureFlags.evaluateFlag(new FeatureFlags.Flag("banner").rolloutPercent(100.0), "user-1"), "flag case 9");
        eq(new FeatureFlags.Result(false, "excluded", 7598, null), FeatureFlags.evaluateFlag(new FeatureFlags.Flag("banner").rolloutPercent(12.34), "user-9"), "flag case 10");
        eq(new FeatureFlags.Result(true, "rollout", 4196, "monthly-first"), FeatureFlags.evaluateFlag(new FeatureFlags.Flag("pricing-test").variant("control", 50).variant("annual-first", 30).variant("monthly-first", 20), "u1"), "flag case 11");
        eq(new FeatureFlags.Result(true, "rollout", 7053, "control"), FeatureFlags.evaluateFlag(new FeatureFlags.Flag("pricing-test").variant("control", 50).variant("annual-first", 30).variant("monthly-first", 20), "u2"), "flag case 12");
        eq(new FeatureFlags.Result(true, "rollout", 9434, "annual-first"), FeatureFlags.evaluateFlag(new FeatureFlags.Flag("pricing-test").variant("control", 50).variant("annual-first", 30).variant("monthly-first", 20), "u3"), "flag case 13");
        eq(new FeatureFlags.Result(true, "rollout", 1339, "annual-first"), FeatureFlags.evaluateFlag(new FeatureFlags.Flag("pricing-test").variant("control", 50).variant("annual-first", 30).variant("monthly-first", 20), "u4"), "flag case 14");
        eq(new FeatureFlags.Result(true, "rollout", 3720, "annual-first"), FeatureFlags.evaluateFlag(new FeatureFlags.Flag("pricing-test").variant("control", 50).variant("annual-first", 30).variant("monthly-first", 20), "u5"), "flag case 15");
        eq(new FeatureFlags.Result(true, "rollout", 9874, "control"), FeatureFlags.evaluateFlag(new FeatureFlags.Flag("pricing-test").variant("control", 50).variant("annual-first", 30).variant("monthly-first", 20), "\u00FCn\u00EFcode"), "flag case 16");
        throwsIae(() -> FeatureFlags.evaluateFlag(new FeatureFlags.Flag("bad key"), "u"), "flag invalid 0");
        throwsIae(() -> FeatureFlags.evaluateFlag(new FeatureFlags.Flag("k").rolloutPercent(101.0), "u"), "flag invalid 1");
        throwsIae(() -> FeatureFlags.evaluateFlag(new FeatureFlags.Flag("k").rolloutPercent(12.345), "u"), "flag invalid 2");
        throwsIae(() -> FeatureFlags.evaluateFlag(new FeatureFlags.Flag("k").variant("a", 0), "u"), "flag invalid 3");
        throwsIae(() -> FeatureFlags.evaluateFlag(new FeatureFlags.Flag(""), "u"), "flag invalid 4");

        System.out.println("FeatureFlagsTest: " + passed + " passed, " + failed + " failed");
        if (failed > 0) System.exit(1);
    }
}
