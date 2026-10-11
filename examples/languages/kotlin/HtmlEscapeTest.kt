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
    eq("&lt;a href=&quot;x&quot;&gt;", HtmlEscape.escapeHtml("<a href=\"x\">"), "escape 0")
    eq("Tom &amp; Jerry&#39;s", HtmlEscape.escapeHtml("Tom & Jerry's"), "escape 1")
    eq("plain", HtmlEscape.escapeHtml("plain"), "escape 2")
    eq("", HtmlEscape.escapeHtml(""), "escape 3")
    eq("<p>", HtmlEscape.unescapeHtml("&lt;p&gt;"), "unescape 0")
    eq("\u00A9 \u00A9 \u00A9", HtmlEscape.unescapeHtml("&#169; &#xA9; &#XA9;"), "unescape 1")
    eq("&amp;", HtmlEscape.unescapeHtml("&amp;amp;"), "unescape 2")
    eq("&amp no semicolon", HtmlEscape.unescapeHtml("&amp no semicolon"), "unescape 3")
    eq("&bogus; &AMP;", HtmlEscape.unescapeHtml("&bogus; &AMP;"), "unescape 4")
    eq("\u20AC \u0178", HtmlEscape.unescapeHtml("&#128; &#x9F;"), "unescape 5")
    eq("\uFFFD \uFFFD \uFFFD", HtmlEscape.unescapeHtml("&#0; &#xD800; &#1114112;"), "unescape 6")
    eq("\u20AC5 \u2014 \u2026", HtmlEscape.unescapeHtml("&euro;5 &mdash; &hellip;"), "unescape 7")
    eq("&#99999999999;", HtmlEscape.unescapeHtml("&#99999999999;"), "unescape 8")
    eq("Hello world", HtmlEscape.stripTags("<p>Hello <b>world</b></p>"), "strip 0")
    eq("ab", HtmlEscape.stripTags("a<script>alert(1)</script>b"), "strip 1")
    eq("x & y", HtmlEscape.stripTags("<STYLE>p{}</STYLE>x &amp; y"), "strip 2")
    eq("1 < 2 and 3>1", HtmlEscape.stripTags("1 < 2 and 3>1"), "strip 3")
    eq("t", HtmlEscape.stripTags("<!-- c -->t"), "strip 4")
    eq("unclosed ", HtmlEscape.stripTags("unclosed <script>evil"), "strip 5")
    eq("<a href=\"x\">", HtmlEscape.unescapeHtml(HtmlEscape.escapeHtml("<a href=\"x\">")), "round trip 0")
    eq("Tom & Jerry's", HtmlEscape.unescapeHtml(HtmlEscape.escapeHtml("Tom & Jerry's")), "round trip 1")
    eq("plain", HtmlEscape.unescapeHtml(HtmlEscape.escapeHtml("plain")), "round trip 2")
    eq("", HtmlEscape.unescapeHtml(HtmlEscape.escapeHtml("")), "round trip 3")

    println("HtmlEscapeTest: $passed passed, $failed failed")
    if (failed > 0) exitProcess(1)
}
