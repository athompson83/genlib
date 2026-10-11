// SPDX-License-Identifier: Apache-2.0
// Generated from the wave-12 capability vectors; edit the vectors, not the literals.
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

/** Relative tolerance 1e-9 (absolute 1e-12 near zero). */
private fun near(expected: Double, actual: Double, name: String) =
    check(Math.abs(expected - actual) <= maxOf(1e-9 * maxOf(Math.abs(expected), Math.abs(actual)), 1e-12), "$name expected <$expected> got <$actual>")

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

fun main() {
    val vars = omap("count" to listOf<String>("one", "two", "three"), "dom" to listOf<String>("example", "com"), "dub" to "me/too", "hello" to "Hello World!", "half" to "50%", "var" to "value", "who" to "fred", "base" to "http://example.com/home/", "path" to "/foo/bar", "list" to listOf<String>("red", "green", "blue"), "keys" to omap("semi" to ";", "dot" to ".", "comma" to ","), "v" to "6", "x" to "1024", "y" to "768", "empty" to "", "empty_keys" to omap(), "empty_list" to listOf<String>(), "utf" to "caf\u00e9 \u2603", "emoji" to "\ud83d\ude00x")
    eq("value", UrlTemplate.expandTemplate("{var}", vars), "case 0")
    eq("Hello%20World%21", UrlTemplate.expandTemplate("{hello}", vars), "case 1")
    eq("50%25", UrlTemplate.expandTemplate("{half}", vars), "case 2")
    eq("OX", UrlTemplate.expandTemplate("O{empty}X", vars), "case 3")
    eq("OX", UrlTemplate.expandTemplate("O{undef}X", vars), "case 4")
    eq("1024,768", UrlTemplate.expandTemplate("{x,y}", vars), "case 5")
    eq("1024,Hello%20World%21,768", UrlTemplate.expandTemplate("{x,hello,y}", vars), "case 6")
    eq("?1024,", UrlTemplate.expandTemplate("?{x,empty}", vars), "case 7")
    eq("?1024", UrlTemplate.expandTemplate("?{x,undef}", vars), "case 8")
    eq("?768", UrlTemplate.expandTemplate("?{undef,y}", vars), "case 9")
    eq("val", UrlTemplate.expandTemplate("{var:3}", vars), "case 10")
    eq("value", UrlTemplate.expandTemplate("{var:30}", vars), "case 11")
    eq("red,green,blue", UrlTemplate.expandTemplate("{list}", vars), "case 12")
    eq("red,green,blue", UrlTemplate.expandTemplate("{list*}", vars), "case 13")
    eq("semi,%3B,dot,.,comma,%2C", UrlTemplate.expandTemplate("{keys}", vars), "case 14")
    eq("semi=%3B,dot=.,comma=%2C", UrlTemplate.expandTemplate("{keys*}", vars), "case 15")
    eq("value", UrlTemplate.expandTemplate("{+var}", vars), "case 16")
    eq("Hello%20World!", UrlTemplate.expandTemplate("{+hello}", vars), "case 17")
    eq("50%25", UrlTemplate.expandTemplate("{+half}", vars), "case 18")
    eq("http%3A%2F%2Fexample.com%2Fhome%2Findex", UrlTemplate.expandTemplate("{base}index", vars), "case 19")
    eq("http://example.com/home/index", UrlTemplate.expandTemplate("{+base}index", vars), "case 20")
    eq("/foo/b/here", UrlTemplate.expandTemplate("{+path:6}/here", vars), "case 21")
    eq("red,green,blue", UrlTemplate.expandTemplate("{+list}", vars), "case 22")
    eq("semi=;,dot=.,comma=,", UrlTemplate.expandTemplate("{+keys*}", vars), "case 23")
    eq("#value", UrlTemplate.expandTemplate("{#var}", vars), "case 24")
    eq("#Hello%20World!", UrlTemplate.expandTemplate("{#hello}", vars), "case 25")
    eq("#/foo/b/here", UrlTemplate.expandTemplate("{#path:6}/here", vars), "case 26")
    eq("#semi=;,dot=.,comma=,", UrlTemplate.expandTemplate("{#keys*}", vars), "case 27")
    eq("X.value", UrlTemplate.expandTemplate("X{.var}", vars), "case 28")
    eq("X.val", UrlTemplate.expandTemplate("X{.var:3}", vars), "case 29")
    eq("X.red.green.blue", UrlTemplate.expandTemplate("X{.list*}", vars), "case 30")
    eq(".example.com", UrlTemplate.expandTemplate("{.dom*}", vars), "case 31")
    eq("/value", UrlTemplate.expandTemplate("{/var}", vars), "case 32")
    eq("/v/value", UrlTemplate.expandTemplate("{/var:1,var}", vars), "case 33")
    eq("/red/green/blue/%2Ffoo", UrlTemplate.expandTemplate("{/list*,path:4}", vars), "case 34")
    eq("/semi=%3B/dot=./comma=%2C", UrlTemplate.expandTemplate("{/keys*}", vars), "case 35")
    eq(";hello=Hello", UrlTemplate.expandTemplate("{;hello:5}", vars), "case 36")
    eq(";list=red;list=green;list=blue", UrlTemplate.expandTemplate("{;list*}", vars), "case 37")
    eq(";semi=%3B;dot=.;comma=%2C", UrlTemplate.expandTemplate("{;keys*}", vars), "case 38")
    eq(";x=1024;y=768;empty", UrlTemplate.expandTemplate("{;x,y,empty}", vars), "case 39")
    eq("?x=1024&y=768&empty=", UrlTemplate.expandTemplate("{?x,y,empty}", vars), "case 40")
    eq("?var=val", UrlTemplate.expandTemplate("{?var:3}", vars), "case 41")
    eq("?list=red,green,blue", UrlTemplate.expandTemplate("{?list}", vars), "case 42")
    eq("?list=red&list=green&list=blue", UrlTemplate.expandTemplate("{?list*}", vars), "case 43")
    eq("?keys=semi,%3B,dot,.,comma,%2C", UrlTemplate.expandTemplate("{?keys}", vars), "case 44")
    eq("?semi=%3B&dot=.&comma=%2C", UrlTemplate.expandTemplate("{?keys*}", vars), "case 45")
    eq("&var=val", UrlTemplate.expandTemplate("{&var:3}", vars), "case 46")
    eq("&semi=%3B&dot=.&comma=%2C", UrlTemplate.expandTemplate("{&keys*}", vars), "case 47")
    eq("", UrlTemplate.expandTemplate("{?empty_keys*}", vars), "case 48")
    eq("", UrlTemplate.expandTemplate("{?empty_list}", vars), "case 49")
    eq("/one/two/three", UrlTemplate.expandTemplate("{/count*}", vars), "case 50")
    eq("caf%C3%A9%20%E2%98%83", UrlTemplate.expandTemplate("{utf}", vars), "case 51")
    eq("caf%C3%A9%20%E2%98%83", UrlTemplate.expandTemplate("{+utf}", vars), "case 52")
    eq("%F0%9F%98%80", UrlTemplate.expandTemplate("{emoji:1}", vars), "case 53")
    eq("?utf=caf%C3%A9%20%E2%98%83", UrlTemplate.expandTemplate("{?utf}", vars), "case 54")
    eq("map?1024,768#Hello%20World%21", UrlTemplate.expandTemplate("map?{x,y}#{hello}", vars), "case 55")
    eq("literal%20kept/value", UrlTemplate.expandTemplate("literal%20kept/{var}", vars), "case 56")
    eq("sp%20acevalue", UrlTemplate.expandTemplate("sp ace{var}", vars), "case 57")
    throwsIae("invalid 0") { UrlTemplate.expandTemplate("{var", vars) }
    throwsIae("invalid 1") { UrlTemplate.expandTemplate("var}", vars) }
    throwsIae("invalid 2") { UrlTemplate.expandTemplate("{}", vars) }
    throwsIae("invalid 3") { UrlTemplate.expandTemplate("{=var}", vars) }
    throwsIae("invalid 4") { UrlTemplate.expandTemplate("{!var}", vars) }
    throwsIae("invalid 5") { UrlTemplate.expandTemplate("{@var}", vars) }
    throwsIae("invalid 6") { UrlTemplate.expandTemplate("{|var}", vars) }
    throwsIae("invalid 7") { UrlTemplate.expandTemplate("{var:0}", vars) }
    throwsIae("invalid 8") { UrlTemplate.expandTemplate("{var:10000}", vars) }
    throwsIae("invalid 9") { UrlTemplate.expandTemplate("{va r}", vars) }
    throwsIae("invalid 10") { UrlTemplate.expandTemplate("{list:3}", vars) }
    throwsIae("invalid 11") { UrlTemplate.expandTemplate("{keys:2}", vars) }
    throwsIae("invalid 12") { UrlTemplate.expandTemplate("{var:01}", vars) }
    eq("", UrlTemplate.expandTemplate("{nothing}", omap()), "no variables")

    println("UrlTemplateTest: $passed passed, $failed failed")
    if (failed > 0) exitProcess(1)
}
