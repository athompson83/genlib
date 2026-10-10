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

private fun kind(expected: SignedCursors.Kind, token: String, secret: ByteArray, now: Long, name: String) {
    try { SignedCursors.decodeCursor(token, secret, now); check(false, "$name did not throw") }
    catch (e: SignedCursors.CursorException) { check(e.kind == expected, "$name expected $expected got ${e.kind}") }
}

fun main() {
    val secret = "0123456789abcdef0123456789abcdef".toByteArray(Charsets.US_ASCII)
    val values = listOf("2026-10-01T12:00:00Z", "42")
    val token = "djEKMTc5MDAwMDAwMAoyMDI2LTEwLTAxVDEyOjAwOjAwWgo0Mg.T2z74zcZhdSIFHTOhu4Wc0MNbTN2t71UXXeQpcLoUUc"
    eq(token, SignedCursors.encodeCursor(values, secret, 1790000000L), "encode vector cursor")
    eq(values, SignedCursors.decodeCursor(token, secret, 1789999999L), "decode before expiry")
    kind(SignedCursors.Kind.EXPIRED, token, secret, 1790000000L, "decode at expiry")
    for (other in listOf('d', 'A', '_')) {
        if (other == token.last()) continue
        kind(SignedCursors.Kind.BAD_SIGNATURE, token.dropLast(1) + other, secret, 0, "tampered last char $other")
    }
    kind(SignedCursors.Kind.BAD_SIGNATURE, token.replace(".T2z", ".U2z"), secret, 0, "tampered first signature char")
    kind(SignedCursors.Kind.MALFORMED, token.replace(".", ""), secret, 0, "no separator")
    kind(SignedCursors.Kind.MALFORMED, "$token=", secret, 0, "padding rejected")
    kind(SignedCursors.Kind.MALFORMED, "." + token.substringAfterLast('.'), secret, 0, "empty body part")
    kind(SignedCursors.Kind.MALFORMED, token.substringBeforeLast('.') + ".", secret, 0, "empty signature part")
    kind(SignedCursors.Kind.MALFORMED, token.replace("djEK", "dj+K"), secret, 0, "non-base64url character")
    val other = "fedcba9876543210fedcba9876543210".toByteArray(Charsets.US_ASCII)
    kind(SignedCursors.Kind.BAD_SIGNATURE, token, other, 0, "different secret")
    val v2 = SignedCursors.encodeCursor(listOf("x"), secret, 5).replace("djEK", "djIK")
    kind(SignedCursors.Kind.BAD_SIGNATURE, v2, secret, 0, "altered body breaks signature")
    val short31 = "0123456789abcdef0123456789abcde".toByteArray(Charsets.US_ASCII)
    throwsIae("encode rejects 31-byte secret") { SignedCursors.encodeCursor(values, short31, 1790000000L) }
    throwsIae("decode rejects 31-byte secret") { SignedCursors.decodeCursor(token, short31, 0) }
    throwsIae("encode empty values") { SignedCursors.encodeCursor(emptyList(), secret, 1) }
    throwsIae("encode newline value") { SignedCursors.encodeCursor(listOf("a\nb"), secret, 1) }
    throwsIae("encode non-positive expiry") { SignedCursors.encodeCursor(listOf("a"), secret, 0) }
    throwsIae("encode 17 values") { SignedCursors.encodeCursor(List(17) { "a" }, secret, 1) }
    eq(listOf("a", ""), SignedCursors.decodeCursor(SignedCursors.encodeCursor(listOf("a", ""), secret, 9), secret, 8), "round trip empty value")

    println("SignedCursorsTest: $passed passed, $failed failed")
    if (failed > 0) exitProcess(1)
}
