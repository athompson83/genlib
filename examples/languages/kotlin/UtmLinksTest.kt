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

fun main() {
    eq("https://ex.com/p?ref=a&utm_source=newsletter&utm_medium=email&utm_campaign=fall%20sale#top",
        UtmLinks.buildUtmUrl("https://ex.com/p?ref=a#top", UtmLinks.Utm("Newsletter", "email", "Fall Sale")), "build vector 1")
    eq("https://ex.com/?utm_source=x&utm_medium=y&utm_campaign=z&utm_content=hero%20cta",
        UtmLinks.buildUtmUrl("https://ex.com/?utm_source=old", UtmLinks.Utm("x", "y", "z", content = "Hero CTA")), "build vector 2")
    eq("http://ex.com?utm_id=id-7&utm_source=s&utm_medium=m&utm_campaign=c&utm_term=running%20shoes&utm_content=a%2Fb",
        UtmLinks.buildUtmUrl("http://ex.com", UtmLinks.Utm(" S ", "m", "c", "Running Shoes", "a/b", "ID-7")), "build all keys in order")
    throwsIae("build relative base") { UtmLinks.buildUtmUrl("ex.com/p", UtmLinks.Utm("s", "m", "c")) }
    throwsIae("build ftp base") { UtmLinks.buildUtmUrl("ftp://ex.com/", UtmLinks.Utm("s", "m", "c")) }
    throwsIae("build missing host") { UtmLinks.buildUtmUrl("https:///p", UtmLinks.Utm("s", "m", "c")) }
    throwsIae("build blank campaign") { UtmLinks.buildUtmUrl("https://ex.com/", UtmLinks.Utm("s", "m", "  ")) }
    throwsIae("build empty source") { UtmLinks.buildUtmUrl("https://ex.com/", UtmLinks.Utm("", "m", "c")) }

    val parsed = UtmLinks.parseUtm("https://ex.com/?a=1&utm_campaign=fall%20sale&utm_source=news+letter&utm_source=dup")
    eq(listOf("source", "campaign"), parsed.keys.toList(), "parse key order")
    eq("news letter", parsed["source"], "parse plus as space, first wins")
    eq("fall sale", parsed["campaign"], "parse percent decode")
    check(UtmLinks.parseUtm("https://ex.com/").isEmpty(), "parse no query")
    eq("\u20ac", UtmLinks.parseUtm("https://ex.com/?utm_source=%E2%82%AC#x")["source"], "parse UTF-8")
    throwsIae("parse malformed encoding") { UtmLinks.parseUtm("https://ex.com/?utm_source=%zz") }

    eq("https://ex.com/p?id=7&b=2#s", UtmLinks.stripTracking("https://ex.com/p?id=7&utm_source=x&gclid=abc&b=2#s"), "strip vector 1")
    eq("https://ex.com/", UtmLinks.stripTracking("https://ex.com/?fbclid=1"), "strip vector 2")
    eq("https://ex.com/?q=a%20b", UtmLinks.stripTracking("https://ex.com/?q=a%20b&igshid=9&_hsenc=x"), "strip keeps original encoding")

    println("UtmLinksTest: $passed passed, $failed failed")
    if (failed > 0) exitProcess(1)
}
