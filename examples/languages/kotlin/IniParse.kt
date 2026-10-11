// SPDX-License-Identifier: Apache-2.0

/**
 * INI files (the common subset of git config, PHP and Python configparser). parseIni returns ordered sections of
 * ordered keys with section "" (keys before any header) always first. ';' and '#' start comment lines; a repeated
 * [section] continues the earlier one; a line splits at the first '=' or ':'; inline comments start at whitespace
 * followed by ';' or '#'; double-quoted values support \\ \" \n \t; a bare key has value ""; the last duplicate key
 * wins in its first position; CRLF is accepted. Errors throw IllegalArgumentException with a 1-based line number.
 */
object IniParse {
    private fun space(c: Char) = Character.isWhitespace(c) || Character.isSpaceChar(c) || c == '\u0085'

    private fun strip(s: String) = s.trim { space(it) }

    /** Parses INI text into section -> key -> value, preserving order; section "" is always present first. */
    fun parseIni(text: String): LinkedHashMap<String, LinkedHashMap<String, String>> {
        val out = LinkedHashMap<String, LinkedHashMap<String, String>>()
        var cur = LinkedHashMap<String, String>()
        out[""] = cur
        for ((index, line) in text.replace("\r\n", "\n").split("\n").withIndex()) {
            val no = index + 1
            val s = strip(line)
            if (s.isEmpty() || s[0] == ';' || s[0] == '#') continue
            if (s[0] == '[') {
                require(s.endsWith("]")) { "line $no: unterminated section header" }
                val name = strip(s.substring(1, s.length - 1))
                require(name.isNotEmpty() && ']' !in name) { "line $no: bad section name" }
                cur = out.getOrPut(name) { LinkedHashMap() }
                continue
            }
            val i = listOf(s.indexOf('='), s.indexOf(':')).filter { it >= 0 }.minOrNull()
            val key = if (i != null) strip(s.substring(0, i)) else s
            var value = if (i != null) strip(s.substring(i + 1)) else ""
            require(key.isNotEmpty()) { "line $no: empty key" }
            if (value.startsWith("\"")) {
                val buf = StringBuilder()
                var j = 1
                var closed = false
                while (j < value.length) {
                    val c = value[j]
                    if (c == '\\' && j + 1 < value.length) {
                        val e = value[j + 1]
                        buf.append(when (e) { 'n' -> '\n'; 't' -> '\t'; else -> e })
                        j += 2
                        continue
                    }
                    if (c == '"') { closed = true; break }
                    buf.append(c)
                    j++
                }
                require(closed) { "line $no: unterminated quote" }
                value = buf.toString()
            } else {
                val cut = listOf(" ;", " #", "\t;", "\t#").map { value.indexOf(it) }.filter { it >= 0 }.minOrNull()
                if (cut != null) value = value.substring(0, cut).trimEnd { space(it) }
            }
            cur[key] = value
        }
        return out
    }

    private fun quote(v: String): String {
        val needs = v.isEmpty() || v != strip(v) || v.any { it in ";#\"\\\n\t" }
        if (!needs) return v
        return "\"" + v.replace("\\", "\\\\").replace("\"", "\\\"").replace("\n", "\\n").replace("\t", "\\t") + "\""
    }

    /** Writes section "" first (no header), then [name] blocks separated by blank lines, quoting values when needed. */
    fun stringifyIni(data: Map<String, Map<String, String>>): String {
        val blocks = ArrayList<String>()
        val top = data[""].orEmpty()
        if (top.isNotEmpty()) blocks.add(top.entries.joinToString("\n") { "${it.key} = ${quote(it.value)}" })
        for ((name, kv) in data) {
            if (name.isEmpty()) continue
            blocks.add((listOf("[$name]") + kv.entries.map { "${it.key} = ${quote(it.value)}" }).joinToString("\n"))
        }
        return blocks.joinToString("\n\n") + if (blocks.isEmpty()) "" else "\n"
    }
}
