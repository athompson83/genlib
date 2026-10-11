// SPDX-License-Identifier: Apache-2.0

import java.io.ByteArrayOutputStream
import java.nio.ByteBuffer
import java.nio.charset.CharacterCodingException
import java.nio.charset.CodingErrorAction

/**
 * HTTP Link header (RFC 8288): parse with quoted strings and RFC 8187 extended values, find by rel, and format.
 * Malformed input throws IllegalArgumentException.
 */
object LinkHeader {
    /** One link: target URI and its parameters in order (names lowercased, rel lowercased and space-collapsed). */
    data class Link(val uri: String, val params: LinkedHashMap<String, String>)

    private val TOKEN = Regex("[!#\$%&'*+\\-.^_`|~0-9A-Za-z]+")
    private val UNQUOTED = Regex("(?U)[^,;\\s]*")
    private val EXT = Regex("(?d)([A-Za-z0-9!#\$&+\\-^_`{}~]+)'([A-Za-z0-9-]*)'(.*)")
    private val BAD_PCT = Regex("%(?![0-9A-Fa-f]{2})")
    private val WORDS = Regex("(?U)[\\s\\x1c-\\x1f]+")
    private const val ATTR = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!#\$&+-.^_`|~"

    private fun extValue(v: String): String {
        val m = EXT.matchEntire(v) ?: throw IllegalArgumentException("bad extended value")
        val cs = m.groupValues[1].lowercase()
        require(cs == "utf-8" || cs == "iso-8859-1") { "unsupported charset" }
        val enc = m.groupValues[3]
        require(!BAD_PCT.containsMatchIn(enc)) { "bad percent-encoding" }
        val b = enc.toByteArray(Charsets.UTF_8)
        val out = ByteArrayOutputStream()
        var i = 0
        while (i < b.size) {
            if (b[i] == '%'.code.toByte()) { out.write(String(b, i + 1, 2, Charsets.US_ASCII).toInt(16)); i += 3 } else out.write(b[i++].toInt())
        }
        if (cs == "iso-8859-1") return String(out.toByteArray(), Charsets.ISO_8859_1)
        return try {
            Charsets.UTF_8.newDecoder().onMalformedInput(CodingErrorAction.REPORT)
                .onUnmappableCharacter(CodingErrorAction.REPORT).decode(ByteBuffer.wrap(out.toByteArray())).toString()
        } catch (e: CharacterCodingException) {
            throw IllegalArgumentException("invalid UTF-8")
        }
    }

    private fun lookingAt(re: Regex, s: String, i: Int): String? {
        val m = re.toPattern().matcher(s).region(i, s.length)
        return if (m.lookingAt()) m.group() else null
    }

    private fun words(s: String) = s.split(WORDS).filter { it.isNotEmpty() }

    /** Parses a Link header value into links in order; commas inside <...> or quotes do not split. */
    fun parseLinkHeader(s: String): List<Link> {
        var i = 0
        val n = s.length
        val links = mutableListOf<Link>()
        fun ws() { while (i < n && (s[i] == ' ' || s[i] == '\t')) i++ }
        while (true) {
            ws()
            if (i >= n) break
            if (s[i] == ',') { i++; continue }
            require(s[i] == '<') { "expected <" }
            val end = s.indexOf('>', i)
            require(end >= 0) { "unterminated <" }
            val uri = s.substring(i + 1, end)
            i = end + 1
            val params = LinkedHashMap<String, String>()
            val ext = HashSet<String>()
            while (true) {
                ws()
                if (i >= n || s[i] == ',') break
                require(s[i] == ';') { "expected ;" }
                i++
                ws()
                val tok = lookingAt(TOKEN, s, i) ?: throw IllegalArgumentException("expected parameter name")
                val name = tok.lowercase()
                i += tok.length
                ws()
                var v = ""
                if (i < n && s[i] == '=') {
                    i++
                    ws()
                    if (i < n && s[i] == '"') {
                        i++
                        val buf = StringBuilder()
                        while (true) {
                            require(i < n) { "unterminated quote" }
                            val c = s[i]
                            if (c == '\\' && i + 1 < n) { buf.append(s[i + 1]); i += 2; continue }
                            if (c == '"') { i++; break }
                            buf.append(c)
                            i++
                        }
                        v = buf.toString()
                    } else {
                        v = lookingAt(UNQUOTED, s, i) ?: ""
                        i += v.length
                    }
                }
                if (name.endsWith("*")) {
                    val base = name.dropLast(1)
                    params[base] = extValue(v)
                    ext.add(base)
                } else if (name !in ext && name !in params) params[name] = v
            }
            params["rel"]?.let { params["rel"] = words(it.lowercase()).joinToString(" ") }
            links.add(Link(uri, params))
        }
        return links
    }

    /** First link whose rel list contains rel (case-insensitive), or null. */
    fun findRel(links: List<Link>, rel: String): Link? {
        val want = rel.lowercase()
        return links.firstOrNull { want in words(it.params["rel"] ?: "") }
    }

    /** Formats links as a header value: rel always quoted, other values quoted unless tokens, non-ASCII as name*=UTF-8''. */
    fun formatLinkHeader(links: List<Link>): String = links.joinToString(", ") { l ->
        val parts = mutableListOf("<${l.uri}>")
        for ((k, v) in l.params) {
            if (v.any { it.code > 0x7e || it.code < 0x20 }) {
                val sb = StringBuilder("$k*=UTF-8''")
                v.codePoints().forEach { cp ->
                    if (cp < 128 && ATTR.indexOf(cp.toChar()) >= 0) sb.append(cp.toChar())
                    else for (b in String(Character.toChars(cp)).toByteArray(Charsets.UTF_8)) sb.append("%%%02X".format(b.toInt() and 0xff))
                }
                parts.add(sb.toString())
            } else if (TOKEN.matches(v) && k != "rel") parts.add("$k=$v")
            else parts.add("$k=\"" + v.replace("\\", "\\\\").replace("\"", "\\\"") + "\"")
        }
        parts.joinToString("; ")
    }
}
