// SPDX-License-Identifier: Apache-2.0

import java.math.BigDecimal

/**
 * Logic-less Mustache-subset templates: {{path}} (HTML-escaped), {{{path}}} (raw), {{#path}}..{{/path}} sections
 * (lists iterate, '.' is the item, lookups try the item then outer scopes; truthy maps push a scope),
 * {{^path}}..{{/path}} inverted sections and {{! comments }}. No partials, delimiters or lambdas. Data as in
 * JsonPatch (Map, List, String, numbers, Boolean, null). Values: null '', booleans 'true'/'false', integers in
 * decimal, integral doubles without '.0', other doubles via Double.toString (shortest round-trip, JVM exponent
 * notation); lists or maps are an error. Every failure throws IllegalArgumentException.
 */
object TemplateRender {
    private val NAME = Regex("\\.|[A-Za-z_][A-Za-z0-9_-]*(?:\\.[A-Za-z_][A-Za-z0-9_-]*|\\[(?:0|[1-9][0-9]*)\\])*")
    private val TAG = Regex("(?sU)\\{\\{(\\{)?\\s*([#^/!]?)\\s*(.*?)\\s*(\\})?\\}\\}")
    private val PART = Regex("[A-Za-z_][A-Za-z0-9_-]*|\\[[0-9]+\\]")

    private class Node(val kind: String, val text: String) { val children = ArrayList<Node>() }

    /** Renders template with data; escape=false leaves {{path}} values unescaped. */
    fun renderTemplate(template: String, data: Any?, escape: Boolean = true): String {
        val out = StringBuilder()
        run(parse(template), listOf(data), escape, out)
        return out.toString()
    }

    private fun esc(s: String) =
        s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace("\"", "&quot;").replace("'", "&#39;")

    private fun str(v: Any?): String = when (v) {
        null -> ""
        is Boolean -> v.toString()
        is Double, is Float -> {
            val d = (v as Number).toDouble()
            if (!d.isInfinite() && d == Math.rint(d)) BigDecimal(d).toBigInteger().toString() else v.toString()
        }
        is Number -> v.toString()
        is String -> v
        else -> throw IllegalArgumentException("cannot render a list or object")
    }

    private fun lookup(stack: List<Any?>, path: String): Any? {
        if (path == ".") return stack.last()
        val parts = PART.findAll(path).map { it.value }.toList()
        val first = parts[0]
        for (scope in stack.asReversed()) {
            if (scope is Map<*, *> && scope.containsKey(first)) {
                var cur = scope[first]
                for (p in parts.drop(1)) {
                    cur = if (p.startsWith("[")) {
                        val digits = p.substring(1, p.length - 1)
                        val i = if (digits.length > 10) Long.MAX_VALUE else digits.toLong()
                        if (cur is List<*> && i < cur.size) cur[i.toInt()] else null
                    } else {
                        if (cur is Map<*, *>) cur[p] else null
                    }
                    if (cur == null) return null
                }
                return cur
            }
        }
        return null
    }

    private fun parse(t: String): List<Node> {
        var pos = 0
        val root = Node("root", "")
        val stack = arrayListOf(root)
        for (m in TAG.findAll(t)) {
            val top = stack.last()
            if (m.range.first > pos) top.children.add(Node("text", t.substring(pos, m.range.first)))
            val triple = m.groups[1] != null
            val sig = m.groupValues[2]
            val name = m.groupValues[3]
            val close = m.groups[4] != null
            if (sig == "!") { pos = m.range.last + 1; continue }
            require(triple == close && !(triple && sig.isNotEmpty())) { "bad triple-brace tag" }
            require(NAME.matches(name)) { "bad tag name '$name'" }
            when (sig) {
                "#", "^" -> {
                    val node = Node(if (sig == "#") "section" else "inverted", name)
                    top.children.add(node)
                    stack.add(node)
                }
                "/" -> {
                    require(stack.size > 1 && top.text == name) { "mismatched close tag" }
                    stack.removeAt(stack.size - 1)
                }
                else -> top.children.add(Node(if (triple) "raw" else "var", name))
            }
            pos = m.range.last + 1
        }
        val rest = t.substring(pos)
        require("{{" !in rest) { "unclosed tag" }
        if (rest.isNotEmpty()) stack.last().children.add(Node("text", rest))
        require(stack.size == 1) { "unclosed section" }
        return root.children
    }

    private fun truthy(v: Any?): Boolean = when (v) {
        null, false -> false
        is Number -> v.toDouble() != 0.0
        is String -> v.isNotEmpty()
        is List<*> -> v.isNotEmpty()
        is Map<*, *> -> v.isNotEmpty()
        else -> true
    }

    private fun run(nodes: List<Node>, stack: List<Any?>, escape: Boolean, out: StringBuilder) {
        for (n in nodes) {
            when (n.kind) {
                "text" -> out.append(n.text)
                "var", "raw" -> {
                    val s = str(lookup(stack, n.text))
                    out.append(if (escape && n.kind == "var") esc(s) else s)
                }
                "section" -> {
                    val v = lookup(stack, n.text)
                    if (v is List<*>) for (item in v) run(n.children, stack + listOf(item), escape, out)
                    else if (truthy(v)) run(n.children, if (v is Map<*, *>) stack + listOf(v) else stack, escape, out)
                }
                else -> if (!truthy(lookup(stack, n.text))) run(n.children, stack, escape, out)
            }
        }
    }
}
