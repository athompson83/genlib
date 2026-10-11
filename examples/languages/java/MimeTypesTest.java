// SPDX-License-Identifier: Apache-2.0
// Generated from the wave-10 capability vectors; edit the vectors, not the literals.

import java.util.List;

public final class MimeTypesTest {
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
        eq("text/html", MimeTypes.mimeTypeFor("index.html"), "type_for 0");
        eq("text/javascript", MimeTypes.mimeTypeFor("APP.JS"), "type_for 1");
        eq("application/json", MimeTypes.mimeTypeFor("data.json"), "type_for 2");
        eq("image/jpeg", MimeTypes.mimeTypeFor("photo.JPG"), "type_for 3");
        eq("application/gzip", MimeTypes.mimeTypeFor("x.tar.gz"), "type_for 4");
        eq("video/webm", MimeTypes.mimeTypeFor("video.webm"), "type_for 5");
        eq("font/woff2", MimeTypes.mimeTypeFor("font.woff2"), "type_for 6");
        eq("application/vnd.openxmlformats-officedocument.wordprocessingml.document", MimeTypes.mimeTypeFor("doc.docx"), "type_for 7");
        eq(null, MimeTypes.mimeTypeFor("noext"), "type_for 8");
        eq("application/json", MimeTypes.mimeTypeFor("json"), "type_for 9");
        eq("image/png", MimeTypes.mimeTypeFor(".png"), "type_for 10");
        eq(null, MimeTypes.mimeTypeFor("a.unknown"), "type_for 11");
        eq("text/css", MimeTypes.mimeTypeFor("style.css"), "type_for 12");
        eq("application/xml", MimeTypes.mimeTypeFor("feed.xml"), "type_for 13");
        eq("image/svg+xml", MimeTypes.mimeTypeFor("pic.svg"), "type_for 14");
        eq("jpg", MimeTypes.extensionFor("image/jpeg"), "extension_for 0");
        eq("html", MimeTypes.extensionFor("text/html; charset=UTF-8"), "extension_for 1");
        eq("json", MimeTypes.extensionFor("Application/JSON"), "extension_for 2");
        eq("js", MimeTypes.extensionFor("text/javascript"), "extension_for 3");
        eq(null, MimeTypes.extensionFor("application/x-unknown"), "extension_for 4");
        eq("mp4", MimeTypes.extensionFor("video/mp4"), "extension_for 5");
        eq("text/html; charset=utf-8", MimeTypes.contentTypeFor("a.html"), "content_type 0");
        eq("application/json; charset=utf-8", MimeTypes.contentTypeFor("a.json"), "content_type 1");
        eq("image/png", MimeTypes.contentTypeFor("a.png"), "content_type 2");
        eq("image/svg+xml; charset=utf-8", MimeTypes.contentTypeFor("a.svg"), "content_type 3");
        eq("application/octet-stream", MimeTypes.contentTypeFor("a.bin"), "content_type 4");
        eq("application/octet-stream", MimeTypes.contentTypeFor("a.zzz"), "content_type 5");
        eq("text/markdown; charset=utf-8", MimeTypes.contentTypeFor("readme.md"), "content_type 6");

        System.out.println("MimeTypesTest: " + passed + " passed, " + failed + " failed");
        if (failed > 0) System.exit(1);
    }
}
