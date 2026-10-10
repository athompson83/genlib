// SPDX-License-Identifier: Apache-2.0
import kotlin.system.exitProcess

// Wave 6 vectors (shared with every Genlib language) for http-conditional.
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
    eq(HttpConditional.EntityTags.Tags(listOf("\"a\"", "W/\"b\"", "\"c\"")), HttpConditional.parseEtags("\"a\", W/\"b\" ,\"c\""), "parse " + "\"a\", W/\"b\" ,\"c\"")
    eq(HttpConditional.EntityTags.Wildcard, HttpConditional.parseEtags("*"), "parse " + "*")
    eq(HttpConditional.EntityTags.Wildcard, HttpConditional.parseEtags(" * "), "parse " + " * ")
    eq(HttpConditional.EntityTags.Tags(listOf("W/\"x\"", "\"y\"")), HttpConditional.parseEtags("W/\"x\", bogus, \"y\""), "parse " + "W/\"x\", bogus, \"y\"")
    eq(HttpConditional.EntityTags.Tags(listOf("\"\"")), HttpConditional.parseEtags("\"\""), "parse " + "\"\"")
    eq(304, HttpConditional.evaluateConditional(HttpConditional.Request(method = "GET", etag = "\"v2\"", ifNoneMatch = "\"v2\"")), "case 0")
    eq(304, HttpConditional.evaluateConditional(HttpConditional.Request(method = "GET", etag = "\"v2\"", ifNoneMatch = "W/\"v2\"")), "case 1")
    eq(304, HttpConditional.evaluateConditional(HttpConditional.Request(method = "GET", etag = "W/\"v2\"", ifNoneMatch = "\"v1\", \"v2\"")), "case 2")
    eq(200, HttpConditional.evaluateConditional(HttpConditional.Request(method = "GET", etag = "\"v2\"", ifNoneMatch = "\"v1\"")), "case 3")
    eq(304, HttpConditional.evaluateConditional(HttpConditional.Request(method = "HEAD", etag = "\"v2\"", ifNoneMatch = "*")), "case 4")
    eq(412, HttpConditional.evaluateConditional(HttpConditional.Request(method = "PUT", etag = "\"v2\"", ifNoneMatch = "*")), "case 5")
    eq(200, HttpConditional.evaluateConditional(HttpConditional.Request(method = "PUT", ifNoneMatch = "*")), "case 6")
    eq(200, HttpConditional.evaluateConditional(HttpConditional.Request(method = "PUT", etag = "\"v2\"", ifMatch = "\"v2\"")), "case 7")
    eq(412, HttpConditional.evaluateConditional(HttpConditional.Request(method = "PUT", etag = "\"v2\"", ifMatch = "\"v1\"")), "case 8")
    eq(412, HttpConditional.evaluateConditional(HttpConditional.Request(method = "PUT", etag = "W/\"v2\"", ifMatch = "W/\"v2\"")), "case 9")
    eq(412, HttpConditional.evaluateConditional(HttpConditional.Request(method = "DELETE", ifMatch = "*")), "case 10")
    eq(200, HttpConditional.evaluateConditional(HttpConditional.Request(method = "DELETE", etag = "\"a\"", ifMatch = "*")), "case 11")
    eq(304, HttpConditional.evaluateConditional(HttpConditional.Request(method = "GET", etag = "\"v2\"", lastModified = 1792567680L, ifModifiedSince = "Wed, 21 Oct 2026 07:28:00 GMT")), "case 12")
    eq(200, HttpConditional.evaluateConditional(HttpConditional.Request(method = "GET", etag = "\"v2\"", lastModified = 1792567680L, ifModifiedSince = "Tue, 20 Oct 2026 07:28:00 GMT")), "case 13")
    eq(200, HttpConditional.evaluateConditional(HttpConditional.Request(method = "GET", etag = "\"v2\"", lastModified = 1792567680L, ifNoneMatch = "\"v1\"", ifModifiedSince = "Wed, 21 Oct 2026 07:28:00 GMT")), "case 14")
    eq(200, HttpConditional.evaluateConditional(HttpConditional.Request(method = "POST", lastModified = 1792567680L, ifModifiedSince = "Wed, 21 Oct 2026 07:28:00 GMT")), "case 15")
    eq(412, HttpConditional.evaluateConditional(HttpConditional.Request(method = "PUT", lastModified = 1792567680L, ifUnmodifiedSince = "Tue, 20 Oct 2026 07:28:00 GMT")), "case 16")
    eq(200, HttpConditional.evaluateConditional(HttpConditional.Request(method = "PUT", lastModified = 1792567680L, ifUnmodifiedSince = "Wed, 21 Oct 2026 07:28:00 GMT")), "case 17")
    eq(200, HttpConditional.evaluateConditional(HttpConditional.Request(method = "GET", lastModified = 1792567680L, ifModifiedSince = "Wednesday, 21-Oct-26 07:28:00 GMT")), "case 18")
    eq(200, HttpConditional.evaluateConditional(HttpConditional.Request(method = "GET", etag = "\"v2\"", ifNoneMatch = "v2")), "case 19")
    eq(200, HttpConditional.evaluateConditional(HttpConditional.Request(method = "PUT", etag = "\"v2\"", ifMatch = "\"v2\"", ifUnmodifiedSince = "Tue, 20 Oct 2026 07:28:00 GMT")), "case 20")
    eq(1792567680L, HttpConditional.parseHttpDate("Wed, 21 Oct 2026 07:28:00 GMT"), "parse date")
    eq(null, HttpConditional.parseHttpDate("Thu, 21 Oct 2026 07:28:00 GMT"), "wrong weekday")
    eq(null, HttpConditional.parseHttpDate("Wed, 21 Oct 2026 7:28:00 GMT"), "not fixdate")
    eq("Wed, 21 Oct 2026 07:28:00 GMT", HttpConditional.formatHttpDate(1792567680L), "format date")
    check(HttpConditional.weakMatch("W/\"a\"", "\"a\""), "weak match")
    check(!HttpConditional.strongMatch("W/\"a\"", "W/\"a\""), "strong rejects weak")

    println("HttpConditionalTest: $passed passed, $failed failed")
    if (failed > 0) exitProcess(1)
}
