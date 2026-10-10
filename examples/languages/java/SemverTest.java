// SPDX-License-Identifier: Apache-2.0
import java.util.ArrayList;
import java.util.List;

public final class SemverTest {
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
        List<String> expected = List.of("0.9.9", "1.0.0-alpha", "1.0.0-alpha.1", "1.0.0-alpha.beta", "1.0.0-beta",
            "1.0.0-beta.2", "1.0.0-beta.11", "1.0.0-rc.1", "1.0.0", "1.0.0+build.5", "2.0.0");
        List<String> input = List.of("1.0.0-beta.11", "2.0.0", "1.0.0", "1.0.0-alpha.beta", "1.0.0-rc.1", "0.9.9",
            "1.0.0-alpha", "1.0.0+build.5", "1.0.0-beta.2", "1.0.0-alpha.1", "1.0.0-beta");
        List<String> sorted = new ArrayList<>(input);
        sorted.sort(Semver::compare); // List.sort is a stable merge sort
        eq(expected, sorted, "sort vector");
        eq(0, Semver.compare("1.0.0", "1.0.0+build.5"), "build metadata ignored");
        eq(-1, Semver.compare("1.0.0-alpha", "1.0.0"), "prerelease below release");
        eq(1, Semver.compare("1.0.0-alpha.beta", "1.0.0-alpha.1"), "alphanumeric above numeric");
        eq(1, Semver.compare("1.10.0", "1.9.0"), "numeric minor");

        Semver.Version v = Semver.parse("1.2.3-rc.1+build.7");
        eq(List.of("rc", "1"), v.prerelease(), "parse prerelease");
        eq("build.7", v.build(), "parse build");
        eq("1.2.3-rc.1+build.7", v.toString(), "toString round trip");
        for (String bad : new String[] {"1.2", "01.2.3", "1.02.3", "1.2.3-01", "1.2.3-", "1.2.3+", "v1.2.3", " 1.2.3", "1.2.3-a..b", "1.2.3.4"}) {
            throwsIae(() -> Semver.parse(bad), "parse rejects '" + bad + "'");
        }

        Object[][] satisfies = {
            {"1.2.3", "^1.0.0", true}, {"2.0.0", "^1.0.0", false}, {"0.2.5", "^0.2.3", true}, {"0.3.0", "^0.2.3", false},
            {"0.0.4", "^0.0.3", false}, {"1.2.9", "~1.2.3", true}, {"1.3.0", "~1.2.3", false}, {"1.5.0", "1.x", true},
            {"1.5.0", ">=1.2.0 <1.5.0", false}, {"1.4.9", ">=1.2.0 <1.5.0", true}, {"3.1.0", "^1.0.0 || ^3.0.0", true},
            {"1.2.3-beta.2", "^1.2.3-beta.1", true}, {"1.2.4-beta.1", "^1.2.3-beta.1", false}, {"1.3.0-rc.1", "^1.2.0", false},
            {"1.2.0", "1.0.0 - 1.2.0", true}, {"1.2.1", "1.0.0 - 1.2.0", false}, {"0.0.1", "*", true}, {"2.0.0", "<=1.x", false},
        };
        for (Object[] s : satisfies) {
            eq(s[2], Semver.satisfies((String) s[0], (String) s[1]), "satisfies " + s[0] + " '" + s[1] + "'");
        }
        check(Semver.satisfies("1.9.9", "<=1.x"), "<=1.x includes 1.9.9");
        check(Semver.satisfies("1.2.3", ">= 1.2.3"), "space after operator");
        check(Semver.satisfies("1.2.3", "=1.2.3") && !Semver.satisfies("1.2.4", "1.2.3"), "exact versions");
        check(!Semver.satisfies("1.0.0", ">1.x") && Semver.satisfies("2.0.0", ">1.x"), ">1.x desugars to >=2.0.0");
        check(Semver.satisfies("1.2.0", "~1.2") && !Semver.satisfies("1.3.0", "~1.2"), "~1.2");
        check(Semver.satisfies("0.2.9", "^0.2") && !Semver.satisfies("0.3.0", "^0.2"), "^0.2");
        check(!Semver.satisfies("1.0.0", "<1.x") && !Semver.satisfies("0.0.0", ">*"), "empty x-ranges");
        check(Semver.satisfies("1.9.0", "1.0 - 1") && !Semver.satisfies("2.0.0", "1.0 - 1"), "partial hyphen range");
        check(Semver.satisfies("0.1.0", ""), "empty range is any");
        throwsIae(() -> Semver.satisfies("1.0.0", "^1.0.0.0"), "invalid range");
        throwsIae(() -> Semver.satisfies("1.0", "*"), "invalid version");

        System.out.println("SemverTest: " + passed + " passed, " + failed + " failed");
        if (failed > 0) System.exit(1);
    }
}
