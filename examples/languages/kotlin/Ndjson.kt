// SPDX-License-Identifier: Apache-2.0
import java.math.BigDecimal
import java.math.BigInteger

/**
 * Newline-delimited JSON. parseNdjson splits on \n (dropping a trailing \r), skips blank lines (spaces/tabs only) and
 * parses each other line with JsonPatch.parse, so values are LinkedHashMap, ArrayList, String, Long or Double,
 * Boolean and null. A bad line throws IllegalArgumentException whose message starts with "line N" (1-based).
 * stringifyNdjson writes each value compactly with object keys in insertion order, escaping only " \ and control
 * characters (lowercase \u00XX), keeping non-ASCII as is, and ends every value with \n.
 */
object Ndjson {
    /** Parses NDJSON text into its values; errors name the 1-based line. */
    fun parseNdjson(text: String): List<Any?> {
        val out = ArrayList<Any?>()
        text.split("\n").forEachIndexed { i, raw ->
            val line = raw.removeSuffix("\r")
            if (line.trim(' ', '\t').isEmpty()) return@forEachIndexed
            try {
                out.add(JsonPatch.parse(line))
            } catch (e: IllegalArgumentException) {
                throw IllegalArgumentException("line ${i + 1}: ${e.message}", e)
            }
        }
        return out
    }

    /** One compact JSON value per line, each followed by \n ("" for no values). */
    fun stringifyNdjson(values: List<Any?>): String {
        val out = StringBuilder()
        for (v in values) {
            write(v, out)
            out.append('\n')
        }
        return out.toString()
    }

    private fun write(v: Any?, out: StringBuilder) {
        when (v) {
            null -> out.append("null")
            is Boolean -> out.append(v)
            is String -> writeString(v, out)
            is Long, is Int, is Short, is Byte, is BigInteger -> out.append(v)
            is Double, is Float -> {
                val d = v.toDouble()
                require(d.isFinite()) { "JSON has no NaN or infinity" }
                out.append(if (d == Math.rint(d)) BigDecimal(d).toBigInteger().toString() else d.toString())
            }
            is Map<*, *> -> {
                out.append('{')
                var first = true
                for ((k, x) in v) {
                    require(k is String) { "object keys must be strings" }
                    if (!first) out.append(',')
                    first = false
                    writeString(k, out)
                    out.append(':')
                    write(x, out)
                }
                out.append('}')
            }
            is List<*> -> {
                out.append('[')
                v.forEachIndexed { i, x -> if (i > 0) out.append(','); write(x, out) }
                out.append(']')
            }
            else -> throw IllegalArgumentException("not a JSON value: ${v::class.java.name}")
        }
    }

    private fun writeString(s: String, out: StringBuilder) {
        out.append('"')
        for (c in s) {
            when (c) {
                '"' -> out.append("\\\"")
                '\\' -> out.append("\\\\")
                '\b' -> out.append("\\b")
                '\u000c' -> out.append("\\f")
                '\n' -> out.append("\\n")
                '\r' -> out.append("\\r")
                '\t' -> out.append("\\t")
                else -> if (c < ' ') out.append(String.format("\\u%04x", c.code)) else out.append(c)
            }
        }
        out.append('"')
    }
}
