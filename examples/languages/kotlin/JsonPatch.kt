// SPDX-License-Identifier: Apache-2.0
import java.math.BigDecimal
import java.math.BigInteger

/**
 * RFC 8259 JSON parse/canonical form, RFC 6901 JSON Pointer, RFC 6902 JSON Patch, RFC 7396 merge patch
 * and a deterministic patch generator. Values are Any?: LinkedHashMap<String, Any?> (any Map with String
 * keys is accepted), ArrayList<Any?> (any List), String, Long or Double (integers that fit a Long parse as
 * Long, other numbers as Double; Int, Short, Byte, BigInteger and Float are accepted), Boolean and null for
 * JSON null. Numbers compare numerically (1 equals 1.0); non-integer doubles print in the JVM's shortest
 * round-trip form (Double.toString). Every failure throws IllegalArgumentException.
 */
object JsonPatch {
    private const val MAX_DEPTH = 1000

    // ---- parsing ----

    /** Strict RFC 8259 parse. Duplicate object keys keep the last value; non-finite numbers are rejected. */
    fun parse(text: String): Any? {
        val p = Parser(text)
        p.ws()
        val v = p.value(0)
        p.ws()
        if (p.i != text.length) throw p.fail("trailing characters")
        return v
    }

    private class Parser(val s: String) {
        var i = 0

        fun fail(why: String) = IllegalArgumentException("invalid JSON at $i: $why")

        fun ws() {
            while (i < s.length && (s[i] == ' ' || s[i] == '\t' || s[i] == '\n' || s[i] == '\r')) i++
        }

        private fun lit(w: String): Boolean {
            if (s.startsWith(w, i)) { i += w.length; return true }
            return false
        }

        private fun at(c: Char) = i < s.length && s[i] == c

        fun value(depth: Int): Any? {
            if (depth > MAX_DEPTH) throw fail("nesting too deep")
            if (i >= s.length) throw fail("unexpected end")
            val c = s[i]
            when {
                c == '{' -> {
                    i++
                    val out = LinkedHashMap<String, Any?>()
                    ws()
                    if (at('}')) { i++; return out }
                    while (true) {
                        ws()
                        if (!at('"')) throw fail("expected a string key")
                        val k = string()
                        ws()
                        if (!at(':')) throw fail("expected ':'")
                        i++
                        ws()
                        out[k] = value(depth + 1)
                        ws()
                        if (at(',')) { i++; continue }
                        if (at('}')) { i++; return out }
                        throw fail("expected ',' or '}'")
                    }
                }
                c == '[' -> {
                    i++
                    val out = ArrayList<Any?>()
                    ws()
                    if (at(']')) { i++; return out }
                    while (true) {
                        ws()
                        out.add(value(depth + 1))
                        ws()
                        if (at(',')) { i++; continue }
                        if (at(']')) { i++; return out }
                        throw fail("expected ',' or ']'")
                    }
                }
                c == '"' -> return string()
                lit("true") -> return true
                lit("false") -> return false
                lit("null") -> return null
                c == '-' || c in '0'..'9' -> return number()
                else -> throw fail("unexpected character")
            }
        }

        private fun digit() = i < s.length && s[i] in '0'..'9'

        private fun number(): Any {
            val start = i
            if (s[i] == '-') i++
            if (!digit()) throw fail("expected a digit")
            if (s[i] == '0') i++ else while (digit()) i++
            var integer = true
            if (at('.')) {
                i++
                integer = false
                if (!digit()) throw fail("expected a digit after '.'")
                while (digit()) i++
            }
            if (at('e') || at('E')) {
                i++
                integer = false
                if (at('+') || at('-')) i++
                if (!digit()) throw fail("expected a digit in the exponent")
                while (digit()) i++
            }
            val t = s.substring(start, i)
            if (integer) t.toLongOrNull()?.let { return it }
            val d = t.toDouble()
            if (d.isInfinite()) throw fail("number out of range")
            return d
        }

        private fun hex4(): Int {
            if (i + 4 > s.length) throw fail("short \\u escape")
            var v = 0
            for (k in 0 until 4) {
                val h = Character.digit(s[i + k], 16)
                if (h < 0) throw fail("bad \\u escape")
                v = v * 16 + h
            }
            i += 4
            return v
        }

