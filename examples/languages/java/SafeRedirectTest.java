// SPDX-License-Identifier: Apache-2.0
import java.util.List;

public final class SafeRedirectTest {
    private static int passed;
    private static int failed;

    private static void check(boolean ok, String name) {
        if (ok) passed++; else { failed++; System.err.println("FAIL: " + name); }
    }

    private static void eq(Object expected, Object actual, String name) {
        check(expected.equals(actual), name + " expected <" + expected + "> got <" + actual + ">");
    }

    private static void throwsIae(Runnable r, String name) {
        try { r.run(); check(false, name + " did not throw"); }
        catch (IllegalArgumentException e) { check(true, name); }
    }

    public static void main(String[] args) {
        List<String> allowed = List.of("https://app.example.com", "https://accounts.example.com:8443");
        String[][] cases = {
            {"/dashboard?tab=1#top", "/dashboard?tab=1#top"}, {"//evil.com/x", "/"}, {"/\\evil.com", "/"},
            {"https://app.example.com/settings", "https://app.example.com/settings"}, {"HTTPS://APP.EXAMPLE.COM:443/a", "HTTPS://APP.EXAMPLE.COM:443/a"},
            {"https://app.example.com.evil.com/", "/"}, {"https://user@app.example.com/", "/"}, {"http://app.example.com/", "/"},
            {"https://accounts.example.com:8443/login", "https://accounts.example.com:8443/login"}, {"https://accounts.example.com/login", "/"},
            {"javascript:alert(1)", "/"}, {"/ok path", "/"}, {"dashboard", "/"}, {"", "/"}, {"/\t/evil.com", "/"}, {"https://app.example.com:99999/", "/"},
        };
        for (String[] c : cases) eq(c[1], SafeRedirect.safeRedirect(c[0], allowed, "/"), "redirect " + c[0]);
        eq("/home", SafeRedirect.safeRedirect("https://evil.com/", allowed, "/home"), "custom fallback");
        eq("/", SafeRedirect.safeRedirect(null, allowed), "null target");
        eq("/", SafeRedirect.safeRedirect("https://app..example.com/", allowed), "double dot host");
        eq("/", SafeRedirect.safeRedirect("/" + "a".repeat(2048), allowed), "too long");
        throwsIae(() -> SafeRedirect.safeRedirect("/", null), "null allowlist");

        System.out.println("SafeRedirectTest: " + passed + " passed, " + failed + " failed");
        if (failed > 0) System.exit(1);
    }
}
