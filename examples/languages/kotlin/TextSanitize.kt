// SPDX-License-Identifier: Apache-2.0

/**
 * Removes control, bidirectional and invisible characters from user text (Trojan Source, CVE-2021-42574), keeps
 * ZWNJ/ZWJ (U+200C/U+200D) for emoji sequences and Indic/Persian text, and normalizes whitespace.
 */
object TextSanitize {
    private val BIDI = setOf(0x061C, 0x200E, 0x200F, 0x202A, 0x202B, 0x202C, 0x202D, 0x202E, 0x2066, 0x2067, 0x2068, 0x2069)
    private val INVISIBLE = setOf(0x200B, 0x2060, 0xFEFF)
    private val WHITESPACE = Regex("[ \\t\\n\\r\\f\\x0B]+")

    /** A bidirectional control at a code point [index], with its uppercase [hex] code (e.g. "202E"). */
    data class BidiControl(val index: Int, val hex: String)

    private fun isControl(cp: Int) = cp < 0x20 || cp in 0x7f..0x9f

    /** CRLF/CR to LF, keep LF (or a space) and TAB, drop other controls, bidi controls and invisible characters, then truncate to [maxLength] code points. */
    fun sanitizeText(text: String, allowNewlines: Boolean = true, maxLength: Int? = null): String {
        require(maxLength == null || maxLength >= 0) { "maxLength must be non-negative" }
        val t = text.replace("\r\n", "\n").replace('\r', '\n')
        val out = StringBuilder()
        var kept = 0
        for (cp in t.codePoints().toArray()) {
            if (maxLength != null && kept >= maxLength) break
            when {
                cp == '\n'.code -> out.append(if (allowNewlines) '\n' else ' ')
                cp == '\t'.code -> out.append('\t')
                isControl(cp) || cp in BIDI || cp in INVISIBLE -> continue
                else -> out.appendCodePoint(cp)
            }
            kept++
        }
        return out.toString()
    }

    /** Bidirectional controls with their code point indexes; non-empty means the text can display differently from its logic. */
    fun findBidiControls(text: String): List<BidiControl> =
        text.codePoints().toArray().withIndex().filter { it.value in BIDI }.map { BidiControl(it.index, "%04X".format(it.value)) }

    /** Collapses runs of space, tab, LF, CR, FF and VT into one space and trims leading/trailing spaces. */
    fun normalizeWhitespace(text: String): String = text.replace(WHITESPACE, " ").trim(' ')
}
