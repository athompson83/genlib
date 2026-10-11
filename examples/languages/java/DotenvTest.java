// SPDX-License-Identifier: Apache-2.0
// Generated from the wave-10 capability vectors; edit the vectors, not the literals.

import java.util.List;

public final class DotenvTest {
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
        eqOrd(omap("A", "1", "B", "two"), Dotenv.parseDotenv("A=1\nB=two\n"), "parse 0");
        eqOrd(omap("KEY", "value with spaces"), Dotenv.parseDotenv("# c\n\nexport KEY = value with spaces  # comment\n"), "parse 1");
        eqOrd(omap("Q", "a\nb\t\"c\" \\ $HOME"), Dotenv.parseDotenv("Q=\"a\\nb\\t\\\"c\\\" \\\\ \\$HOME\"\n"), "parse 2");
        eqOrd(omap("S", "raw ${X} \\n"), Dotenv.parseDotenv("S='raw ${X} \\n'\n"), "parse 3");
        eqOrd(omap("M", "line1\nline2", "N", "after"), Dotenv.parseDotenv("M=\"line1\nline2\"\nN=after\n"), "parse 4");
        eqOrd(omap("E", "", "F", ""), Dotenv.parseDotenv("E=\nF= \n"), "parse 5");
        eqOrd(omap("DUP", "2"), Dotenv.parseDotenv("DUP=1\nDUP=2\n"), "parse 6");
        eqOrd(omap("URL", "https://x.test/#frag"), Dotenv.parseDotenv("URL=https://x.test/#frag\n"), "parse 7");
        eqOrd(omap("H", "a#b"), Dotenv.parseDotenv("H=a#b\n"), "parse 8");
        eqOrd(omap("K.x_y", "1"), Dotenv.parseDotenv("K.x_y=1\n"), "parse 9");
        eqOrd(omap("W", "x"), Dotenv.parseDotenv("W=\"x\" # trailing ok\n"), "parse 10");
        eqOrd(omap("CRLF", "1", "NEXT", "2"), Dotenv.parseDotenv("CRLF=1\r\nNEXT=2\r\n"), "parse 11");
        eqOrd(omap("A", "1", "B", "1-x"), Dotenv.parseDotenv("A=1\nB=${A}-x\n", true, omap()), "expand 0");
        eqOrd(omap("B", "env", "A", "1"), Dotenv.parseDotenv("B=${A}\nA=1\n", true, omap("A", "env")), "expand 1");
        eqOrd(omap("P", "fallback", "Q", "d"), Dotenv.parseDotenv("P=${MISSING:-fallback}\nQ=${EMPTY:-d}\n", true, omap("EMPTY", "")), "expand 2");
        eqOrd(omap("S", "${A}", "T", "v", "U", "${A}"), Dotenv.parseDotenv("S='${A}'\nT=\"${A}\"\nU=\"\\${A}\"\n", true, omap("A", "v")), "expand 3");
        throwsMsg(() -> Dotenv.parseDotenv("NOEQUALS\n"), "line ", "invalid 0");
        throwsMsg(() -> Dotenv.parseDotenv("1BAD=x\n"), "line ", "invalid 1");
        throwsMsg(() -> Dotenv.parseDotenv("A='unterminated\n"), "line ", "invalid 2");
        throwsMsg(() -> Dotenv.parseDotenv("A=\"never closed\nB=1\n"), "line ", "invalid 3");
        throwsMsg(() -> Dotenv.parseDotenv("A=\"x\" junk\n"), "line ", "invalid 4");
        throwsMsg(() -> Dotenv.parseDotenv("-K=v\n"), "line ", "invalid 5");
        throwsMsg(() -> Dotenv.parseDotenv("A=1\n\nB\n"), "line 3:", "error names the line");

        System.out.println("DotenvTest: " + passed + " passed, " + failed + " failed");
        if (failed > 0) System.exit(1);
    }
}
