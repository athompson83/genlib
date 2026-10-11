// SPDX-License-Identifier: Apache-2.0

/**
 * Dotted paths into JSON-like data ("user.addresses[0].city", 'a["x.y"]'). Values as in JsonPatch: Map with String
 * keys, List, String, numbers, Boolean and null. A parsed path is a list of String keys and Int indexes (an index
 * beyond Int.MAX_VALUE is clamped, which behaves as out of range). setPath and deletePath return new structures
 * (LinkedHashMap/ArrayList copies) and never mutate their input. Failures throw IllegalArgumentException.
 */
object DottedPath {
    private val MISSING = Any()

    /** Parses a path into String keys and Int indexes; "" is the root (an empty list). */
    fun parsePath(p: String): List<Any> {
        val out = ArrayList<Any>()
        var i = 0
        val n = p.length
        while (i < n) {
            val c = p[i]
            if (c == '[') {
                if (i + 1 < n && p[i + 1] == '"') {
                    var j = i + 2
                    val buf = StringBuilder()
                    while (true) {
                        require(j < n) { "unterminated quoted key" }
                        if (p[j] == '\\' && j + 1 < n) { buf.append(p[j + 1]); j += 2; continue }
                        if (p[j] == '"') break
                        buf.append(p[j])
                        j++
                    }
                    require(j + 1 < n && p[j + 1] == ']') { "expected ]" }
                    out.add(buf.toString())
                    i = j + 2
                } else {
                    var j = i + 1
                    while (j < n && p[j] in '0'..'9') j++
                    val digits = p.substring(i + 1, j)
                    require(digits.isNotEmpty() && !(digits.length > 1 && digits[0] == '0') && j < n && p[j] == ']') { "bad index" }
                    out.add(if (digits.length > 10) Int.MAX_VALUE else minOf(digits.toLong(), Int.MAX_VALUE.toLong()).toInt())
                    i = j + 1
                }
                if (i < n && p[i] == '.') {
                    i++
                    require(i < n) { "trailing dot" }
                }
                continue
            }
            require(c != '.') { "empty segment" }
            var j = i
            while (j < n && p[j] != '.' && p[j] != '[') j++
            out.add(p.substring(i, j))
            i = j
            if (i < n && p[i] == '.') {
                i++
                require(i < n) { "trailing dot" }
            }
        }
        return out
    }

    private fun step(cur: Any?, k: Any): Any? =
        if (k is Int) { if (cur is List<*> && k < cur.size) cur[k] else MISSING }
        else { if (cur is Map<*, *> && cur.containsKey(k)) cur[k] else MISSING }

    /** The value at path, or def when a key/index is missing or the walk hits the wrong type. */
    fun getPath(data: Any?, path: String, def: Any? = null): Any? {
        var cur = data
        for (k in parsePath(path)) {
            cur = step(cur, k)
            if (cur === MISSING) return def
        }
        return cur
    }

    /** True when every step of path exists (a stored null counts as present). */
    fun hasPath(data: Any?, path: String): Boolean = getPath(data, path, MISSING) !== MISSING

    private fun copy(v: Any?): Any? = when (v) {
        is Map<*, *> -> LinkedHashMap<String, Any?>().also { m -> for ((k, x) in v) m[k as String] = copy(x) }
        is List<*> -> ArrayList<Any?>().also { l -> for (x in v) l.add(copy(x)) }
        else -> v
    }

    @Suppress("UNCHECKED_CAST")
    private fun set(cur0: Any?, keys: List<Any>, at: Int, value: Any?): Any? {
        if (at == keys.size) return copy(value)
        val k = keys[at]
        val cur = cur0 ?: if (k is Int) ArrayList<Any?>() else LinkedHashMap<String, Any?>()
        if (k is Int) {
            require(cur is List<*>) { "index on a non-list" }
            val list = copy(cur) as ArrayList<Any?>
            require(k <= list.size) { "index out of range" }
            val v = set(if (k < list.size) list[k] else null, keys, at + 1, value)
            if (k == list.size) list.add(v) else list[k] = v
            return list
        }
        require(cur is Map<*, *>) { "key on a non-object" }
        val map = copy(cur) as LinkedHashMap<String, Any?>
        map[k as String] = set(map[k], keys, at + 1, value)
        return map
    }

    /** A new structure with value at path, creating maps/lists; index == size appends; "" returns value. */
    fun setPath(data: Any?, path: String, value: Any?): Any? = set(data, parsePath(path), 0, value)

    @Suppress("UNCHECKED_CAST")
    private fun delete(cur: Any?, keys: List<Any>, at: Int): Any? {
        val k = keys[at]
        if (step(cur, k) === MISSING) return copy(cur)
        val fresh = copy(cur)
        val last = at + 1 == keys.size
        if (k is Int) {
            val list = fresh as ArrayList<Any?>
            if (last) list.removeAt(k) else list[k] = delete((cur as List<*>)[k], keys, at + 1)
        } else {
            val map = fresh as LinkedHashMap<String, Any?>
            if (last) map.remove(k) else map[k as String] = delete((cur as Map<*, *>)[k], keys, at + 1)
        }
        return fresh
    }

    /** A new structure without the key/index at path (lists shift); missing paths give an unchanged copy, "" gives null. */
    fun deletePath(data: Any?, path: String): Any? {
        val keys = parsePath(path)
        return if (keys.isEmpty()) null else delete(data, keys, 0)
    }
}
