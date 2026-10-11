// SPDX-License-Identifier: Apache-2.0
// Generated from the wave-11 capability vectors; edit the vectors, not the literals.

import java.util.ArrayList;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.function.IntSupplier;

public final class HtmlEscapeTest {
    private static final Object NULL = null;
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

    private static LinkedHashMap<String, String> omap(String... kv) {
        LinkedHashMap<String, String> m = new LinkedHashMap<>();
        for (int i = 0; i < kv.length; i += 2) m.put(kv[i], kv[i + 1]);
        return m;
    }

    private static LinkedHashMap<String, Object> omapObj(Object... kv) {
        LinkedHashMap<String, Object> m = new LinkedHashMap<>();
        for (int i = 0; i < kv.length; i += 2) m.put((String) kv[i], kv[i + 1]);
        return m;
    }

    @SuppressWarnings("unchecked")
    private static LinkedHashMap<String, LinkedHashMap<String, String>> iniData(Object... kv) {
        LinkedHashMap<String, LinkedHashMap<String, String>> m = new LinkedHashMap<>();
        for (int i = 0; i < kv.length; i += 2) m.put((String) kv[i], (LinkedHashMap<String, String>) kv[i + 1]);
        return m;
    }

    private static ArrayList<Object> lst(Object... xs) { return new ArrayList<>(Arrays.asList(xs)); }

    private static byte[] hex(String s) {
        byte[] b = new byte[s.length() / 2];
        for (int i = 0; i < b.length; i++) b[i] = (byte) Integer.parseInt(s.substring(2 * i, 2 * i + 2), 16);
        return b;
    }

    private static String toHex(byte[] b) {
        StringBuilder sb = new StringBuilder();
        for (byte x : b) sb.append(String.format("%02x", x & 0xFF));
        return sb.toString();
    }

    /** Deterministic test byte source that cycles through the given bytes (passgen_ref.byte_source). */
    private static IntSupplier bytes(String h) {
        byte[] b = hex(h);
        int[] i = {0};
        return () -> b[i[0]++ % b.length] & 0xFF;
    }

    public static void main(String[] args) {
        eq("&lt;a href=&quot;x&quot;&gt;", HtmlEscape.escapeHtml("<a href=\"x\">"), "escape 0");
        eq("Tom &amp; Jerry&#39;s", HtmlEscape.escapeHtml("Tom & Jerry's"), "escape 1");
        eq("plain", HtmlEscape.escapeHtml("plain"), "escape 2");
        eq("", HtmlEscape.escapeHtml(""), "escape 3");
        eq("<p>", HtmlEscape.unescapeHtml("&lt;p&gt;"), "unescape 0");
        eq("\u00A9 \u00A9 \u00A9", HtmlEscape.unescapeHtml("&#169; &#xA9; &#XA9;"), "unescape 1");
        eq("&amp;", HtmlEscape.unescapeHtml("&amp;amp;"), "unescape 2");
        eq("&amp no semicolon", HtmlEscape.unescapeHtml("&amp no semicolon"), "unescape 3");
        eq("&bogus; &AMP;", HtmlEscape.unescapeHtml("&bogus; &AMP;"), "unescape 4");
        eq("\u20AC \u0178", HtmlEscape.unescapeHtml("&#128; &#x9F;"), "unescape 5");
        eq("\uFFFD \uFFFD \uFFFD", HtmlEscape.unescapeHtml("&#0; &#xD800; &#1114112;"), "unescape 6");
        eq("\u20AC5 \u2014 \u2026", HtmlEscape.unescapeHtml("&euro;5 &mdash; &hellip;"), "unescape 7");
        eq("&#99999999999;", HtmlEscape.unescapeHtml("&#99999999999;"), "unescape 8");
        eq("Hello world", HtmlEscape.stripTags("<p>Hello <b>world</b></p>"), "strip 0");
        eq("ab", HtmlEscape.stripTags("a<script>alert(1)</script>b"), "strip 1");
        eq("x & y", HtmlEscape.stripTags("<STYLE>p{}</STYLE>x &amp; y"), "strip 2");
        eq("1 < 2 and 3>1", HtmlEscape.stripTags("1 < 2 and 3>1"), "strip 3");
        eq("t", HtmlEscape.stripTags("<!-- c -->t"), "strip 4");
        eq("unclosed ", HtmlEscape.stripTags("unclosed <script>evil"), "strip 5");
        eq("<a href=\"x\">", HtmlEscape.unescapeHtml(HtmlEscape.escapeHtml("<a href=\"x\">")), "round trip 0");
        eq("Tom & Jerry's", HtmlEscape.unescapeHtml(HtmlEscape.escapeHtml("Tom & Jerry's")), "round trip 1");
        eq("plain", HtmlEscape.unescapeHtml(HtmlEscape.escapeHtml("plain")), "round trip 2");
        eq("", HtmlEscape.unescapeHtml(HtmlEscape.escapeHtml("")), "round trip 3");

        System.out.println("HtmlEscapeTest: " + passed + " passed, " + failed + " failed");
        if (failed > 0) System.exit(1);
    }
}