        fun string(): String {
            i++
            val out = StringBuilder()
            while (true) {
                if (i >= s.length) throw fail("unterminated string")
                val c = s[i++]
                if (c == '"') return out.toString()
                if (c < ' ') throw fail("unescaped control character")
                if (c.isHighSurrogate()) {
                    if (i >= s.length || !s[i].isLowSurrogate()) throw fail("lone surrogate")
                    out.append(c).append(s[i++])
                    continue
                }
                if (c.isLowSurrogate()) throw fail("lone surrogate")
                if (c != '\\') { out.append(c); continue }
                if (i >= s.length) throw fail("unterminated escape")
                when (s[i++]) {
                    '"' -> out.append('"')
                    '\\' -> out.append('\\')
                    '/' -> out.append('/')
                    'b' -> out.append('\b')
                    'f' -> out.append('\u000c')
                    'n' -> out.append('\n')
                    'r' -> out.append('\r')
                    't' -> out.append('\t')
                    'u' -> {
                        val u = hex4().toChar()
                        if (u.isHighSurrogate()) {
                            if (!s.startsWith("\\u", i)) throw fail("lone surrogate escape")
                            i += 2
                            val lo = hex4().toChar()
                            if (!lo.isLowSurrogate()) throw fail("lone surrogate escape")
                            out.append(u).append(lo)
                        } else if (u.isLowSurrogate()) {
                            throw fail("lone surrogate escape")
                        } else out.append(u)
                    }
                    else -> throw fail("invalid escape")
                }
            }
        }
    }

    // ---- canonical form and equality ----

    private val codePointOrder = Comparator<String> { a, b ->
        var i = 0
        var j = 0
        var r = 0
        while (r == 0 && i < a.length && j < b.length) {
            val x = a.codePointAt(i)
            val y = b.codePointAt(j)
            r = x.compareTo(y)
            i += Character.charCount(x)
            j += Character.charCount(y)
        }
        if (r != 0) r else (a.length - i).compareTo(b.length - j)
    }

    private fun isIntegral(v: Any?) = v is Long || v is Int || v is Short || v is Byte || v is BigInteger

    private fun isNumber(v: Any?) = isIntegral(v) || v is Double || v is Float

    private fun decimal(v: Any): BigDecimal = when {
        v is BigInteger -> BigDecimal(v)
        isIntegral(v) -> BigDecimal.valueOf((v as Number).toLong())
        else -> BigDecimal((v as Number).toDouble())
    }

    @Suppress("UNCHECKED_CAST")
    private fun asMap(v: Any?) = v as MutableMap<String, Any?>

    @Suppress("UNCHECKED_CAST")
    private fun asList(v: Any?) = v as MutableList<Any?>

    /** Compact JSON with object keys in code point order; whole numbers print without a decimal point. */
    fun canonical(v: Any?): String = StringBuilder().also { write(v, it) }.toString()

    private fun write(v: Any?, out: StringBuilder) {
        when {
            v == null -> out.append("null")
            v is Boolean -> out.append(v)
            v is String -> writeString(v, out)
            isIntegral(v) -> out.append(v)
            v is Double || v is Float -> {
                val d = (v as Number).toDouble()
                require(!d.isNaN() && !d.isInfinite()) { "JSON has no NaN or infinity" }
                if (d == Math.rint(d)) out.append(BigDecimal(d).toBigInteger()) else out.append(d.toString())
            }
            v is Map<*, *> -> {
                out.append('{')
                val keys = v.keys.map { it as? String ?: throw IllegalArgumentException("object keys must be strings") }.sortedWith(codePointOrder)
                keys.forEachIndexed { k, key ->
                    if (k > 0) out.append(',')
                    writeString(key, out)
                    out.append(':')
                    write(v[key], out)
                }
                out.append('}')
            }
            v is List<*> -> {
                out.append('[')
                v.forEachIndexed { k, x -> if (k > 0) out.append(','); write(x, out) }
                out.append(']')
            }
            else -> throw IllegalArgumentException("not a JSON value: ${v::class.java.name}")
        }
    }

