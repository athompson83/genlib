// SPDX-License-Identifier: Apache-2.0
import kotlin.system.exitProcess

private var passed = 0
private var failed = 0

private fun check(ok: Boolean, name: String) {
    if (ok) passed++ else { failed++; System.err.println("FAIL: $name") }
}

private fun eq(expected: Any, actual: Any?, name: String) = check(expected == actual, "$name expected <$expected> got <$actual>")

private fun throwsIae(name: String, block: () -> Unit) {
    try { block(); check(false, "$name did not throw") } catch (e: IllegalArgumentException) { check(true, name) }
}

private fun ok(header: String, body: String, secret: String, now: Long, name: String) {
    try { WebhookSignature.verifyWebhook(header, body, secret, now); check(true, name) }
    catch (e: IllegalArgumentException) { check(false, "$name threw ${e.message}") }
}

private fun kind(expected: WebhookSignature.Kind, header: String, body: String, secret: String, now: Long, name: String) {
    try { WebhookSignature.verifyWebhook(header, body, secret, now); check(false, "$name did not throw") }
    catch (e: WebhookSignature.WebhookException) { check(e.kind == expected, "$name expected $expected got ${e.kind}") }
}

fun main() {
    val secret = "whsec_test_secret_0123456789abcd"
    val body = "{\"id\":\"evt_1\",\"amount\":1999}"
    val t = 1790000000L
    val sig = "ad4e559e93bea390aff65b8c1eaec615bbdf3df1ef1d1c908b03299c20cf44a6"
    val header = "t=1790000000,v1=$sig"
    eq(header, WebhookSignature.signWebhook(secret, t, body), "sign vector header")
    ok(header, body, secret, t, "verifies at t")
    ok(header, body, secret, t + 300, "verifies at t+300")
    ok(header, body, secret, t - 300, "verifies at t-300")
    kind(WebhookSignature.Kind.EXPIRED, header, body, secret, t + 301, "expired at t+301")
    kind(WebhookSignature.Kind.EXPIRED, header, body, secret, t - 301, "expired at t-301")
    kind(WebhookSignature.Kind.BAD_SIGNATURE, header, body.replace("1999", "1998"), secret, t, "one body byte changed")
    kind(WebhookSignature.Kind.BAD_SIGNATURE, header, body, secret + "x", t, "different secret")
    kind(WebhookSignature.Kind.BAD_SIGNATURE, header.dropLast(1) + "7", body, secret, t, "one hex digit changed")
    ok("t=1790000000,v1=" + "0".repeat(64) + ",v1=$sig", body, secret, t, "extra zero v1 before the right one")
    ok(" t = 1790000000 , v0=abc, v1 = $sig ", body, secret, t, "whitespace tolerant, other schemes ignored")
    kind(WebhookSignature.Kind.MALFORMED, "v1=$sig", body, secret, t, "missing t")
    kind(WebhookSignature.Kind.MALFORMED, "t=1790000000,t=1790000000,v1=$sig", body, secret, t, "two t")
    kind(WebhookSignature.Kind.MALFORMED, "t=1790000000,v1=" + sig.replace('a', 'g'), body, secret, t, "non-hex v1")
    kind(WebhookSignature.Kind.MALFORMED, "t=1790000000,v1=" + sig.uppercase(), body, secret, t, "upper-case v1")
    kind(WebhookSignature.Kind.MALFORMED, "t=1790000000", body, secret, t, "no v1")
    kind(WebhookSignature.Kind.MALFORMED, "t=17900000x0,v1=$sig", body, secret, t, "non-decimal t")
    kind(WebhookSignature.Kind.MALFORMED, "garbage", body, secret, t, "no pairs")
    kind(WebhookSignature.Kind.EXPIRED, header, body, secret, Long.MIN_VALUE, "far past now does not overflow")
    throwsIae("sign empty secret") { WebhookSignature.signWebhook("", t, body) }
    throwsIae("verify empty secret") { WebhookSignature.verifyWebhook(header, body, "", t) }
    throwsIae("negative tolerance") { WebhookSignature.verifyWebhook(header, body, secret, t, -1) }

    println("WebhookSignatureTest: $passed passed, $failed failed")
    if (failed > 0) exitProcess(1)
}
