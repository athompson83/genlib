// SPDX-License-Identifier: Apache-2.0

/** RFC 4180 CSV reading and writing with spreadsheet formula-injection neutralization. */
object CsvSafe {
    private const val FORMULA_LEADS = "=+-@\t\r"

    /** Writes rows with CRLF record ends (including the last); [neutralizeFormulas] prefixes = + - @ TAB CR with '. */
    fun writeCsv(rows: List<List<String>>, neutralizeFormulas: Boolean = true): String {
        val out = StringBuilder()
        for (row in rows) {
            row.forEachIndexed { i, value ->
                if (i > 0) out.append(',')
                out.append(field(value, neutralizeFormulas))
            }
            out.append("\r\n")
        }
        return out.toString()
    }

    private fun field(value: String, neutralize: Boolean): String {
        val v = if (neutralize && value.isNotEmpty() && FORMULA_LEADS.indexOf(value[0]) >= 0) "'$value" else value
        val quote = v.any { it == ',' || it == '"' || it == '\r' || it == '\n' } || v.startsWith(" ") || v.endsWith(" ")
        return if (quote) "\"" + v.replace("\"", "\"\"") + "\"" else v
    }

    private fun recordEnd(text: String, i: Int) = text[i] == '\n' || text.startsWith("\r\n", i)

    /** Parses CSV with CRLF or LF record ends; strips one leading BOM. Malformed quoting throws. */
    fun parseCsv(text: String): List<List<String>> {
        val rows = mutableListOf<List<String>>()
        val n = text.length
        var i = if (text.startsWith("﻿")) 1 else 0
        var row = mutableListOf<String>()
        while (i < n) {
            val f = StringBuilder()
            if (text[i] == '"') {
                i++
                while (true) {
                    require(i < n) { "unterminated quoted field" }
                    if (text[i] == '"') {
                        if (i + 1 < n && text[i + 1] == '"') { f.append('"'); i += 2 } else { i++; break }
                    } else f.append(text[i++])
                }
                require(i >= n || text[i] == ',' || recordEnd(text, i)) { "unexpected character after closing quote at offset $i" }
            } else {
                while (i < n && text[i] != ',' && !recordEnd(text, i)) {
                    require(text[i] != '"') { "quote inside unquoted field at offset $i" }
                    f.append(text[i++])
                }
            }
            row.add(f.toString())
            if (i >= n) break
            if (text[i] == ',') {
                i++
                if (i >= n) row.add("")
                continue
            }
            i += if (text[i] == '\r') 2 else 1
            rows.add(row)
            row = mutableListOf()
        }
        if (row.isNotEmpty()) rows.add(row)
        return rows
    }
}
