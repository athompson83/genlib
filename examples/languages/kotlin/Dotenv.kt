// SPDX-License-Identifier: Apache-2.0

/**
 * .env file parser: comments, 'export ', unquoted (trimmed, ' #' comments), single-quoted (literal) and double-quoted
 * (multi-line, escapes) values, optional ${NAME} / ${NAME:-default} expansion. Errors throw IllegalArgumentException
 * with a message starting "line N:".
 */
object Dotenv {
    private val KEY = Regex("[A-Za-z_][A-Za-z0-9_.]*")
    private val REF = Regex("(?<!\\x00)\\$\\{([A-Za-z_][A-Za-z0-9_.]*)(:-([^}]*))?\\}")

    /** Parses .env text into an ordered map; with expand, ${NAME} and ${NAME:-default} resolve from earlier keys, then vars. */
    fun parseDotenv(text: String, expand: Boolean = false, vars: Map<String, String> = emptyMap()): LinkedHashMap<String, String> {
        val lines = text.replace("\r\n", "\n").split("\n")
        var out = LinkedHashMap<String, String>()
        val single = HashMap<String, Boolean>()
        var i = 0
        while (i < lines.size) {
            val no = i + 1
            var s = strip(lines[i])
            i++
            if (s.isEmpty() || s.startsWith("#")) continue
            if (s.startsWith("export ")) s = lstrip(s.substring(7))
            val eq = s.indexOf('=')
            require(eq >= 0) { "line $no: expected KEY=VALUE" }
            val key = strip(s.substring(0, eq))
            val rest = lstrip(s.substring(eq + 1))
            require(KEY.matches(key)) { "line $no: invalid key '$key'" }
            val value: String
            val tail: String
            var isSingle = false
            if (rest.startsWith("'")) {
                val end = rest.indexOf('\'', 1)
                require(end >= 0) { "line $no: unterminated single quote" }
                value = rest.substring(1, end)
                tail = rest.substring(end + 1)
                isSingle = true
            } else if (rest.startsWith("\"")) {
                var buf = rest.substring(1)
                val v = StringBuilder()
                var j = 0
                var t: String
                while (true) {
                    var closed = false
                    while (j < buf.length) {
                        val c = buf[j]
                        if (c == '\\' && j + 1 < buf.length) {
                            when (val n = buf[j + 1]) {
                                'n' -> v.append('\n')
                                'r' -> v.append('\r')
                                't' -> v.append('\t')
                                '"' -> v.append('"')
                                '\\' -> v.append('\\')
                                '$' -> v.append("\u0000$")
                                else -> v.append('\\').append(n)
                            }
                            j += 2
                            continue
                        }
                        if (c == '"') { closed = true; break }
                        v.append(c)
                        j++
                    }
                    if (closed) { t = buf.substring(j + 1); break }
                    require(i < lines.size) { "line $no: unterminated double quote" }
                    v.append('\n')
                    buf = lines[i]
                    i++
                    j = 0
                }
                value = v.toString()
                tail = t
            } else {
                var cut = rest.length
                for (k in 1 until rest.length) if (rest[k] == '#' && isSpace(rest[k - 1])) { cut = k - 1; break }
                value = strip(rest.substring(0, cut))
                tail = ""
            }
            val tt = strip(tail)
            require(tt.isEmpty() || tt.startsWith("#")) { "line $no: unexpected text after closing quote" }
            out[key] = value
            single[key] = isSingle
        }
        if (expand) {
            val done = LinkedHashMap<String, String>()
            for ((k, v0) in out) {
                var v = v0
                if (single[k] != true) {
                    v = REF.replace(v) { m ->
                        val name = m.groupValues[1]
                        val dflt = m.groups[3]?.value
                        val got = if (done.containsKey(name)) done[name] else vars[name]
                        if (!got.isNullOrEmpty()) got else dflt ?: ""
                    }
                }
                done[k] = v
            }
            out = done
        }
        for (k in out.keys) out[k] = out.getValue(k).replace("\u0000$", "$")
        return out
    }

    private fun isSpace(c: Char) = c == ' ' || c in '\t'..'\r' || c in '\u001c'..'\u001f' || c == '\u0085' || c == ' ' ||
        c == ' ' || c in ' '..' ' || c == ' ' || c == ' ' || c == ' ' || c == ' ' || c == '　'

    private fun lstrip(s: String) = s.trimStart { isSpace(it) }

    private fun strip(s: String) = s.trim { isSpace(it) }
}
