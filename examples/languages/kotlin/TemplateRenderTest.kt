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
    val data = omap("name" to "Ada <3", "html" to "<b>x</b>", "n" to 3L, "f" to 2.5, "g" to 4.0, "t" to true, "z" to 0L, "e" to "", "items" to lst(omap("name" to "one"), omap("name" to "two", "extra" to "!")), "nums" to lst(1L, 2L), "user" to omap("first" to "Grace", "tags" to lst("x")), "empty" to lst(), "obj" to omap("k" to "v"))
    eq("Hello Ada &lt;3!", TemplateRender.renderTemplate("Hello {{name}}!", data), "render 0")
    eq("<b>x</b> vs &lt;b&gt;x&lt;/b&gt;", TemplateRender.renderTemplate("{{{html}}} vs {{html}}", data), "render 1")
    eq("3 2.5 4 true 0 [] []", TemplateRender.renderTemplate("{{ n }} {{f}} {{g}} {{t}} {{z}} [{{e}}] [{{missing}}]", data), "render 2")
    eq("<one><two!>", TemplateRender.renderTemplate("{{#items}}<{{name}}{{extra}}>{{/items}}", data), "render 3")
    eq("1,2,", TemplateRender.renderTemplate("{{#nums}}{{.}},{{/nums}}", data), "render 4")
    eq("yeszeronone", TemplateRender.renderTemplate("{{#t}}yes{{/t}}{{#z}}no{{/z}}{{^z}}zero{{/z}}{{^empty}}none{{/empty}}", data), "render 5")
    eq("Grace Ada &lt;3", TemplateRender.renderTemplate("{{#user}}{{first}} {{name}}{{/user}}", data), "render 6")
    eq("Grace x", TemplateRender.renderTemplate("{{user.first}} {{user.tags[0]}}", data), "render 7")
    eq("ab", TemplateRender.renderTemplate("a{{! comment }}b", data), "render 8")
    eq("v", TemplateRender.renderTemplate("{{#obj}}{{k}}{{/obj}}", data), "render 9")
    eq("[two]", TemplateRender.renderTemplate("{{#items}}{{#extra}}[{{name}}]{{/extra}}{{/items}}", data), "render 10")
    eq("no tags", TemplateRender.renderTemplate("no tags", data), "render 11")
    eq("<b>x</b>", TemplateRender.renderTemplate("{{html}}", data, false), "raw mode 0")
    throwsIae("invalid 0") { TemplateRender.renderTemplate("{{", data) }
    throwsIae("invalid 1") { TemplateRender.renderTemplate("{{#a}}x", data) }
    throwsIae("invalid 2") { TemplateRender.renderTemplate("{{#a}}x{{/b}}", data) }
    throwsIae("invalid 3") { TemplateRender.renderTemplate("{{/a}}", data) }
    throwsIae("invalid 4") { TemplateRender.renderTemplate("{{ bad name }}", data) }
    throwsIae("invalid 5") { TemplateRender.renderTemplate("{{{x}}", data) }
    throwsIae("invalid 6") { TemplateRender.renderTemplate("{{obj}}", data) }
    throwsIae("invalid 7") { TemplateRender.renderTemplate("{{items}}", data) }

    println("TemplateRenderTest: $passed passed, $failed failed")
    if (failed > 0) exitProcess(1)
}
