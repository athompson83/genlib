// SPDX-License-Identifier: Apache-2.0
// Generated from the wave-10 capability vectors; edit the vectors, not the literals.

import java.util.List;

public final class GlobMatchTest {
    private static int passed;
    private static int failed;

    private static void check(boolean ok, String name) {
        if (ok) passed++; else { failed++; System.err.println("FAIL: " + name); }
    }

    private static void eq(Object expected, Object actual, String name) {
        check(java.util.Objects.equals(expected, actual), name + " expected <" + expected + "> got <" + actual + ">");
    }

    /** Equality plus identical toString, so map entry order is checked too. */
    private static void eqOrd(Object expected, Object actual, String name) {
        eq(expected, actual, name);
        eq(String.valueOf(expected), String.valueOf(actual), name + " (order)");
    }

    private static void throwsIae(Runnable r, String name) {
        try { r.run(); check(false, name + " did not throw"); }
        catch (IllegalArgumentException e) { check(true, name); }
    }

    private static void throwsMsg(Runnable r, String prefix, String name) {
        try { r.run(); check(false, name + " did not throw"); }
        catch (IllegalArgumentException e) { check(e.getMessage() != null && e.getMessage().startsWith(prefix), name + " message <" + e.getMessage() + ">"); }
    }

    private static java.util.LinkedHashMap<String, String> omap(String... kv) {
        java.util.LinkedHashMap<String, String> m = new java.util.LinkedHashMap<>();
        for (int i = 0; i < kv.length; i += 2) m.put(kv[i], kv[i + 1]);
        return m;
    }

    private static java.util.LinkedHashMap<String, Object> omapObj(Object... kv) {
        java.util.LinkedHashMap<String, Object> m = new java.util.LinkedHashMap<>();
        for (int i = 0; i < kv.length; i += 2) m.put((String) kv[i], kv[i + 1]);
        return m;
    }

    private static byte[] hex(String s) {
        byte[] b = new byte[s.length() / 2];
        for (int i = 0; i < b.length; i++) b[i] = (byte) Integer.parseInt(s.substring(2 * i, 2 * i + 2), 16);
        return b;
    }

    public static void main(String[] args) {
        eq(true, GlobMatch.globMatch("*.js", "a.js", false), "match 0");
        eq(false, GlobMatch.globMatch("*.js", "a/b.js", false), "match 1");
        eq(true, GlobMatch.globMatch("**/*.js", "a/b/c.js", false), "match 2");
        eq(true, GlobMatch.globMatch("**/*.js", "c.js", false), "match 3");
        eq(true, GlobMatch.globMatch("src/**", "src", false), "match 4");
        eq(true, GlobMatch.globMatch("src/**", "src/a/b.ts", false), "match 5");
        eq(true, GlobMatch.globMatch("src/**/test/*.py", "src/test/x.py", false), "match 6");
        eq(true, GlobMatch.globMatch("src/**/test/*.py", "src/a/b/test/x.py", false), "match 7");
        eq(true, GlobMatch.globMatch("a?c", "abc", false), "match 8");
        eq(false, GlobMatch.globMatch("a?c", "a/c", false), "match 9");
        eq(true, GlobMatch.globMatch("[a-c]x", "bx", false), "match 10");
        eq(false, GlobMatch.globMatch("[!a-c]x", "bx", false), "match 11");
        eq(true, GlobMatch.globMatch("[!a-c]x", "dx", false), "match 12");
        eq(true, GlobMatch.globMatch("[^0-9]", "x", false), "match 13");
        eq(true, GlobMatch.globMatch("[]a]", "a", false), "match 14");
        eq(true, GlobMatch.globMatch("[]a]", "]", false), "match 15");
        eq(true, GlobMatch.globMatch("*.{js,ts}", "x.ts", false), "match 16");
        eq(false, GlobMatch.globMatch("*.{js,ts}", "x.tsx", false), "match 17");
        eq(true, GlobMatch.globMatch("{src,lib}/**/*.go", "lib/x/y.go", false), "match 18");
        eq(true, GlobMatch.globMatch(".*", ".env", false), "match 19");
        eq(false, GlobMatch.globMatch("*", ".env", false), "match 20");
        eq(true, GlobMatch.globMatch("*", ".env", true), "match 21");
        eq(false, GlobMatch.globMatch("**/x", ".git/x", false), "match 22");
        eq(true, GlobMatch.globMatch("**/x", ".git/x", true), "match 23");
        eq(true, GlobMatch.globMatch("a\\*b", "a*b", false), "match 24");
        eq(false, GlobMatch.globMatch("a\\*b", "axb", false), "match 25");
        eq(true, GlobMatch.globMatch("*", "", false), "match 26");
        eq(true, GlobMatch.globMatch("**", "a/b/c", false), "match 27");
        eq(true, GlobMatch.globMatch("a/**/b", "a/b", false), "match 28");
        eq(true, GlobMatch.globMatch("a/**/b", "a/x/y/b", false), "match 29");
        eq(false, GlobMatch.globMatch("*.txt", "notes.TXT", false), "match 30");
        eq(false, GlobMatch.globMatch("[a-z]*.md", "Readme.md", false), "match 31");
        eq(false, GlobMatch.globMatch("docs/*", "docs/a/b", false), "match 32");
        eq(true, GlobMatch.globMatch("?", "\u00E9", false), "match 33");
        throwsIae(() -> GlobMatch.globMatch("[abc", "x"), "invalid 0");
        throwsIae(() -> GlobMatch.globMatch("{a,b", "x"), "invalid 1");
        throwsIae(() -> GlobMatch.globMatch("a{b{c}}", "x"), "invalid 2");
        throwsIae(() -> GlobMatch.globMatch("", "x"), "invalid 3");
        throwsIae(() -> GlobMatch.globMatch("x\\", "x"), "invalid 4");
        eq(List.of("a.js", "x/b.js"), GlobMatch.globFilter("**/*.js", List.of("a.js", "a.ts", "x/b.js", ".h/c.js")), "filter");
        eq(List.of("a.js", "x/b.js", ".h/c.js"), GlobMatch.globFilter("**/*.js", List.of("a.js", "a.ts", "x/b.js", ".h/c.js"), true), "filter dot");
        eq(false, GlobMatch.globMatch("a*a*a*a*a*a*a*a*a*a*a*b", "a".repeat(60)), "no exponential blowup in a segment");
        eq(false, GlobMatch.globMatch("**/**/**/**/**/**/**/**/z", "a/".repeat(40) + "b"), "no exponential blowup across segments");
        eq(true, GlobMatch.globMatch("[\uD83D\uDE00-\uD83D\uDE4F]", "\uD83D\uDE03"), "class range by code point");

        System.out.println("GlobMatchTest: " + passed + " passed, " + failed + " failed");
        if (failed > 0) System.exit(1);
    }
}
