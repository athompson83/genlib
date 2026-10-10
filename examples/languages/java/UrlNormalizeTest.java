// SPDX-License-Identifier: Apache-2.0

/** Wave 6 vectors (shared with every Genlib language) for url-normalize. */
public final class UrlNormalizeTest {
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
        eq("/a/g", UrlNormalize.removeDotSegments("/a/b/c/./../../g"), "dots " + "/a/b/c/./../../g");
        eq("mid/6", UrlNormalize.removeDotSegments("mid/content=5/../6"), "dots " + "mid/content=5/../6");
        eq("/a", UrlNormalize.removeDotSegments("/../a"), "dots " + "/../a");
        eq("/a/b/", UrlNormalize.removeDotSegments("/a/./b/."), "dots " + "/a/./b/.");
        eq("/a/", UrlNormalize.removeDotSegments("/a/b/.."), "dots " + "/a/b/..");
        eq("", UrlNormalize.removeDotSegments("."), "dots " + ".");
        eq("x", UrlNormalize.removeDotSegments("../x"), "dots " + "../x");
        eq("/a//c", UrlNormalize.removeDotSegments("/a//b/../c"), "dots " + "/a//b/../c");
        eq("http://example.com/~user/b?q=%2F", UrlNormalize.normalizeUrl("HTTP://Example.COM:80/%7Euser/./a/../b?q=%2f"), "normalize " + "HTTP://Example.COM:80/%7Euser/./a/../b?q=%2f");
        eq("https://example.com/", UrlNormalize.normalizeUrl("https://example.com"), "normalize " + "https://example.com");
        eq("https://example.com/a%2Fb", UrlNormalize.normalizeUrl("https://example.com:443/a%2Fb#frag"), "normalize " + "https://example.com:443/a%2Fb#frag");
        eq("http://example.com:8080/A/C", UrlNormalize.normalizeUrl("http://example.com:8080/A/B/../C?"), "normalize " + "http://example.com:8080/A/B/../C?");
        eq("https://[2001:db8::1]:8443/x", UrlNormalize.normalizeUrl("https://[2001:DB8::0:1]:8443/x"), "normalize " + "https://[2001:DB8::0:1]:8443/x");
        eq("https://example.com/%E2%82%AC", UrlNormalize.normalizeUrl("https://example.com/%e2%82%ac"), "normalize " + "https://example.com/%e2%82%ac");
        eq("http://example.com/p", UrlNormalize.normalizeUrl("http://example.com:/p"), "normalize " + "http://example.com:/p");
        eq("https://example.com/a%20b", UrlNormalize.normalizeUrl("https://EXAMPLE.com/a%20b"), "normalize " + "https://EXAMPLE.com/a%20b");
        throwsIae(() -> UrlNormalize.normalizeUrl("ftp://example.com/"), "invalid " + "ftp://example.com/");
        throwsIae(() -> UrlNormalize.normalizeUrl("https://user@example.com/"), "invalid " + "https://user@example.com/");
        throwsIae(() -> UrlNormalize.normalizeUrl("https://exa mple.com/"), "invalid " + "https://exa mple.com/");
        throwsIae(() -> UrlNormalize.normalizeUrl("//example.com/"), "invalid " + "//example.com/");
        throwsIae(() -> UrlNormalize.normalizeUrl("https://example.com/%zz"), "invalid " + "https://example.com/%zz");
        throwsIae(() -> UrlNormalize.normalizeUrl("https://example.com:99999/"), "invalid " + "https://example.com:99999/");
        throwsIae(() -> UrlNormalize.normalizeUrl("example.com/path"), "invalid " + "example.com/path");
        throwsIae(() -> UrlNormalize.normalizeUrl("https://[::g]/"), "invalid " + "https://[::g]/");

        System.out.println("UrlNormalizeTest: " + passed + " passed, " + failed + " failed");
        if (failed > 0) System.exit(1);
    }
}
