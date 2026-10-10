// SPDX-License-Identifier: Apache-2.0

/** Wave 6 vectors (shared with every Genlib language) for string-similarity. */
public final class StringSimilarityTest {
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
        final double eps = 1e-12;
        eq(3, StringSimilarity.levenshtein("kitten", "sitting"), "levenshtein " + "kitten" + "/" + "sitting");
        eq(3, StringSimilarity.damerauOsa("kitten", "sitting"), "osa " + "kitten" + "/" + "sitting");
        check(Math.abs(0.746031746031746 - StringSimilarity.jaro("kitten", "sitting")) < eps, "jaro " + "kitten" + "/" + "sitting");
        check(Math.abs(0.746031746031746 - StringSimilarity.jaroWinkler("kitten", "sitting")) < eps, "jaroWinkler " + "kitten" + "/" + "sitting");
        check(Math.abs(0.5714285714285714 - StringSimilarity.similarityRatio("kitten", "sitting")) < eps, "ratio " + "kitten" + "/" + "sitting");
        eq(2, StringSimilarity.levenshtein("flaw", "lawn"), "levenshtein " + "flaw" + "/" + "lawn");
        eq(2, StringSimilarity.damerauOsa("flaw", "lawn"), "osa " + "flaw" + "/" + "lawn");
        check(Math.abs(0.8333333333333334 - StringSimilarity.jaro("flaw", "lawn")) < eps, "jaro " + "flaw" + "/" + "lawn");
        check(Math.abs(0.8333333333333334 - StringSimilarity.jaroWinkler("flaw", "lawn")) < eps, "jaroWinkler " + "flaw" + "/" + "lawn");
        check(Math.abs(0.5 - StringSimilarity.similarityRatio("flaw", "lawn")) < eps, "ratio " + "flaw" + "/" + "lawn");
        eq(0, StringSimilarity.levenshtein("", ""), "levenshtein " + "" + "/" + "");
        eq(0, StringSimilarity.damerauOsa("", ""), "osa " + "" + "/" + "");
        check(Math.abs(1.0 - StringSimilarity.jaro("", "")) < eps, "jaro " + "" + "/" + "");
        check(Math.abs(1.0 - StringSimilarity.jaroWinkler("", "")) < eps, "jaroWinkler " + "" + "/" + "");
        check(Math.abs(1.0 - StringSimilarity.similarityRatio("", "")) < eps, "ratio " + "" + "/" + "");
        eq(3, StringSimilarity.levenshtein("", "abc"), "levenshtein " + "" + "/" + "abc");
        eq(3, StringSimilarity.damerauOsa("", "abc"), "osa " + "" + "/" + "abc");
        check(Math.abs(0.0 - StringSimilarity.jaro("", "abc")) < eps, "jaro " + "" + "/" + "abc");
        check(Math.abs(0.0 - StringSimilarity.jaroWinkler("", "abc")) < eps, "jaroWinkler " + "" + "/" + "abc");
        check(Math.abs(0.0 - StringSimilarity.similarityRatio("", "abc")) < eps, "ratio " + "" + "/" + "abc");
        eq(0, StringSimilarity.levenshtein("abc", "abc"), "levenshtein " + "abc" + "/" + "abc");
        eq(0, StringSimilarity.damerauOsa("abc", "abc"), "osa " + "abc" + "/" + "abc");
        check(Math.abs(1.0 - StringSimilarity.jaro("abc", "abc")) < eps, "jaro " + "abc" + "/" + "abc");
        check(Math.abs(1.0 - StringSimilarity.jaroWinkler("abc", "abc")) < eps, "jaroWinkler " + "abc" + "/" + "abc");
        check(Math.abs(1.0 - StringSimilarity.similarityRatio("abc", "abc")) < eps, "ratio " + "abc" + "/" + "abc");
        eq(3, StringSimilarity.levenshtein("ca", "abc"), "levenshtein " + "ca" + "/" + "abc");
        eq(3, StringSimilarity.damerauOsa("ca", "abc"), "osa " + "ca" + "/" + "abc");
        check(Math.abs(0.0 - StringSimilarity.jaro("ca", "abc")) < eps, "jaro " + "ca" + "/" + "abc");
        check(Math.abs(0.0 - StringSimilarity.jaroWinkler("ca", "abc")) < eps, "jaroWinkler " + "ca" + "/" + "abc");
        check(Math.abs(0.0 - StringSimilarity.similarityRatio("ca", "abc")) < eps, "ratio " + "ca" + "/" + "abc");
        eq(2, StringSimilarity.levenshtein("MARTHA", "MARHTA"), "levenshtein " + "MARTHA" + "/" + "MARHTA");
        eq(1, StringSimilarity.damerauOsa("MARTHA", "MARHTA"), "osa " + "MARTHA" + "/" + "MARHTA");
        check(Math.abs(0.9444444444444445 - StringSimilarity.jaro("MARTHA", "MARHTA")) < eps, "jaro " + "MARTHA" + "/" + "MARHTA");
        check(Math.abs(0.9611111111111111 - StringSimilarity.jaroWinkler("MARTHA", "MARHTA")) < eps, "jaroWinkler " + "MARTHA" + "/" + "MARHTA");
        check(Math.abs(0.6666666666666667 - StringSimilarity.similarityRatio("MARTHA", "MARHTA")) < eps, "ratio " + "MARTHA" + "/" + "MARHTA");
        eq(4, StringSimilarity.levenshtein("DIXON", "DICKSONX"), "levenshtein " + "DIXON" + "/" + "DICKSONX");
        eq(4, StringSimilarity.damerauOsa("DIXON", "DICKSONX"), "osa " + "DIXON" + "/" + "DICKSONX");
        check(Math.abs(0.7666666666666666 - StringSimilarity.jaro("DIXON", "DICKSONX")) < eps, "jaro " + "DIXON" + "/" + "DICKSONX");
        check(Math.abs(0.8133333333333332 - StringSimilarity.jaroWinkler("DIXON", "DICKSONX")) < eps, "jaroWinkler " + "DIXON" + "/" + "DICKSONX");
        check(Math.abs(0.5 - StringSimilarity.similarityRatio("DIXON", "DICKSONX")) < eps, "ratio " + "DIXON" + "/" + "DICKSONX");
        eq(2, StringSimilarity.levenshtein("DWAYNE", "DUANE"), "levenshtein " + "DWAYNE" + "/" + "DUANE");
        eq(2, StringSimilarity.damerauOsa("DWAYNE", "DUANE"), "osa " + "DWAYNE" + "/" + "DUANE");
        check(Math.abs(0.8222222222222223 - StringSimilarity.jaro("DWAYNE", "DUANE")) < eps, "jaro " + "DWAYNE" + "/" + "DUANE");
        check(Math.abs(0.8400000000000001 - StringSimilarity.jaroWinkler("DWAYNE", "DUANE")) < eps, "jaroWinkler " + "DWAYNE" + "/" + "DUANE");
        check(Math.abs(0.6666666666666667 - StringSimilarity.similarityRatio("DWAYNE", "DUANE")) < eps, "ratio " + "DWAYNE" + "/" + "DUANE");
        eq(1, StringSimilarity.levenshtein("caf\u00E9", "cafe"), "levenshtein " + "caf\u00E9" + "/" + "cafe");
        eq(1, StringSimilarity.damerauOsa("caf\u00E9", "cafe"), "osa " + "caf\u00E9" + "/" + "cafe");
        check(Math.abs(0.8333333333333334 - StringSimilarity.jaro("caf\u00E9", "cafe")) < eps, "jaro " + "caf\u00E9" + "/" + "cafe");
        check(Math.abs(0.8833333333333334 - StringSimilarity.jaroWinkler("caf\u00E9", "cafe")) < eps, "jaroWinkler " + "caf\u00E9" + "/" + "cafe");
        check(Math.abs(0.75 - StringSimilarity.similarityRatio("caf\u00E9", "cafe")) < eps, "ratio " + "caf\u00E9" + "/" + "cafe");
        eq(1, StringSimilarity.levenshtein("na\u00EFve", "naive"), "levenshtein " + "na\u00EFve" + "/" + "naive");
        eq(1, StringSimilarity.damerauOsa("na\u00EFve", "naive"), "osa " + "na\u00EFve" + "/" + "naive");
        check(Math.abs(0.8666666666666667 - StringSimilarity.jaro("na\u00EFve", "naive")) < eps, "jaro " + "na\u00EFve" + "/" + "naive");
        check(Math.abs(0.8933333333333333 - StringSimilarity.jaroWinkler("na\u00EFve", "naive")) < eps, "jaroWinkler " + "na\u00EFve" + "/" + "naive");
        check(Math.abs(0.8 - StringSimilarity.similarityRatio("na\u00EFve", "naive")) < eps, "ratio " + "na\u00EFve" + "/" + "naive");
        eq(2, StringSimilarity.levenshtein("\uD83D\uDE42ab", "ab\uD83D\uDE42"), "levenshtein " + "\uD83D\uDE42ab" + "/" + "ab\uD83D\uDE42");
        eq(2, StringSimilarity.damerauOsa("\uD83D\uDE42ab", "ab\uD83D\uDE42"), "osa " + "\uD83D\uDE42ab" + "/" + "ab\uD83D\uDE42");
        check(Math.abs(0.0 - StringSimilarity.jaro("\uD83D\uDE42ab", "ab\uD83D\uDE42")) < eps, "jaro " + "\uD83D\uDE42ab" + "/" + "ab\uD83D\uDE42");
        check(Math.abs(0.0 - StringSimilarity.jaroWinkler("\uD83D\uDE42ab", "ab\uD83D\uDE42")) < eps, "jaroWinkler " + "\uD83D\uDE42ab" + "/" + "ab\uD83D\uDE42");
        check(Math.abs(0.33333333333333337 - StringSimilarity.similarityRatio("\uD83D\uDE42ab", "ab\uD83D\uDE42")) < eps, "ratio " + "\uD83D\uDE42ab" + "/" + "ab\uD83D\uDE42");
        eq(2, StringSimilarity.levenshtein("JELLYFISH", "SMELLYFISH"), "levenshtein " + "JELLYFISH" + "/" + "SMELLYFISH");
        eq(2, StringSimilarity.damerauOsa("JELLYFISH", "SMELLYFISH"), "osa " + "JELLYFISH" + "/" + "SMELLYFISH");
        check(Math.abs(0.8962962962962964 - StringSimilarity.jaro("JELLYFISH", "SMELLYFISH")) < eps, "jaro " + "JELLYFISH" + "/" + "SMELLYFISH");
        check(Math.abs(0.8962962962962964 - StringSimilarity.jaroWinkler("JELLYFISH", "SMELLYFISH")) < eps, "jaroWinkler " + "JELLYFISH" + "/" + "SMELLYFISH");
        check(Math.abs(0.8 - StringSimilarity.similarityRatio("JELLYFISH", "SMELLYFISH")) < eps, "ratio " + "JELLYFISH" + "/" + "SMELLYFISH");

        System.out.println("StringSimilarityTest: " + passed + " passed, " + failed + " failed");
        if (failed > 0) System.exit(1);
    }
}
