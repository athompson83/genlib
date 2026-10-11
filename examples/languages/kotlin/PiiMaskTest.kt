// SPDX-License-Identifier: Apache-2.0
// Generated from the wave-11 capability vectors; edit the vectors, not the literals.
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

private fun omap(vararg kv: Pair<String, Any?>): LinkedHashMap<String, Any?> = linkedMapOf(*kv)

private fun lst(vararg xs: Any?): ArrayList<Any?> = arrayListOf(*xs)

private fun hex(s: String) = ByteArray(s.length / 2) { s.substring(2 * it, 2 * it + 2).toInt(16).toByte() }

private fun toHex(b: ByteArray) = b.joinToString("") { "%02x".format(it.toInt() and 0xFF) }

/** Deterministic test byte source that cycles through the given bytes (passgen_ref.byte_source). */
private fun bytes(h: String): () -> Int {
    val b = hex(h)
    var i = 0
    return { b[i++ % b.size].toInt() and 0xFF }
}

fun main() {
    eq("j*******@example.com", PiiMask.maskEmail("jane.doe@example.com"), "email 0")
    eq("a***@b.co", PiiMask.maskEmail("a@b.co"), "email 1")
    eq("a***@x.io", PiiMask.maskEmail("ab@x.io"), "email 2")
    eq("\u00E9****@ex.fr", PiiMask.maskEmail("\u00E9mile@ex.fr"), "email 3")
    eq("+1 (***) ***-0123", PiiMask.maskPhone("+1 (415) 555-0123"), "phone 0")
    eq("+44 ** **** 0958", PiiMask.maskPhone("+44 20 7946 0958"), "phone 1")
    eq("******5678", PiiMask.maskPhone("0612345678"), "phone 2")
    eq("***-**23-99", PiiMask.maskPhone("555-0123-99"), "phone 3")
    eq("**** **** **** 1111", PiiMask.maskCard("4111 1111 1111 1111"), "card 0")
    eq("****-****-****-1111", PiiMask.maskCard("4111-1111-1111-1111"), "card 1")
    eq("***********0005", PiiMask.maskCard("378282246310005"), "card 2")
    eq("************9424", PiiMask.maskCard("6011000990139424"), "card 3")
    eq("se********en", PiiMask.maskMiddle("secret-token", 2, 2, "*"), "middle 0")
    eq("a*c", PiiMask.maskMiddle("abc", 1, 1, "*"), "middle 1")
    eq("**", PiiMask.maskMiddle("ab", 1, 1, "*"), "middle 2")
    eq("********", PiiMask.maskMiddle("password", 0, 0, "*"), "middle 3")
    eq("h****", PiiMask.maskMiddle("h\u00E9llo", 1, 0, "*"), "middle 4")
    eq("contact j***@example.com today", PiiMask.redact("contact jane@example.com today"), "redact 0")
    eq("card **** **** **** 1111 exp", PiiMask.redact("card 4111 1111 1111 1111 exp"), "redact 1")
    eq("order 1234 5678 9012 3456 ok", PiiMask.redact("order 1234 5678 9012 3456 ok"), "redact 2")
    eq("two a***@b.io, c***@e.org", PiiMask.redact("two a@b.io, c.d@e.org"), "redact 3")
    eq("id ************1111x", PiiMask.redact("id 4111111111111111x"), "redact 4")
    throwsIae("invalid_email 0") { PiiMask.maskEmail("nope") }
    throwsIae("invalid_email 1") { PiiMask.maskEmail("a@b@c") }
    throwsIae("invalid_email 2") { PiiMask.maskEmail("@x.com") }
    throwsIae("invalid_email 3") { PiiMask.maskEmail("x@") }
    throwsIae("invalid_phone 0") { PiiMask.maskPhone("123") }
    throwsIae("invalid_phone 1") { PiiMask.maskPhone("+1 55") }
    throwsIae("invalid_card 0") { PiiMask.maskCard("4111") }
    throwsIae("invalid_card 1") { PiiMask.maskCard("4111 1111 1111 1111 1111 1") }
    throwsIae("invalid_card 2") { PiiMask.maskCard("4111a1111111111") }
    eq("s*****", PiiMask.maskMiddle("secret", 1, 0, "*"), "middle keepEnd 0")
    throwsIae("middle negative keep") { PiiMask.maskMiddle("x", -1, 1, "*") }
    throwsIae("middle long mask") { PiiMask.maskMiddle("x", 1, 1, "**") }
    throwsIae("redact unsupported kind") { PiiMask.redact("x", listOf("phone")) }
    eq("a***@b.co 4111 1111 1111 1111", PiiMask.redact("ab@b.co 4111 1111 1111 1111", listOf("email")), "redact email only")

    println("PiiMaskTest: $passed passed, $failed failed")
    if (failed > 0) exitProcess(1)
}
