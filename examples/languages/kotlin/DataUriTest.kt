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
    DataUri.parseDataUri("data:,Hello%2C%20World!").let { p -> eq("text/plain", p.mime, "parse 0 mime"); eqOrd(linkedMapOf<String, String>("charset" to "US-ASCII"), p.params, "parse 0 params"); eq(false, p.base64, "parse 0 base64"); check(hex("48656c6c6f2c20576f726c6421").contentEquals(p.data), "parse 0 data") }
    DataUri.parseDataUri("data:text/plain;base64,SGVsbG8sIFdvcmxkIQ==").let { p -> eq("text/plain", p.mime, "parse 1 mime"); eqOrd(linkedMapOf<String, String>(), p.params, "parse 1 params"); eq(true, p.base64, "parse 1 base64"); check(hex("48656c6c6f2c20576f726c6421").contentEquals(p.data), "parse 1 data") }
    DataUri.parseDataUri("data:text/html;charset=utf-8,%3Ch1%3EHi%3C%2Fh1%3E").let { p -> eq("text/html", p.mime, "parse 2 mime"); eqOrd(linkedMapOf<String, String>("charset" to "utf-8"), p.params, "parse 2 params"); eq(false, p.base64, "parse 2 base64"); check(hex("3c68313e48693c2f68313e").contentEquals(p.data), "parse 2 data") }
    DataUri.parseDataUri("DATA:image/png;BASE64,iVBORw0KGgo=").let { p -> eq("image/png", p.mime, "parse 3 mime"); eqOrd(linkedMapOf<String, String>(), p.params, "parse 3 params"); eq(true, p.base64, "parse 3 base64"); check(hex("89504e470d0a1a0a").contentEquals(p.data), "parse 3 data") }
    DataUri.parseDataUri("data:;base64,SGk").let { p -> eq("text/plain", p.mime, "parse 4 mime"); eqOrd(linkedMapOf<String, String>("charset" to "US-ASCII"), p.params, "parse 4 params"); eq(true, p.base64, "parse 4 base64"); check(hex("4869").contentEquals(p.data), "parse 4 data") }
    DataUri.parseDataUri("data:text/plain;charset=utf-8;foo=bar,x").let { p -> eq("text/plain", p.mime, "parse 5 mime"); eqOrd(linkedMapOf<String, String>("charset" to "utf-8", "foo" to "bar"), p.params, "parse 5 params"); eq(false, p.base64, "parse 5 base64"); check(hex("78").contentEquals(p.data), "parse 5 data") }
    DataUri.parseDataUri("data:application/json,%7B%22a%22%3A1%7D").let { p -> eq("application/json", p.mime, "parse 6 mime"); eqOrd(linkedMapOf<String, String>(), p.params, "parse 6 params"); eq(false, p.base64, "parse 6 base64"); check(hex("7b2261223a317d").contentEquals(p.data), "parse 6 data") }
    DataUri.parseDataUri("data:bogus,x").let { p -> eq("text/plain", p.mime, "parse 7 mime"); eqOrd(linkedMapOf<String, String>("charset" to "US-ASCII"), p.params, "parse 7 params"); eq(false, p.base64, "parse 7 base64"); check(hex("78").contentEquals(p.data), "parse 7 data") }
    DataUri.parseDataUri("data:text/plain;base64,SG Vs\nbG8=").let { p -> eq("text/plain", p.mime, "parse 8 mime"); eqOrd(linkedMapOf<String, String>(), p.params, "parse 8 params"); eq(true, p.base64, "parse 8 base64"); check(hex("48656c6c6f").contentEquals(p.data), "parse 8 data") }
    DataUri.parseDataUri("data:;charset=utf-8,%E2%82%AC").let { p -> eq("text/plain", p.mime, "parse 9 mime"); eqOrd(linkedMapOf<String, String>("charset" to "utf-8"), p.params, "parse 9 params"); eq(false, p.base64, "parse 9 base64"); check(hex("e282ac").contentEquals(p.data), "parse 9 data") }
    DataUri.parseDataUri("data:,a%zzb").let { p -> eq("text/plain", p.mime, "parse 10 mime"); eqOrd(linkedMapOf<String, String>("charset" to "US-ASCII"), p.params, "parse 10 params"); eq(false, p.base64, "parse 10 base64"); check(hex("61257a7a62").contentEquals(p.data), "parse 10 data") }
    eq("data:text/plain,Hello,%20World!", DataUri.buildDataUri(hex("48656c6c6f2c20576f726c6421"), "text/plain", null), "build 0")
    eq("data:image/png;base64,iVBORw0K", DataUri.buildDataUri(hex("89504e470d0a"), "image/png", null), "build 1")
    eq("data:application/json,%7B%22a%22:1%7D", DataUri.buildDataUri(hex("7b2261223a317d"), "application/json", null), "build 2")
    eq("data:text/plain;charset=utf-8,%E2%82%AC%20&%20%C3%BC", DataUri.buildDataUri(hex("e282ac202620c3bc"), "text/plain;charset=utf-8", null), "build 3")
    eq("data:text/plain;base64,//4=", DataUri.buildDataUri(hex("fffe"), "text/plain", null), "build 4")
    eq("data:text/plain;base64,YWJj", DataUri.buildDataUri(hex("616263"), "text/plain", true), "build 5")
    eq("data:application/octet-stream;base64,", DataUri.buildDataUri(hex(""), "application/octet-stream", null), "build 6")
    eq("data:text/plain,a%20b/c?d", DataUri.buildDataUri(hex("6120622f633f64"), "text/plain", false), "build 7")
    throwsIae("invalid parse 0") { DataUri.parseDataUri("text/plain,x") }
    throwsIae("invalid parse 1") { DataUri.parseDataUri("data:text/plain") }
    throwsIae("invalid parse 2") { DataUri.parseDataUri("data:;base64,a") }
    throwsIae("invalid parse 3") { DataUri.parseDataUri("data:;base64,@@@@") }
    throwsIae("invalid parse 4") { DataUri.parseDataUri("data:;base64,SGVsbG8=x") }
    throwsIae("invalid build 0") { DataUri.buildDataUri(hex("00"), "not a type") }
    throwsIae("invalid build 1") { DataUri.buildDataUri(hex("00"), "text/plain; charset") }
    eq("data:application/octet-stream;base64,AAE=", DataUri.buildDataUri(byteArrayOf(0, 1)), "build default")

    println("DataUriTest: $passed passed, $failed failed")
    if (failed > 0) exitProcess(1)
}
