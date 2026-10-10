// SPDX-License-Identifier: Apache-2.0
import kotlin.system.exitProcess

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
    val allowed = listOf("https://app.example.com", "https://accounts.example.com:8443")
    val cases = listOf(
        "/dashboard?tab=1#top" to "/dashboard?tab=1#top", "//evil.com/x" to "/", "/\\evil.com" to "/",
        "https://app.example.com/settings" to "https://app.example.com/settings", "HTTPS://APP.EXAMPLE.COM:443/a" to "HTTPS://APP.EXAMPLE.COM:443/a",
        "https://app.example.com.evil.com/" to "/", "https://user@app.example.com/" to "/", "http://app.example.com/" to "/",
        "https://accounts.example.com:8443/login" to "https://accounts.example.com:8443/login", "https://accounts.example.com/login" to "/",
        "javascript:alert(1)" to "/", "/ok path" to "/", "dashboard" to "/", "" to "/", "/\t/evil.com" to "/", "https://app.example.com:99999/" to "/",
    )
    for ((target, want) in cases) eq(want, SafeRedirect.safeRedirect(target, allowed, "/"), "redirect $target")
    eq("/home", SafeRedirect.safeRedirect("https://evil.com/", allowed, "/home"), "custom fallback")
    eq("/", SafeRedirect.safeRedirect(null, allowed), "null target")
    eq("/", SafeRedirect.safeRedirect("https://app..example.com/", allowed), "double dot host")
    eq("/", SafeRedirect.safeRedirect("/" + "a".repeat(2048), allowed), "too long")

    println("SafeRedirectTest: $passed passed, $failed failed")
    if (failed > 0) exitProcess(1)
}
