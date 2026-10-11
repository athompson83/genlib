// SPDX-License-Identifier: Apache-2.0

/**
 * Plain-text wrapping and truncation counted in code points. wrapText keeps input line breaks (CRLF and CR become LF),
 * fills lines greedily on runs of spaces/tabs and breaks words longer than the width. truncateText cuts at a late
 * space when one exists and appends the ellipsis. Bad widths throw IllegalArgumentException.
 */
object TextWrap {
    private val BLANKS = Regex("[ \t]+")

    private fun len(s: String) = s.codePointCount(0, s.length)

    private fun head(s: String, n: Int) = s.substring(0, s.offsetByCodePoints(0, n))

    /** Wraps text to at most width code points per line (width >= 1), joining lines with \n. */
    fun wrapText(text: String, width: Int): String {
        require(width >= 1) { "width" }
        val out = ArrayList<String>()
        for (line in text.replace("\r\n", "\n").replace('\r', '\n').split("\n")) {
            var cur = ""
            for (w0 in line.split(BLANKS)) {
                var w = w0
                if (w.isEmpty()) continue
                while (len(w) > width) {
                    if (cur.isNotEmpty()) { out.add(cur); cur = "" }
                    val h = head(w, width)
                    out.add(h)
                    w = w.substring(h.length)
                }
                if (w.isEmpty()) continue
                cur = when {
                    cur.isEmpty() -> w
                    len(cur) + 1 + len(w) <= width -> "$cur $w"
                    else -> { out.add(cur); w }
                }
            }
            out.add(cur)
        }
        return out.joinToString("\n")
    }

    /** Text unchanged when it fits maxLen code points, else cut (preferring a late space) plus the ellipsis. */
    fun truncateText(text: String, maxLen: Int, ellipsis: String = "\u2026"): String {
        if (len(text) <= maxLen) return text
        val keep = maxLen - len(ellipsis)
        require(maxLen >= 1 && keep >= 0) { "max_len" }
        var cut = head(text, keep)
        val sp = cut.lastIndexOf(' ')
        if (sp > 0 && len(cut.substring(0, sp)) >= keep / 2) cut = cut.substring(0, sp)
        return cut.trimEnd(' ') + ellipsis
    }
}
