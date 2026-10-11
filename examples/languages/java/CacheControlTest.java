// SPDX-License-Identifier: Apache-2.0
// Generated from the wave-10 capability vectors; edit the vectors, not the literals.

import java.util.List;

public final class CacheControlTest {
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
        eqOrd(omapObj("public", Boolean.TRUE, "max-age", 600L), CacheControl.parseCacheControl("public, max-age=600"), "parse 0");
        eqOrd(omapObj("no-store", Boolean.TRUE), CacheControl.parseCacheControl("no-store"), "parse 1");
        eqOrd(omapObj("private", "set-cookie, x-y", "max-age", 0L), CacheControl.parseCacheControl("private=\"set-cookie, x-y\", max-age=0"), "parse 2");
        eqOrd(omapObj("max-age", 120L, "s-maxage", 60L, "must-revalidate", Boolean.TRUE), CacheControl.parseCacheControl("max-age=\"120\", s-maxage=60, must-revalidate"), "parse 3");
        eqOrd(omapObj("max-age", 30L), CacheControl.parseCacheControl("max-age=abc, max-age=30"), "parse 4");
        eqOrd(omapObj("max-age", 5L), CacheControl.parseCacheControl("MAX-AGE=5, Max-Age=9"), "parse 5");
        eqOrd(omapObj("max-stale", Boolean.TRUE), CacheControl.parseCacheControl("max-stale"), "parse 6");
        eqOrd(omapObj("max-stale", 120L, "min-fresh", 10L), CacheControl.parseCacheControl("max-stale=120, min-fresh=10"), "parse 7");
        eqOrd(omapObj("stale-while-revalidate", 30L, "immutable", Boolean.TRUE), CacheControl.parseCacheControl("stale-while-revalidate=30, immutable"), "parse 8");
        eqOrd(omapObj("public", Boolean.TRUE), CacheControl.parseCacheControl(",, public ,,"), "parse 9");
        eqOrd(omapObj("no-cache", "Set-Cookie"), CacheControl.parseCacheControl("no-cache=\"Set-Cookie\""), "parse 10");
        eqOrd(omapObj("foo", "bar", "baz", "q\"t"), CacheControl.parseCacheControl("foo=bar, baz=\"q\\\"t\""), "parse 11");
        eq("public, max-age=600", CacheControl.formatCacheControl(omapObj("public", Boolean.TRUE, "max-age", 600L)), "format 0");
        eq("private=\"set-cookie, x\", no-cache", CacheControl.formatCacheControl(omapObj("private", "set-cookie, x", "no-cache", Boolean.TRUE)), "format 1");
        eq("s-maxage=0, stale-if-error=86400", CacheControl.formatCacheControl(omapObj("s-maxage", 0L, "stale-if-error", 86400L)), "format 2");
        eq(600L, CacheControl.cacheFreshness(CacheControl.parseCacheControl("max-age=600"), false), "freshness 0");
        eq(60L, CacheControl.cacheFreshness(CacheControl.parseCacheControl("max-age=600, s-maxage=60"), true), "freshness 1");
        eq(600L, CacheControl.cacheFreshness(CacheControl.parseCacheControl("max-age=600, s-maxage=60"), false), "freshness 2");
        eq(0L, CacheControl.cacheFreshness(CacheControl.parseCacheControl("no-store, max-age=600"), false), "freshness 3");
        eq(0L, CacheControl.cacheFreshness(CacheControl.parseCacheControl("no-cache"), true), "freshness 4");
        eq(null, CacheControl.cacheFreshness(CacheControl.parseCacheControl("public"), false), "freshness 5");
        throwsIae(() -> CacheControl.parseCacheControl("private=\"unterminated"), "invalid 0");

        System.out.println("CacheControlTest: " + passed + " passed, " + failed + " failed");
        if (failed > 0) System.exit(1);
    }
}
