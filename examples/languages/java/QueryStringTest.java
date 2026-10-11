// SPDX-License-Identifier: Apache-2.0
// Generated from the wave-10 capability vectors; edit the vectors, not the literals.

import java.util.List;

public final class QueryStringTest {
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
        eq(List.<QueryString.Param>of(new QueryString.Param("a", "1"), new QueryString.Param("b", "2")), QueryString.parseQuery("a=1&b=2"), "parse 0");
        eq(List.<QueryString.Param>of(new QueryString.Param("a", "1"), new QueryString.Param("a", "2")), QueryString.parseQuery("?a=1&a=2"), "parse 1");
        eq(List.<QueryString.Param>of(new QueryString.Param("x", "a b c")), QueryString.parseQuery("x=a+b%20c"), "parse 2");
        eq(List.<QueryString.Param>of(new QueryString.Param("e", "\u20AC")), QueryString.parseQuery("e=%E2%82%AC"), "parse 3");
        eq(List.<QueryString.Param>of(new QueryString.Param("bad", "%zz"), new QueryString.Param("ok", "1")), QueryString.parseQuery("bad=%zz&ok=1"), "parse 4");
        eq(List.<QueryString.Param>of(new QueryString.Param("%", "")), QueryString.parseQuery("%"), "parse 5");
        eq(List.<QueryString.Param>of(new QueryString.Param("a", "")), QueryString.parseQuery("&&a&&"), "parse 6");
        eq(List.<QueryString.Param>of(new QueryString.Param("k", "v=w")), QueryString.parseQuery("k=v=w"), "parse 7");
        eq(List.<QueryString.Param>of(new QueryString.Param("", "v")), QueryString.parseQuery("=v"), "parse 8");
        eq(List.<QueryString.Param>of(new QueryString.Param("emoji", "\uD83D\uDE00")), QueryString.parseQuery("emoji=%F0%9F%98%80"), "parse 9");
        eq(List.<QueryString.Param>of(new QueryString.Param("invalid", "\uFFFD")), QueryString.parseQuery("invalid=%FF"), "parse 10");
        eq(List.<QueryString.Param>of(new QueryString.Param("plus", "+")), QueryString.parseQuery("plus=%2B"), "parse 11");
        eq("a=1&b=x+y", QueryString.stringifyQuery(List.<QueryString.Param>of(new QueryString.Param("a", "1"), new QueryString.Param("b", "x y"))), "stringify 0");
        eq("q=a%26b%3Dc&e=%E2%82%AC", QueryString.stringifyQuery(List.<QueryString.Param>of(new QueryString.Param("q", "a&b=c"), new QueryString.Param("e", "\u20AC"))), "stringify 1");
        eq("*-._=%7E%21%27%28%29", QueryString.stringifyQuery(List.<QueryString.Param>of(new QueryString.Param("*-._", "~!'()"))), "stringify 2");
        eq("k=&=v", QueryString.stringifyQuery(List.<QueryString.Param>of(new QueryString.Param("k", ""), new QueryString.Param("", "v"))), "stringify 3");
        eq(List.<String>of("1", "3"), QueryString.getAll(QueryString.parseQuery("a=1&b=2&a=3"), "a"), "getAll 0");

        System.out.println("QueryStringTest: " + passed + " passed, " + failed + " failed");
        if (failed > 0) System.exit(1);
    }
}
