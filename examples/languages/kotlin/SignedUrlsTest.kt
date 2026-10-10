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

private fun ok(url: String, secret: String, now: Long, name: String) {
    try { SignedUrls.verifyUrl(url, secret, now); check(true, name) }
    catch (e: IllegalArgumentException) { check(false, "$name threw ${e.message}") }
}

private fun kind(expected: SignedUrls.Kind, url: String, secret: String, now: Long, name: String) {
    try { SignedUrls.verifyUrl(url, secret, now); check(false, "$name did not throw") }
    catch (e: SignedUrls.SignedUrlException) { check(e.kind == expected, "$name expected $expected got ${e.kind}") }
}

private fun flip(s: String, i: Int) = s.substring(0, i) + (if (s[i] == 'A') 'B' else 'A') + s.substring(i + 1)

fun main() {
    val secret = "url-signing-secret"
    val cases = listOf(
        Triple("/files/report.pdf?user=42", 1790000000L, "/files/report.pdf?user=42&expires=1790000000&signature=OBOJTlNq3AuDbND_6J4njKkDIXDMxhx0l0PmWaRbfaU"),
        Triple("/download/a%20b.zip", 1790003600L, "/download/a%20b.zip?expires=1790003600&signature=SafK5ZH-apLeaJ-c1dhzp-kyiS3doOR7ywgvr8WDJOo"),
    )
    for ((target, exp, signed) in cases) {
        eq(signed, SignedUrls.signUrl(target, secret, exp), "sign $target")
        ok(signed, secret, exp, "verifies at expires $target")
        ok(signed, secret, exp - 1000, "verifies before expires $target")
        kind(SignedUrls.Kind.EXPIRED, signed, secret, exp + 1, "expired at expires+1 $target")
        kind(SignedUrls.Kind.BAD_SIGNATURE, flip(signed, 2), secret, exp, "path char changed $target")
        kind(SignedUrls.Kind.BAD_SIGNATURE, signed, secret + "x", exp, "different secret $target")
        kind(SignedUrls.Kind.BAD_SIGNATURE, flip(signed, signed.length - 5), secret, exp, "signature char changed $target")
        kind(SignedUrls.Kind.MALFORMED, signed.substringBeforeLast("&signature="), secret, exp, "signature removed $target")
    }
    val first = cases[0].third
    val sig = first.substringAfterLast('=')
    kind(SignedUrls.Kind.MALFORMED, "/f?expires=1790000000&expires=1790000000&signature=$sig", secret, 0, "duplicate expires")
    kind(SignedUrls.Kind.MALFORMED, "/f?expires=17900x0000&signature=$sig", secret, 0, "non-decimal expires")
    kind(SignedUrls.Kind.MALFORMED, "/f?user=1&signature=$sig", secret, 0, "missing expires")
    kind(SignedUrls.Kind.MALFORMED, first + "x", secret, 0, "signature too long")
    kind(SignedUrls.Kind.MALFORMED, "$first#frag", secret, 0, "signature not at end")
    throwsIae("target with expires") { SignedUrls.signUrl("/a?expires=5", secret, 1) }
    throwsIae("target with signature") { SignedUrls.signUrl("/a?x=1&signature=abc", secret, 1) }
    throwsIae("target with fragment") { SignedUrls.signUrl("/a#top", secret, 1) }
    throwsIae("target not a path") { SignedUrls.signUrl("https://x/a", secret, 1) }
    throwsIae("sign empty secret") { SignedUrls.signUrl("/a", "", 1) }
    throwsIae("verify empty secret") { SignedUrls.verifyUrl(first, "", 1) }

    println("SignedUrlsTest: $passed passed, $failed failed")
    if (failed > 0) exitProcess(1)
}
