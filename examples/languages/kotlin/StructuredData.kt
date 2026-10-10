// SPDX-License-Identifier: Apache-2.0
import java.math.BigDecimal
import java.math.BigInteger

/** Script-safe JSON-LD blocks and HTML meta, Open Graph and Twitter tags. */
object StructuredData {
    private val TWITTER_CARDS = listOf("summary", "summary_large_image", "app", "player")
    private const val MAX_DEPTH = 64

    /**
     * Returns `<script type="application/ld+json">json</script>` for a Map (insertion order, e.g. mapOf/linkedMapOf)
     * or List. Values: Map, List, String, Number, Boolean and null.
     */
    fun jsonLdScript(value: Any): String {
        require(value is Map<*, *> || value is List<*>) { "JSON-LD must be a map or a list" }
        return "<script type=\"application/ld+json\">${toSafeJson(value)}</script>"
    }

    /** Compact JSON with `< > &`, U+2028 and U+2029 escaped as \uXXXX. */
    fun toSafeJson(value: Any?): String = StringBuilder().also { write(it, value, 0) }.toString()

    private fun write(out: StringBuilder, v: Any?, depth: Int) {
        require(depth <= MAX_DEPTH) { "JSON nesting exceeds $MAX_DEPTH levels" }
        when (v) {
            null -> out.append("null")
            is Boolean -> out.append(v.toString())
            is String -> writeString(out, v)
            is Number -> out.append(number(v))
            is Map<*, *> -> {
                out.append('{')
                v.entries.forEachIndexed { i, e ->
                    val key = e.key
                    require(key is String) { "JSON object keys must be strings" }
                    if (i > 0) out.append(',')
                    writeString(out, key)
                    out.append(':')
                    write(out, e.value, depth + 1)
                }
                out.append('}')
            }
            is List<*> -> {
                out.append('[')
                v.forEachIndexed { i, item -> if (i > 0) out.append(','); write(out, item, depth + 1) }
                out.append(']')
            }
            else -> throw IllegalArgumentException("unsupported JSON value type: ${v::class.java.name}")
        }
    }

    private fun number(n: Number): String {
        if (n is Int || n is Long || n is Short || n is Byte || n is BigInteger) return n.toString()
        if (n is BigDecimal) return n.toPlainString()
        val d = n.toDouble()
        require(!d.isNaN() && !d.isInfinite()) { "JSON numbers must be finite (NaN and Infinity are not allowed)" }
        if (d == Math.rint(d) && Math.abs(d) < 9_007_199_254_740_992.0) return d.toLong().toString()
        val shortest = if (n is Float) n.toString() else d.toString()
        return BigDecimal(shortest).stripTrailingZeros().toPlainString()
    }

    private fun writeString(out: StringBuilder, s: String) {
        out.append('"')
        for (c in s) when (c) {
            '"' -> out.append("\\\"")
            '\\' -> out.append("\\\\")
            '\n' -> out.append("\\n")
            '\r' -> out.append("\\r")
            '\t' -> out.append("\\t")
            '\b' -> out.append("\\b")
            '\u000c' -> out.append("\\f")
            else -> if (c.code < 0x20 || c == '<' || c == '>' || c == '&' || c.code == 0x2028 || c.code == 0x2029) {
                out.append("\\u").append(c.code.toString(16).padStart(4, '0'))
            } else out.append(c)
        }
        out.append('"')
    }

    /** Escapes `& < > "` for HTML. */
    fun htmlEscape(value: String): String =
        value.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace("\"", "&quot;")

    private fun requireHttps(field: String, value: String) {
        val ok = value.length > 8 && value.regionMatches(0, "https://", 0, 8, ignoreCase = true) &&
            value[8] !in "/?#" && value.none { it.isWhitespace() || it.isISOControl() }
        require(ok) { "$field must be an absolute https URL: $value" }
    }

    /** Renders the tags joined by \n without a trailing newline; null values are omitted. */
    fun metaTags(
        title: String, description: String? = null, canonical: String? = null, image: String? = null,
        siteName: String? = null, type: String = "website", twitterCard: String = "summary_large_image", locale: String? = null,
    ): String {
        require(title.isNotBlank()) { "title must not be empty" }
        canonical?.let { requireHttps("canonical", it) }
        image?.let { requireHttps("image", it) }
        require(type.isNotBlank()) { "type must not be empty" }
        require(twitterCard in TWITTER_CARDS) { "twitterCard must be one of ${TWITTER_CARDS.joinToString(", ")}: $twitterCard" }
        fun name(n: String, v: String) = "<meta name=\"$n\" content=\"${htmlEscape(v)}\">"
        fun prop(p: String, v: String) = "<meta property=\"$p\" content=\"${htmlEscape(v)}\">"
        val lines = mutableListOf("<title>${htmlEscape(title)}</title>")
        description?.let { lines += name("description", it) }
        canonical?.let { lines += "<link rel=\"canonical\" href=\"${htmlEscape(it)}\">" }
        lines += prop("og:title", title)
        description?.let { lines += prop("og:description", it) }
        canonical?.let { lines += prop("og:url", it) }
        image?.let { lines += prop("og:image", it) }
        siteName?.let { lines += prop("og:site_name", it) }
        lines += prop("og:type", type)
        locale?.let { lines += prop("og:locale", it) }
        lines += name("twitter:card", twitterCard)
        lines += name("twitter:title", title)
        description?.let { lines += name("twitter:description", it) }
        image?.let { lines += name("twitter:image", it) }
        return lines.joinToString("\n")
    }
}