    private fun writeString(s: String, out: StringBuilder) {
        out.append('"')
        for (c in s) {
            when (c) {
                '"' -> out.append("\\\"")
                '\\' -> out.append("\\\\")
                '\b' -> out.append("\\b")
                '\u000c' -> out.append("\\f")
                '\n' -> out.append("\\n")
                '\r' -> out.append("\\r")
                '\t' -> out.append("\\t")
                else -> if (c < ' ') out.append(String.format("\\u%04x", c.code)) else out.append(c)
            }
        }
        out.append('"')
    }

    /** Deep JSON equality: numbers compare numerically, booleans are never numbers, key order is ignored. */
    fun equal(a: Any?, b: Any?): Boolean {
        if (isNumber(a) && isNumber(b)) {
            val x = (a as Number).toDouble()
            val y = (b as Number).toDouble()
            if (x.isNaN() || y.isNaN() || x.isInfinite() || y.isInfinite()) return x == y
            return decimal(a).compareTo(decimal(b)) == 0
        }
        if (a is Map<*, *> && b is Map<*, *>) return a.keys == b.keys && a.keys.all { equal(a[it], b[it]) }
        if (a is List<*> && b is List<*>) return a.size == b.size && a.indices.all { equal(a[it], b[it]) }
        if (a == null || b == null) return a == null && b == null
        if (a is Map<*, *> || a is List<*> || b is Map<*, *> || b is List<*>) return false
        return a == b
    }

    private fun deepCopy(v: Any?): Any? = when (v) {
        is Map<*, *> -> LinkedHashMap<String, Any?>().also { out ->
            for ((k, x) in v) out[k as? String ?: throw IllegalArgumentException("object keys must be strings")] = deepCopy(x)
        }
        is List<*> -> v.mapTo(ArrayList(v.size)) { deepCopy(it) }
        else -> v
    }

    // ---- JSON Pointer ----

    private fun parsePointer(p: Any?): List<String> {
        require(p is String) { "pointer must be a string" }
        if (p.isEmpty()) return emptyList()
        require(p[0] == '/') { "pointer must be empty or start with \"/\"" }
        return p.substring(1).split("/").map { t ->
            for (k in t.indices) {
                require(t[k] != '~' || (k + 1 < t.length && (t[k + 1] == '0' || t[k + 1] == '1'))) { "bad escape in pointer" }
            }
            t.replace("~1", "/").replace("~0", "~")
        }
    }

    private fun escapeToken(t: String) = t.replace("~", "~0").replace("/", "~1")

    private val INDEX = Regex("0|[1-9][0-9]*")

    private fun index(token: String, n: Int, allowEnd: Boolean): Int {
        if (allowEnd && token == "-") return n
        require(INDEX.matches(token)) { "bad array index $token" }
        require(token.length <= 9 && (token.toInt() < n || (token.toInt() == n && allowEnd))) { "array index out of range" }
        return token.toInt()
    }

    private fun walk(doc: Any?, tokens: List<String>, count: Int): Any? {
        var cur = doc
        for (k in 0 until count) {
            val t = tokens[k]
            cur = when (cur) {
                is Map<*, *> -> { require(cur.containsKey(t)) { "no member $t" }; cur[t] }
                is List<*> -> cur[index(t, cur.size, false)]
                else -> throw IllegalArgumentException("cannot index a scalar")
            }
        }
        return cur
    }

    /** RFC 6901 value at [pointer] ("" is the whole document); the result is not a copy. */
    fun getPointer(doc: Any?, pointer: String): Any? {
        val tokens = parsePointer(pointer)
        return walk(doc, tokens, tokens.size)
    }

    // ---- JSON Patch ----

    private fun add(doc: Any?, tokens: List<String>, value: Any?): Any? {
        if (tokens.isEmpty()) return value
        val parent = walk(doc, tokens, tokens.size - 1)
        val last = tokens.last()
        when (parent) {
            is Map<*, *> -> asMap(parent)[last] = value
            is List<*> -> asList(parent).add(index(last, parent.size, true), value)
            else -> throw IllegalArgumentException("cannot add to a scalar")
        }
        return doc
    }

