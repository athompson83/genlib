// SPDX-License-Identifier: Apache-2.0

/**
 * HTML escaping for text and quoted attributes, unescaping of numeric references (1-10 decimal or 1-8 hex digits,
 * ';' required, C1 0x80-0x9F mapped per the HTML5 windows-1252 table, invalid values to U+FFFD) and a fixed set of
 * named references, and stripTags for plain-text previews.
 */
object HtmlEscape {
    private val NAMED = mapOf(
        "amp" to "&", "lt" to "<", "gt" to ">", "quot" to "\"", "apos" to "'", "nbsp" to "\u00a0", "copy" to "\u00a9",
        "reg" to "\u00ae", "trade" to "\u2122", "hellip" to "\u2026", "mdash" to "\u2014", "ndash" to "\u2013",
        "lsquo" to "\u2018", "rsquo" to "\u2019", "ldquo" to "\u201c", "rdquo" to "\u201d", "bull" to "\u2022",
        "middot" to "\u00b7", "deg" to "\u00b0", "plusmn" to "\u00b1", "times" to "\u00d7", "divide" to "\u00f7",
        "euro" to "\u20ac", "pound" to "\u00a3", "yen" to "\u00a5", "cent" to "\u00a2", "sect" to "\u00a7",
        "para" to "\u00b6", "laquo" to "\u00ab", "raquo" to "\u00bb", "iexcl" to "\u00a1", "iquest" to "\u00bf",
        "shy" to "\u00ad",
    )
    private val C1 = intArrayOf(
        0x20AC, 0x81, 0x201A, 0x0192, 0x201E, 0x2026, 0x2020, 0x2021, 0x02C6, 0x2030, 0x0160, 0x2039, 0x0152, 0x8D, 0x017D, 0x8F,
        0x90, 0x2018, 0x2019, 0x201C, 0x201D, 0x2022, 0x2013, 0x2014, 0x02DC, 0x2122, 0x0161, 0x203A, 0x0153, 0x9D, 0x017E, 0x0178,
    )
    private val REF = Regex("&(#[xX][0-9A-Fa-f]{1,8}|#[0-9]{1,10}|[A-Za-z][A-Za-z0-9]{0,31});")
    private val SCRIPT = Regex("(?isU)<(script|style)\\b[^>]*>.*?(?:</\\1\\s*>|(?=\\n?\\z))")
    private val TAG = Regex("<[A-Za-z/!?][^>]*>")

    /** Escapes & < > " ' for HTML text and single- or double-quoted attributes. */
    fun escapeHtml(s: String): String =
        s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace("\"", "&quot;").replace("'", "&#39;")

    private fun numeric(v: Long): String {
        if (v == 0L || v in 0xD800L..0xDFFFL || v > 0x10FFFF) return "\uFFFD"
        val cp = if (v in 0x80L..0x9FL) C1[(v - 0x80).toInt()] else v.toInt()
        return String(Character.toChars(cp))
    }

    /** Decodes numeric and the fixed named character references; unknown names and references without ';' stay. */
    fun unescapeHtml(s: String): String = REF.replace(s) { m ->
        val g = m.groupValues[1]
        if (g[0] == '#') {
            val v = if (g[1] == 'x' || g[1] == 'X') g.substring(2).toLong(16) else g.substring(1).toLong()
            numeric(minOf(v, 0x110000L))
        } else {
            NAMED[g] ?: m.value
        }
    }

    /** Plain-text preview: drops script/style contents, removes tags, then unescapes. NOT a sanitizer for HTML output. */
    fun stripTags(s: String): String = unescapeHtml(TAG.replace(SCRIPT.replace(s, ""), ""))
}
