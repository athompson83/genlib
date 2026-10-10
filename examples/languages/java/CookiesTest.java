// SPDX-License-Identifier: Apache-2.0
import java.util.List;
import java.util.Map;

/** Wave 6 vectors (shared with every Genlib language) for cookies. */
public final class CookiesTest {
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
        eq("sid=abc123; Path=/; Secure; HttpOnly; SameSite=Lax", Cookies.serializeCookie("sid", "abc123", new Cookies.Options().path("/").secure(true).httpOnly(true).sameSite("Lax")), "serialize " + "sid");
        eq("__Host-session=x.y.z; Max-Age=3600; Path=/; Secure; HttpOnly; SameSite=Strict", Cookies.serializeCookie("__Host-session", "x.y.z", new Cookies.Options().maxAge(3600L).path("/").secure(true).httpOnly(true).sameSite("Strict")), "serialize " + "__Host-session");
        eq("theme=dark; Max-Age=0; Expires=Wed, 21 Oct 2026 07:28:00 GMT; Domain=example.com; Path=/app", Cookies.serializeCookie("theme", "dark", new Cookies.Options().maxAge(0L).expires(1792567680L).domain("Example.COM").path("/app")), "serialize " + "theme");
        eq("embed=1; Secure; SameSite=None; Partitioned", Cookies.serializeCookie("embed", "1", new Cookies.Options().secure(true).sameSite("None").partitioned(true)), "serialize " + "embed");
        eq("empty=", Cookies.serializeCookie("empty", "", new Cookies.Options()), "serialize " + "empty");
        throwsIae(() -> Cookies.serializeCookie("bad name", "v", new Cookies.Options()), "invalid 0");
        throwsIae(() -> Cookies.serializeCookie("n", "a;b", new Cookies.Options()), "invalid 1");
        throwsIae(() -> Cookies.serializeCookie("n", "a b", new Cookies.Options()), "invalid 2");
        throwsIae(() -> Cookies.serializeCookie("n", "a\"b", new Cookies.Options()), "invalid 3");
        throwsIae(() -> Cookies.serializeCookie("n", "v", new Cookies.Options().sameSite("None")), "invalid 4");
        throwsIae(() -> Cookies.serializeCookie("__Secure-x", "v", new Cookies.Options()), "invalid 5");
        throwsIae(() -> Cookies.serializeCookie("__Host-x", "v", new Cookies.Options().path("/a").secure(true)), "invalid 6");
        throwsIae(() -> Cookies.serializeCookie("__Host-x", "v", new Cookies.Options().domain("example.com").path("/").secure(true)), "invalid 7");
        throwsIae(() -> Cookies.serializeCookie("n", "v", new Cookies.Options().path("relative")), "invalid 8");
        throwsIae(() -> Cookies.serializeCookie("n", "v", new Cookies.Options().sameSite("lax")), "invalid 9");
        throwsIae(() -> Cookies.serializeCookie("n", "v", new Cookies.Options().partitioned(true)), "invalid 10");
        throwsIae(() -> Cookies.serializeCookie("n", "v", new Cookies.Options().maxAge(-1L)), "invalid 11");
        throwsIae(() -> Cookies.serializeCookie("", "v", new Cookies.Options()), "invalid 12");
        eq(List.of(Map.entry("sid", "abc"), Map.entry("theme", "dark")), Cookies.parseCookieHeader("sid=abc; theme=dark"), "parse " + "sid=abc; theme=dark");
        eq(List.of(Map.entry("a", "1"), Map.entry("b", "2"), Map.entry("c", "quoted value"), Map.entry("d", "=x")), Cookies.parseCookieHeader(" a = 1 ;b=2;; c=\"quoted value\" ;flag;d==x"), "parse " + " a = 1 ;b=2;; c=\"quoted value\" ;flag;d==x");
        eq(List.of(Map.entry("a", "1"), Map.entry("a", "2")), Cookies.parseCookieHeader("a=1; a=2"), "parse " + "a=1; a=2");
        eq(List.of(), Cookies.parseCookieHeader(""), "parse " + "");
        eq("a=b", Cookies.serializeCookie("a", "b"), "no options");

        System.out.println("CookiesTest: " + passed + " passed, " + failed + " failed");
        if (failed > 0) System.exit(1);
    }
}