    private fun remove(doc: Any?, tokens: List<String>): Any? {
        require(tokens.isNotEmpty()) { "cannot remove the root" }
        val parent = walk(doc, tokens, tokens.size - 1)
        val last = tokens.last()
        return when (parent) {
            is Map<*, *> -> { require(parent.containsKey(last)) { "no member $last" }; asMap(parent).remove(last) }
            is List<*> -> asList(parent).removeAt(index(last, parent.size, false))
            else -> throw IllegalArgumentException("cannot remove from a scalar")
        }
    }

    /** Applies an RFC 6902 patch atomically; returns a new document and never changes [doc] or [patch]. */
    fun applyPatch(doc: Any?, patch: Any?): Any? {
        require(patch is List<*>) { "patch must be an array" }
        var out = deepCopy(doc)
        for (op in patch) {
            require(op is Map<*, *> && op["op"] is String) { "operation needs \"op\"" }
            val kind = op["op"] as String
            require(op.containsKey("path")) { "operation needs \"path\"" }
            val path = parsePointer(op["path"])
            require(!(kind == "add" || kind == "replace" || kind == "test") || op.containsKey("value")) { "$kind needs \"value\"" }
            require(!(kind == "move" || kind == "copy") || op.containsKey("from")) { "$kind needs \"from\"" }
            when (kind) {
                "add" -> out = add(out, path, deepCopy(op["value"]))
                "remove" -> remove(out, path)
                "replace" -> {
                    walk(out, path, path.size)
                    if (path.isEmpty()) out = deepCopy(op["value"])
                    else { remove(out, path); out = add(out, path, deepCopy(op["value"])) }
                }
                "move" -> {
                    val from = parsePointer(op["from"])
                    if (from == path) { walk(out, from, from.size); continue }
                    require(!(path.size >= from.size && path.subList(0, from.size) == from)) { "cannot move a value into itself" }
                    val value = if (from.isEmpty()) out else remove(out, from)
                    out = add(out, path, value)
                }
                "copy" -> {
                    val from = parsePointer(op["from"])
                    out = add(out, path, deepCopy(walk(out, from, from.size)))
                }
                "test" -> require(equal(walk(out, path, path.size), op["value"])) { "test failed at ${op["path"]}" }
                else -> throw IllegalArgumentException("unknown op $kind")
            }
        }
        return out
    }

    /** RFC 7396 merge patch; returns a new value and never changes [target] or [patch]. */
    fun mergePatch(target: Any?, patch: Any?): Any? {
        if (patch !is Map<*, *>) return deepCopy(patch)
        val out = if (target is Map<*, *>) asMap(deepCopy(target)) else LinkedHashMap()
        for ((key, v) in patch) {
            val k = key as? String ?: throw IllegalArgumentException("object keys must be strings")
            if (v == null) out.remove(k) else out[k] = mergePatch(out[k], v)
        }
        return out
    }

    /** Deterministic RFC 6902 patch turning [a] into [b]: applyPatch(a, createPatch(a, b)) equals b. */
    fun createPatch(a: Any?, b: Any?): List<Map<String, Any?>> = ArrayList<Map<String, Any?>>().also { create(a, b, "", it) }

    private fun op(kind: String, path: String): MutableMap<String, Any?> = linkedMapOf("op" to kind, "path" to path)

    private fun create(a: Any?, b: Any?, path: String, ops: MutableList<Map<String, Any?>>) {
        if (equal(a, b)) return
        if (a is Map<*, *> && b is Map<*, *>) {
            val keys = (a.keys + b.keys).map { it as? String ?: throw IllegalArgumentException("object keys must be strings") }.toSortedSet(codePointOrder)
            for (k in keys) {
                val p = path + "/" + escapeToken(k)
                when {
                    !b.containsKey(k) -> ops += op("remove", p)
                    !a.containsKey(k) -> ops += op("add", p).also { it["value"] = deepCopy(b[k]) }
                    else -> create(a[k], b[k], p, ops)
                }
            }
            return
        }
        if (a is List<*> && b is List<*>) {
            for (k in 0 until minOf(a.size, b.size)) create(a[k], b[k], "$path/$k", ops)
            for (k in a.size - 1 downTo b.size) ops += op("remove", "$path/$k")
            for (k in a.size until b.size) ops += op("add", "$path/$k").also { it["value"] = deepCopy(b[k]) }
            return
        }
        ops += op("replace", path).also { it["value"] = deepCopy(b) }
    }
}
