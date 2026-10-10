// SPDX-License-Identifier: Apache-2.0
import kotlin.system.exitProcess

// Wave 6 vectors (shared with every Genlib language) for cookies.
private var passed = 0
private var failed = 0

private fun check(ok: Boolean, name: String) {
    if (ok) passed++ else { failed++; System.err.println("FAIL: $name") }
}

private fun eq(expected: Any?, actual: Any?, name: String) = check(expected == actual, "$name expected <$expected> got <$actual>")

private fun throwsIae(name: String, block: () -> Unit) {
    try { block(); check(false, "$name did not throw") } catch (e: IllegalArgumentException) { check(true, name) }
}

fun main() {
    eq("sid=abc123; Path=/; Secure; HttpOnly; SameSite=Lax", Cookies.serializeCookie("sid", "abc123", Cookies.Options(path = "/", secure = true, httpOnly = true, sameSite = "Lax")), "serialize " + "sid")
    eq("__Host-session=x.y.z; Max-Age=3600; Path=/; Secure; HttpOnly; SameSite=Strict", Cookies.serializeCookie("__Host-session", "x.y.z", Cookies.Options(maxAge = 3600L, path = "/", secure = true, httpOnly = true, sameSite = "Strict")), "serialize " + "__Host-session")
    eq("theme=dark; Max-Age=0; Expires=Wed, 21 Oct 2026 07:28:00 GMT; Domain=example.com; Path=/app", Cookies.serializeCookie("theme", "dark", Cookies.Options(maxAge = 0L, expires = 1792567680L, domain = "Example.COM", path = "/app")), "serialize " + "theme")
    eq("embed=1; Secure; SameSite=None; Partitioned", Cookies.serializeCookie("embed", "1", Cookies.Options(secure = true, sameSite = "None", partitioned = true)), "serialize " + "embed")
    eq("empty=", Cookies.serializeCookie("empty", "", Cookies.Options()), "serialize " + "empty")
    throwsIae("invalid 0") { Cookies.serializeCookie("bad name", "v", Cookies.Options()) }
    throwsIae("invalid 1") { Cookies.serializeCookie("n", "a;b", Cookies.Options()) }
    throwsIae("invalid 2") { Cookies.serializeCookie("n", "a b", Cookies.Options()) }
    throwsIae("invalid 3") { Cookies.serializeCookie("n", "a\"b", Cookies.Options()) }
    throwsIae("invalid 4") { Cookies.serializeCookie("n", "v", Cookies.Options(sameSite = "None")) }
    throwsIae("invalid 5") { Cookies.serializeCookie("__Secure-x", "v", Cookies.Options()) }
    throwsIae("invalid 6") { Cookies.serializeCookie("__Host-x", "v", Cookies.Options(path = "/a", secure = true)) }
    throwsIae("invalid 7") { Cookies.serializeCookie("__Host-x", "v", Cookies.Options(domain = "example.com", path = "/", secure = true)) }
    throwsIae("invalid 8") { Cookies.serializeCookie("n", "v", Cookies.Options(path = "relative")) }
    throwsIae("invalid 9") { Cookies.serializeCookie("n", "v", Cookies.Options(sameSite = "lax")) }
    throwsIae("invalid 10") { Cookies.serializeCookie("n", "v", Cookies.Options(partitioned = true)) }
    throwsIae("invalid 11") { Cookies.serializeCookie("n", "v", Cookies.Options(maxAge = -1L)) }
    throwsIae("invalid 12") { Cookies.serializeCookie("", "v", Cookies.Options()) }
    eq(listOf<Pair<String, String>>("sid" to "abc", "theme" to "dark"), Cookies.parseCookieHeader("sid=abc; theme=dark"), "parse " + "sid=abc; theme=dark")
    eq(listOf<Pair<String, String>>("a" to "1", "b" to "2", "c" to "quoted value", "d" to "=x"), Cookies.parseCookieHeader(" a = 1 ;b=2;; c=\"quoted value\" ;flag;d==x"), "parse " + " a = 1 ;b=2;; c=\"quoted value\" ;flag;d==x")
    eq(listOf<Pair<String, String>>("a" to "1", "a" to "2"), Cookies.parseCookieHeader("a=1; a=2"), "parse " + "a=1; a=2")
    eq(listOf<Pair<String, String>>(), Cookies.parseCookieHeader(""), "parse " + "")
    eq("a=b", Cookies.serializeCookie("a", "b"), "no options")

    println("CookiesTest: $passed passed, $failed failed")
    if (failed > 0) exitProcess(1)
}
