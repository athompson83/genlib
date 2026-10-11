// SPDX-License-Identifier: Apache-2.0
// Generated from the wave-10 capability vectors; edit the vectors, not the literals.

import java.util.List;

public final class ContentDispositionTest {
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
        eq("attachment; filename=\"report.pdf\"", ContentDisposition.buildContentDisposition("report.pdf", false), "build 0");
        eq("attachment; filename=\"caf_.pdf\"; filename*=UTF-8''caf%C3%A9.pdf", ContentDisposition.buildContentDisposition("caf\u00E9.pdf", false), "build 1");
        eq("attachment; filename=\"_etc_passwd\"", ContentDisposition.buildContentDisposition("../etc/passwd", false), "build 2");
        eq("attachment; filename=\"a_b_c.txt\"", ContentDisposition.buildContentDisposition("a\"b\\c.txt", false), "build 3");
        eq("attachment; filename=\"hidden\"", ContentDisposition.buildContentDisposition("  .hidden  ", false), "build 4");
        eq("attachment; filename=\"download\"", ContentDisposition.buildContentDisposition("", false), "build 5");
        eq("inline; filename=\"___.txt\"; filename*=UTF-8''%E6%97%A5%E6%9C%AC%E8%AA%9E.txt", ContentDisposition.buildContentDisposition("\u65E5\u672C\u8A9E.txt", true), "build 6");
        eq("attachment; filename=\"tab_here.csv\"", ContentDisposition.buildContentDisposition("tab\there.csv", false), "build 7");
        eq("attachment; filename=\"100% sure+ok.txt\"", ContentDisposition.buildContentDisposition("100% sure+ok.txt", false), "build 8");
        eqOrd(new ContentDisposition.Disposition("attachment", "x.txt", omap("filename", "x.txt")), ContentDisposition.parseContentDisposition("attachment; filename=\"x.txt\""), "parse 0");
        eqOrd(new ContentDisposition.Disposition("attachment", "x.txt", omap("filename", "x.txt")), ContentDisposition.parseContentDisposition("attachment; filename=x.txt"), "parse 1");
        eqOrd(new ContentDisposition.Disposition("inline", null, omap()), ContentDisposition.parseContentDisposition("INLINE"), "parse 2");
        eqOrd(new ContentDisposition.Disposition("attachment", "\u20AC rates.txt", omap("filename", "\u20AC rates.txt")), ContentDisposition.parseContentDisposition("attachment; filename=\"a.txt\"; filename*=UTF-8''%E2%82%AC%20rates.txt"), "parse 3");
        eqOrd(new ContentDisposition.Disposition("attachment", "\u00A3 rates.txt", omap("filename", "\u00A3 rates.txt")), ContentDisposition.parseContentDisposition("attachment; filename*=iso-8859-1'en'%A3%20rates.txt"), "parse 4");
        eqOrd(new ContentDisposition.Disposition("attachment", "_.._evil.exe", omap("filename", "..\\..\\evil.exe")), ContentDisposition.parseContentDisposition("attachment; filename=\"..\\\\..\\\\evil.exe\""), "parse 5");
        eqOrd(new ContentDisposition.Disposition("attachment", "_quoted_.txt", omap("filename", "\"quoted\".txt", "size", "100")), ContentDisposition.parseContentDisposition("attachment; filename=\"\\\"quoted\\\".txt\"; size=100"), "parse 6");
        eqOrd(new ContentDisposition.Disposition("form-data", "photo.jpg", omap("name", "file", "filename", "photo.jpg")), ContentDisposition.parseContentDisposition("form-data; name=\"file\"; filename=\"photo.jpg\""), "parse 7");
        throwsIae(() -> ContentDisposition.parseContentDisposition("; filename=x"), "invalid 0");
        throwsIae(() -> ContentDisposition.parseContentDisposition("attachment; filename=\"open"), "invalid 1");
        throwsIae(() -> ContentDisposition.parseContentDisposition("attachment; filename*=UTF-8''%G0"), "invalid 2");
        throwsIae(() -> ContentDisposition.parseContentDisposition("attachment filename=x"), "invalid 3");
        eq("download", ContentDisposition.sanitizeFilename(" .. "), "sanitize empty");
        eq("attachment; filename=\"_.txt\"; filename*=UTF-8''%F0%9F%98%80.txt", ContentDisposition.buildContentDisposition("\uD83D\uDE00.txt"), "astral code point is one fallback char");

        System.out.println("ContentDispositionTest: " + passed + " passed, " + failed + " failed");
        if (failed > 0) System.exit(1);
    }
}
