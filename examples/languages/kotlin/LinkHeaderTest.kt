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
    eqOrd(listOf<LinkHeader.Link>(LinkHeader.Link("https://api.test/items?page=2", linkedMapOf<String, String>("rel" to "next")), LinkHeader.Link("https://api.test/items?page=9", linkedMapOf<String, String>("rel" to "last"))), LinkHeader.parseLinkHeader("<https://api.test/items?page=2>; rel=\"next\", <https://api.test/items?page=9>; rel=\"last\""), "parse 0")
    eqOrd(listOf<LinkHeader.Link>(LinkHeader.Link("https://x/?a=1,2", linkedMapOf<String, String>("rel" to "next", "title" to "a, \"b\"; c"))), LinkHeader.parseLinkHeader("<https://x/?a=1,2>; rel=next; title=\"a, \\\"b\\\"; c\""), "parse 1")
    eqOrd(listOf<LinkHeader.Link>(LinkHeader.Link("/TheBook/chapter2", linkedMapOf<String, String>("rel" to "previous", "title" to "letztes Kapitel")), LinkHeader.Link("/TheBook/chapter4", linkedMapOf<String, String>("rel" to "next", "title" to "n\u00E4chstes Kapitel"))), LinkHeader.parseLinkHeader("</TheBook/chapter2>; rel=\"previous\"; title*=UTF-8'de'letztes%20Kapitel, </TheBook/chapter4>; rel=\"next\"; title*=UTF-8'de'n%c3%a4chstes%20Kapitel"), "parse 2")
    eqOrd(listOf<LinkHeader.Link>(LinkHeader.Link("http://example.org/", linkedMapOf<String, String>("rel" to "start index", "anchor" to "#x", "hreflang" to "en"))), LinkHeader.parseLinkHeader("<http://example.org/>; REL=\"Start Index\"; anchor=\"#x\"; rel=ignored; hreflang=en"), "parse 3")
    eqOrd(listOf<LinkHeader.Link>(LinkHeader.Link("a", linkedMapOf<String, String>("rel" to "x", "crossorigin" to ""))), LinkHeader.parseLinkHeader("<a>;rel=x;crossorigin"), "parse 4")
    eqOrd(listOf<LinkHeader.Link>(), LinkHeader.parseLinkHeader(""), "parse 5")
    eqOrd(listOf<LinkHeader.Link>(LinkHeader.Link("a", linkedMapOf<String, String>("rel" to "x"))), LinkHeader.parseLinkHeader("  ,  <a>; rel=x ,"), "parse 6")
    eq("https://api.test/items?page=9", LinkHeader.findRel(LinkHeader.parseLinkHeader("<https://api.test/items?page=2>; rel=\"next\", <https://api.test/items?page=9>; rel=\"last\""), "LAST")?.uri, "rel 0")
    eq(null, LinkHeader.findRel(LinkHeader.parseLinkHeader("<https://api.test/items?page=2>; rel=\"next\", <https://api.test/items?page=9>; rel=\"last\""), "prev")?.uri, "rel 1")
    eq("</a>; rel=\"next\"", LinkHeader.formatLinkHeader(listOf<LinkHeader.Link>(LinkHeader.Link("/a", linkedMapOf<String, String>("rel" to "next")))), "format 0")
    eq("</b>; rel=\"prev\"; title=\"Page \\\"1\\\"\"; type=\"text/html\", </c>; rel=\"next\"; title*=UTF-8''%E2%82%AC%20x", LinkHeader.formatLinkHeader(listOf<LinkHeader.Link>(LinkHeader.Link("/b", linkedMapOf<String, String>("rel" to "prev", "title" to "Page \"1\"", "type" to "text/html")), LinkHeader.Link("/c", linkedMapOf<String, String>("rel" to "next", "title" to "\u20AC x")))), "format 1")
    throwsIae("invalid 0") { LinkHeader.parseLinkHeader("https://x; rel=next") }
    throwsIae("invalid 1") { LinkHeader.parseLinkHeader("<https://x") }
    throwsIae("invalid 2") { LinkHeader.parseLinkHeader("<a>; title=\"x") }
    throwsIae("invalid 3") { LinkHeader.parseLinkHeader("<a> rel=x") }
    throwsIae("invalid 4") { LinkHeader.parseLinkHeader("<a>; title*=UTF-8''%zz") }
    throwsIae("invalid 5") { LinkHeader.parseLinkHeader("<a>; title*=KOI8-R''x") }

    println("LinkHeaderTest: $passed passed, $failed failed")
    if (failed > 0) exitProcess(1)
}
