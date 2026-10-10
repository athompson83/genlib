// SPDX-License-Identifier: Apache-2.0
import java.util.List;

/** Wave 6 vectors (shared with every Genlib language) for http-conditional. */
public final class HttpConditionalTest {
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
        eq(new HttpConditional.EntityTags(false, List.of("\"a\"", "W/\"b\"", "\"c\"")), HttpConditional.parseEtags("\"a\", W/\"b\" ,\"c\""), "parse " + "\"a\", W/\"b\" ,\"c\"");
        eq(new HttpConditional.EntityTags(true, List.of()), HttpConditional.parseEtags("*"), "parse " + "*");
        eq(new HttpConditional.EntityTags(true, List.of()), HttpConditional.parseEtags(" * "), "parse " + " * ");
        eq(new HttpConditional.EntityTags(false, List.of("W/\"x\"", "\"y\"")), HttpConditional.parseEtags("W/\"x\", bogus, \"y\""), "parse " + "W/\"x\", bogus, \"y\"");
        eq(new HttpConditional.EntityTags(false, List.of("\"\"")), HttpConditional.parseEtags("\"\""), "parse " + "\"\"");
        eq(304, HttpConditional.evaluateConditional(new HttpConditional.Request("GET", "\"v2\"", null, null, "\"v2\"", null, null)), "case 0");
        eq(304, HttpConditional.evaluateConditional(new HttpConditional.Request("GET", "\"v2\"", null, null, "W/\"v2\"", null, null)), "case 1");
        eq(304, HttpConditional.evaluateConditional(new HttpConditional.Request("GET", "W/\"v2\"", null, null, "\"v1\", \"v2\"", null, null)), "case 2");
        eq(200, HttpConditional.evaluateConditional(new HttpConditional.Request("GET", "\"v2\"", null, null, "\"v1\"", null, null)), "case 3");
        eq(304, HttpConditional.evaluateConditional(new HttpConditional.Request("HEAD", "\"v2\"", null, null, "*", null, null)), "case 4");
        eq(412, HttpConditional.evaluateConditional(new HttpConditional.Request("PUT", "\"v2\"", null, null, "*", null, null)), "case 5");
        eq(200, HttpConditional.evaluateConditional(new HttpConditional.Request("PUT", null, null, null, "*", null, null)), "case 6");
        eq(200, HttpConditional.evaluateConditional(new HttpConditional.Request("PUT", "\"v2\"", null, "\"v2\"", null, null, null)), "case 7");
        eq(412, HttpConditional.evaluateConditional(new HttpConditional.Request("PUT", "\"v2\"", null, "\"v1\"", null, null, null)), "case 8");
        eq(412, HttpConditional.evaluateConditional(new HttpConditional.Request("PUT", "W/\"v2\"", null, "W/\"v2\"", null, null, null)), "case 9");
        eq(412, HttpConditional.evaluateConditional(new HttpConditional.Request("DELETE", null, null, "*", null, null, null)), "case 10");
        eq(200, HttpConditional.evaluateConditional(new HttpConditional.Request("DELETE", "\"a\"", null, "*", null, null, null)), "case 11");
        eq(304, HttpConditional.evaluateConditional(new HttpConditional.Request("GET", "\"v2\"", 1792567680L, null, null, "Wed, 21 Oct 2026 07:28:00 GMT", null)), "case 12");
        eq(200, HttpConditional.evaluateConditional(new HttpConditional.Request("GET", "\"v2\"", 1792567680L, null, null, "Tue, 20 Oct 2026 07:28:00 GMT", null)), "case 13");
        eq(200, HttpConditional.evaluateConditional(new HttpConditional.Request("GET", "\"v2\"", 1792567680L, null, "\"v1\"", "Wed, 21 Oct 2026 07:28:00 GMT", null)), "case 14");
        eq(200, HttpConditional.evaluateConditional(new HttpConditional.Request("POST", null, 1792567680L, null, null, "Wed, 21 Oct 2026 07:28:00 GMT", null)), "case 15");
        eq(412, HttpConditional.evaluateConditional(new HttpConditional.Request("PUT", null, 1792567680L, null, null, null, "Tue, 20 Oct 2026 07:28:00 GMT")), "case 16");
        eq(200, HttpConditional.evaluateConditional(new HttpConditional.Request("PUT", null, 1792567680L, null, null, null, "Wed, 21 Oct 2026 07:28:00 GMT")), "case 17");
        eq(200, HttpConditional.evaluateConditional(new HttpConditional.Request("GET", null, 1792567680L, null, null, "Wednesday, 21-Oct-26 07:28:00 GMT", null)), "case 18");
        eq(200, HttpConditional.evaluateConditional(new HttpConditional.Request("GET", "\"v2\"", null, null, "v2", null, null)), "case 19");
        eq(200, HttpConditional.evaluateConditional(new HttpConditional.Request("PUT", "\"v2\"", null, "\"v2\"", null, null, "Tue, 20 Oct 2026 07:28:00 GMT")), "case 20");
        eq(1792567680L, HttpConditional.parseHttpDate("Wed, 21 Oct 2026 07:28:00 GMT"), "parse date");
        eq(null, HttpConditional.parseHttpDate("Thu, 21 Oct 2026 07:28:00 GMT"), "wrong weekday");
        eq(null, HttpConditional.parseHttpDate("Wed, 21 Oct 2026 7:28:00 GMT"), "not fixdate");
        eq("Wed, 21 Oct 2026 07:28:00 GMT", HttpConditional.formatHttpDate(1792567680L), "format date");
        check(HttpConditional.weakMatch("W/\"a\"", "\"a\""), "weak match");
        check(!HttpConditional.strongMatch("W/\"a\"", "W/\"a\""), "strong rejects weak");

        System.out.println("HttpConditionalTest: " + passed + " passed, " + failed + " failed");
        if (failed > 0) System.exit(1);
    }
}
