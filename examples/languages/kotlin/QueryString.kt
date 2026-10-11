// SPDX-License-Identifier: Apache-2.0

import java.io.ByteArrayOutputStream

/** application/x-www-form-urlencoded query strings exactly as the WHATWG URL standard parses and serializes them. */
object QueryString {
    /** Parses a query (one leading '?' allowed) into ordered name/value pairs; '+' is a space, invalid '%' stays literal. */
    fun parseQuery(query: String): List<Pair<String, String>> {
        val s = query.removePrefix("?")
        return s.split("&").filter { it.isNotEmpty() }.map { piece ->
            val eq = piece.indexOf('=')
            if (eq < 0) Pair(decode(piece), "") else Pair(decode(piece.substring(0, eq)), decode(piece.substring(eq + 1)))
        }
    }

    /** Serializes pairs: A-Z a-z 0-9 * - . _ kept, space as '+', every other UTF-8 byte as uppercase %XX. */
    fun stringifyQuery(pairs: List<Pair<String, String>>): String =
        pairs.joinToString("&") { (n, v) -> encode(n) + "=" + encode(v) }

    /** All values for name, in order. */
    fun getAll(pairs: List<Pair<String, String>>, name: String): List<String> = pairs.filter { it.first == name }.map { it.second }

    private fun hex(b: Byte): Int = when (b.toInt().toChar()) {
        in '0'..'9' -> b - '0'.code.toByte()
        in 'a'..'f' -> b - 'a'.code.toByte() + 10
        in 'A'..'F' -> b - 'A'.code.toByte() + 10
        else -> -1
    }

    private fun decode(s: String): String {
        val b = s.replace('+', ' ').toByteArray(Charsets.UTF_8)
        val out = ByteArrayOutputStream()
        var i = 0
        while (i < b.size) {
            if (b[i] == '%'.code.toByte() && i + 2 < b.size && hex(b[i + 1]) >= 0 && hex(b[i + 2]) >= 0) {
                out.write(hex(b[i + 1]) * 16 + hex(b[i + 2]))
                i += 3
            } else out.write(b[i++].toInt())
        }
        return String(out.toByteArray(), Charsets.UTF_8)
    }

    private fun encode(s: String): String {
        val sb = StringBuilder()
        for (x in s.toByteArray(Charsets.UTF_8)) {
            val c = x.toInt() and 0xff
            when {
                c in 'A'.code..'Z'.code || c in 'a'.code..'z'.code || c in '0'.code..'9'.code || c == '*'.code || c == '-'.code || c == '.'.code || c == '_'.code -> sb.append(c.toChar())
                c == ' '.code -> sb.append('+')
                else -> sb.append("%%%02X".format(c))
            }
        }
        return sb.toString()
    }
}
