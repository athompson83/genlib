// SPDX-License-Identifier: Apache-2.0

/**
 * Cache-Control (RFC 9111) parse, format and freshness. Directive values are `true` (bare directive), Long
 * (delta-seconds directives) or String (any other argument). An unterminated quote throws IllegalArgumentException.
 */
object CacheControl {
    private val DELTA = setOf("max-age", "s-maxage", "stale-while-revalidate", "stale-if-error", "max-stale", "min-fresh")
    private val TOKEN = Regex("[!#\$%&'*+\\-.^_`|~0-9A-Za-z]+")

    private fun token(s: String, i: Int): String? {
        val m = TOKEN.toPattern().matcher(s).region(i, s.length)
        return if (m.lookingAt()) m.group() else null
    }

    /** Parses a header into an ordered map; names lowercased, first occurrence wins, invalid delta values dropped. */
    fun parseCacheControl(s: String): LinkedHashMap<String, Any> {
        val out = LinkedHashMap<String, Any>()
        var i = 0
        val n = s.length
        while (i < n) {
            while (i < n && (s[i] == ' ' || s[i] == '\t' || s[i] == ',')) i++
            if (i >= n) break
            val tok = token(s, i)
            if (tok == null) {
                val j = s.indexOf(',', i)
                i = if (j < 0) n else j
                continue
            }
            val name = tok.lowercase()
            i += tok.length
            var v: Any = true
            while (i < n && (s[i] == ' ' || s[i] == '\t')) i++
            if (i < n && s[i] == '=') {
                i++
                while (i < n && (s[i] == ' ' || s[i] == '\t')) i++
                if (i < n && s[i] == '"') {
                    i++
                    val buf = StringBuilder()
                    while (true) {
                        require(i < n) { "unterminated quote" }
                        val c = s[i]
                        if (c == '\\' && i + 1 < n) { buf.append(s[i + 1]); i += 2; continue }
                        if (c == '"') { i++; break }
                        buf.append(c)
                        i++
                    }
                    v = buf.toString()
                } else {
                    val t = token(s, i) ?: ""
                    v = t
                    i += t.length
                }
            }
            val j = s.indexOf(',', i)
            i = if (j < 0) n else j
            if (name in DELTA) {
                if (v == true && name != "max-stale") continue
                if (v is String) v = digits(v) ?: continue
            }
            out.putIfAbsent(name, v)
        }
        return out
    }

    /** Formats directives in order: true as the bare name, numbers as name=N, strings quoted unless tokens. */
    fun formatCacheControl(directives: Map<String, Any>): String = directives.entries.joinToString(", ") { (k, v) ->
        when {
            v == true -> k
            v is Long || v is Int -> "$k=$v"
            v is String -> if (TOKEN.matches(v)) "$k=$v" else "$k=\"" + v.replace("\\", "\\\\").replace("\"", "\\\"") + "\""
            else -> throw IllegalArgumentException("unsupported value for $k")
        }
    }

    /** Freshness lifetime in seconds: 0 for no-store/no-cache, s-maxage for shared caches, else max-age, else null. */
    fun cacheFreshness(directives: Map<String, Any>, shared: Boolean = false): Long? {
        if ("no-store" in directives || "no-cache" in directives) return 0L
        val s = directives["s-maxage"]
        if (shared && s is Long) return s
        return directives["max-age"] as? Long
    }

    // ASCII digits only; values beyond Long range are treated as invalid and dropped.
    private fun digits(v: String): Long? = if (v.isNotEmpty() && v.all { it in '0'..'9' }) v.toLongOrNull() else null
}
