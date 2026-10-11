// SPDX-License-Identifier: Apache-2.0

/**
 * GitHub-flavored Markdown table rendering. Cells escape \ and | and turn CRLF/CR/LF into <br>; column width is the
 * longest escaped cell in code points (at least 3). Alignment per column is "left", "right", "center", or null or
 * "none" for no colon. Lines are joined with \n without a trailing newline. An empty header list, a row of the wrong
 * width or an unknown alignment throws IllegalArgumentException.
 */
object MarkdownTable {
    private fun esc(c: String) =
        c.replace("\\", "\\\\").replace("|", "\\|").replace("\r\n", "<br>").replace("\r", "<br>").replace("\n", "<br>")

    private fun len(s: String) = s.codePointCount(0, s.length)

    private fun pad(s: String, w: Int, a: String?): String {
        val gap = w - len(s)
        return when (a) {
            "right" -> " ".repeat(gap) + s
            "center" -> " ".repeat(gap / 2) + s + " ".repeat(gap - gap / 2)
            else -> s + " ".repeat(gap)
        }
    }

    private fun sep(w: Int, a: String?): String {
        val d = CharArray(w) { '-' }
        if (a == "left" || a == "center") d[0] = ':'
        if (a == "right" || a == "center") d[w - 1] = ':'
        return String(d)
    }

    private fun line(cells: List<String>) = "| " + cells.joinToString(" | ") + " |"

    /** Renders headers and rows as a Markdown table; align may be null (no alignment) or one entry per column. */
    fun markdownTable(headers: List<String>, rows: List<List<String>>, align: List<String?>? = null): String {
        require(headers.isNotEmpty()) { "headers" }
        val n = headers.size
        val al: List<String?> = if (align == null) List(n) { null } else {
            require(align.size == n) { "align" }
            align.map { a ->
                when (a) {
                    null, "none" -> null
                    "left", "right", "center" -> a
                    else -> throw IllegalArgumentException("align")
                }
            }
        }
        require(rows.all { it.size == n }) { "row width" }
        val cells = listOf(headers.map(::esc)) + rows.map { r -> r.map(::esc) }
        val widths = (0 until n).map { i -> maxOf(3, cells.maxOf { len(it[i]) }) }
        val out = ArrayList<String>()
        cells.forEachIndexed { r, row ->
            out.add(line(row.mapIndexed { i, c -> pad(c, widths[i], al[i]) }))
            if (r == 0) out.add(line((0 until n).map { sep(widths[it], al[it]) }))
        }
        return out.joinToString("\n")
    }
}
