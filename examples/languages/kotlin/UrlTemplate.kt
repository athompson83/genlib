// SPDX-License-Identifier: Apache-2.0

/**
 * RFC 6570 URI Template expansion, levels 1-4. Variable values are a String, a List of Strings or an ordered Map of
 * String to String (use a LinkedHashMap; iteration order is the output order). A missing name, null, an empty list or
 * an empty map is undefined and skipped. Strings are processed by code point and percent-encoded as UTF-8 with
 * uppercase hex. Literal text keeps unreserved and reserved characters and %XX triplets (RFC 6570 section 3.1) and
 * percent-encodes everything else, including a '%' not followed by two hex digits. An invalid template (unclosed or stray brace, empty expression, bad name or prefix, reserved
 * operator = , ! @ |) or a prefix on a list/map throws IllegalArgumentException.
 */
object UrlTemplate {
    private const val RESERVED = ":/?#[]@!$&'()*+,;="
    private val VARSPEC = Regex("([^:*]+)(?::([0-9]+)|(\\*))?")
    private val VARNAME = Regex("(?:[A-Za-z0-9_]|%[0-9A-Fa-f]{2})(?:\\.?(?:[A-Za-z0-9_]|%[0-9A-Fa-f]{2}))*")

    private fun unreserved(c: Int) = c in 'A'.code..'Z'.code || c in 'a'.code..'z'.code || c in '0'.code..'9'.code ||
        c == '-'.code || c == '.'.code || c == '_'.code || c == '~'.code

    private fun hexDigit(c: Char) = c in '0'..'9' || c in 'A'..'F' || c in 'a'..'f'

    private fun enc(s: String, allowReserved: Boolean): String {
        val out = StringBuilder()
        var i = 0
        while (i < s.length) {
            val c = s.codePointAt(i)
            if (allowReserved && c == '%'.code && i + 2 < s.length && hexDigit(s[i + 1]) && hexDigit(s[i + 2])) {
                out.append(s, i, i + 3)
                i += 3
                continue
            }
            if (unreserved(c) || (allowReserved && c < 128 && RESERVED.indexOf(c.toChar()) >= 0)) out.appendCodePoint(c)
            else for (b in String(Character.toChars(c)).toByteArray(Charsets.UTF_8)) out.append("%%%02X".format(b.toInt() and 0xFF))
            i += Character.charCount(c)
        }
        return out.toString()
    }

    private fun named(name: String, v: String, ifemp: String, allow: Boolean) =
        enc(name, allow) + if (v.isEmpty()) ifemp else "=" + enc(v, allow)

    private fun expression(expr: String, vars: Map<String, Any?>): String {
        require(expr.isNotEmpty()) { "empty expression" }
        val c0 = expr[0]
        require(c0 !in "=,!@|") { "reserved operator: $c0" }
        val op = if (c0 in "+#./;?&") c0.toString() else ""
        val first = if (op == "+") "" else op
        val sep = when (op) { ".", "/", ";" -> op; "?", "&" -> "&"; else -> "," }
        val isNamed = op == ";" || op == "?" || op == "&"
        val ifemp = if (op == "?" || op == "&") "=" else ""
        val allow = op == "+" || op == "#"
        val parts = ArrayList<String>()
        for (spec in expr.substring(op.length).split(",")) {
            val m = VARSPEC.matchEntire(spec)
            require(m != null && VARNAME.matches(m.groupValues[1])) { "bad varspec: $spec" }
            val name = m.groupValues[1]
            val digits = m.groupValues[2]
            require(digits.isEmpty() || (!digits.startsWith("0") && digits.length <= 4)) { "bad prefix: $spec" }
            val prefix = if (digits.isEmpty()) 0 else digits.toInt()
            val explode = m.groupValues[3].isNotEmpty()
            val value = vars[name]
            if (value == null || (value is List<*> && value.isEmpty()) || (value is Map<*, *> && value.isEmpty())) continue
            if (value is String) {
                val v = if (prefix > 0 && value.codePointCount(0, value.length) > prefix) value.substring(0, value.offsetByCodePoints(0, prefix)) else value
                parts.add(if (isNamed) named(name, v, ifemp, allow) else enc(v, allow))
                continue
            }
            require(prefix == 0) { "prefix on composite value: $name" }
            val items = when (value) {
                is List<*> -> value.map { x ->
                    val xs = x as String
                    if (explode && isNamed) named(name, xs, ifemp, allow) else enc(xs, allow)
                }
                is Map<*, *> -> value.entries.map { (k0, v0) ->
                    val k = k0 as String
                    val v = v0 as String
                    when {
                        !explode -> enc(k, allow) + "," + enc(v, allow)
                        isNamed -> named(k, v, ifemp, allow)
                        else -> enc(k, allow) + "=" + enc(v, allow)
                    }
                }
                else -> throw IllegalArgumentException("unsupported value type for $name")
            }
            if (explode) parts.add(items.joinToString(sep))
            else {
                val joined = items.joinToString(",")
                parts.add(if (isNamed) enc(name, allow) + "=" + joined else joined)
            }
        }
        return if (parts.isEmpty()) "" else first + parts.joinToString(sep)
    }

    /** Expands an RFC 6570 template with String, List of String or ordered Map of String values. */
    fun expandTemplate(template: String, variables: Map<String, Any?>): String {
        val out = StringBuilder()
        var i = 0
        while (i < template.length) {
            val c = template[i]
            when (c) {
                '{' -> {
                    val j = template.indexOf('}', i)
                    require(j >= 0) { "unclosed expression" }
                    out.append(expression(template.substring(i + 1, j), variables))
                    i = j + 1
                }
                '}' -> throw IllegalArgumentException("stray }")
                else -> {
                    // RFC 6570 section 3.1: a pct-encoded triplet in literal text is copied as-is.
                    if (c == '%' && i + 2 < template.length && hexDigit(template[i + 1]) && hexDigit(template[i + 2])) {
                        out.append(template, i, i + 3)
                        i += 3
                        continue
                    }
                    // Other literal code points keep unreserved and reserved characters and encode the rest.
                    val len = Character.charCount(template.codePointAt(i))
                    out.append(enc(template.substring(i, i + len), true))
                    i += len
                }
            }
        }
        return out.toString()
    }
}
