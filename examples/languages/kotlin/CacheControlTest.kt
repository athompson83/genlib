// SPDX-License-Identifier: Apache-2.0
// Generated from the wave-10 capability vectors; edit the vectors, not the literals.
import kotlin.system.exitProcess

private var passed = 0
private var failed = 0

private fun check(ok: Boolean, name: String) {
    if (ok) passed++ else { failed++; System.err.println("FAIL: $name") }
}

private fun eq(expected: Any?, actual: Any?, name: String) = check(expected == actual, "$name expected <$expected> got <$actual>")

/** Equality plus identical toString, so map entry order is checked too. */
private fun eqOrd(expected: Any?, actual: Any?, name: String) {
    eq(expected, actual, name)
    eq(expected.toString(), actual.toString(), "$name (order)")
}

private fun throwsIae(name: String, block: () -> Unit) {
    try { block(); check(false, "$name did not throw") } catch (e: IllegalArgumentException) { check(true, name) }
}

private fun throwsMsg(prefix: String, name: String, block: () -> Unit) {
    try { block(); check(false, "$name did not throw") } catch (e: IllegalArgumentException) {
        check(e.message?.startsWith(prefix) == true, "$name message <${e.message}>")
    }
}

private fun hex(s: String) = ByteArray(s.length / 2) { s.substring(2 * it, 2 * it + 2).toInt(16).toByte() }

fun main() {
    eqOrd(linkedMapOf<String, Any>("public" to true, "max-age" to 600L), CacheControl.parseCacheControl("public, max-age=600"), "parse 0")
    eqOrd(linkedMapOf<String, Any>("no-store" to true), CacheControl.parseCacheControl("no-store"), "parse 1")
    eqOrd(linkedMapOf<String, Any>("private" to "set-cookie, x-y", "max-age" to 0L), CacheControl.parseCacheControl("private=\"set-cookie, x-y\", max-age=0"), "parse 2")
    eqOrd(linkedMapOf<String, Any>("max-age" to 120L, "s-maxage" to 60L, "must-revalidate" to true), CacheControl.parseCacheControl("max-age=\"120\", s-maxage=60, must-revalidate"), "parse 3")
    eqOrd(linkedMapOf<String, Any>("max-age" to 30L), CacheControl.parseCacheControl("max-age=abc, max-age=30"), "parse 4")
    eqOrd(linkedMapOf<String, Any>("max-age" to 5L), CacheControl.parseCacheControl("MAX-AGE=5, Max-Age=9"), "parse 5")
    eqOrd(linkedMapOf<String, Any>("max-stale" to true), CacheControl.parseCacheControl("max-stale"), "parse 6")
    eqOrd(linkedMapOf<String, Any>("max-stale" to 120L, "min-fresh" to 10L), CacheControl.parseCacheControl("max-stale=120, min-fresh=10"), "parse 7")
    eqOrd(linkedMapOf<String, Any>("stale-while-revalidate" to 30L, "immutable" to true), CacheControl.parseCacheControl("stale-while-revalidate=30, immutable"), "parse 8")
    eqOrd(linkedMapOf<String, Any>("public" to true), CacheControl.parseCacheControl(",, public ,,"), "parse 9")
    eqOrd(linkedMapOf<String, Any>("no-cache" to "Set-Cookie"), CacheControl.parseCacheControl("no-cache=\"Set-Cookie\""), "parse 10")
    eqOrd(linkedMapOf<String, Any>("foo" to "bar", "baz" to "q\"t"), CacheControl.parseCacheControl("foo=bar, baz=\"q\\\"t\""), "parse 11")
    eq("public, max-age=600", CacheControl.formatCacheControl(linkedMapOf<String, Any>("public" to true, "max-age" to 600L)), "format 0")
    eq("private=\"set-cookie, x\", no-cache", CacheControl.formatCacheControl(linkedMapOf<String, Any>("private" to "set-cookie, x", "no-cache" to true)), "format 1")
    eq("s-maxage=0, stale-if-error=86400", CacheControl.formatCacheControl(linkedMapOf<String, Any>("s-maxage" to 0L, "stale-if-error" to 86400L)), "format 2")
    eq(600L, CacheControl.cacheFreshness(CacheControl.parseCacheControl("max-age=600"), false), "freshness 0")
    eq(60L, CacheControl.cacheFreshness(CacheControl.parseCacheControl("max-age=600, s-maxage=60"), true), "freshness 1")
    eq(600L, CacheControl.cacheFreshness(CacheControl.parseCacheControl("max-age=600, s-maxage=60"), false), "freshness 2")
    eq(0L, CacheControl.cacheFreshness(CacheControl.parseCacheControl("no-store, max-age=600"), false), "freshness 3")
    eq(0L, CacheControl.cacheFreshness(CacheControl.parseCacheControl("no-cache"), true), "freshness 4")
    eq(null, CacheControl.cacheFreshness(CacheControl.parseCacheControl("public"), false), "freshness 5")
    throwsIae("invalid 0") { CacheControl.parseCacheControl("private=\"unterminated") }

    println("CacheControlTest: $passed passed, $failed failed")
    if (failed > 0) exitProcess(1)
}
