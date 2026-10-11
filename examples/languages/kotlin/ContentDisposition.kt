// SPDX-License-Identifier: Apache-2.0

import java.io.ByteArrayOutputStream
import java.nio.ByteBuffer
import java.nio.charset.CharacterCodingException
import java.nio.charset.CodingErrorAction

/**
 * Content-Disposition (RFC 6266 + RFC 8187): build a safe attachment/inline header, parse one, and sanitize file names.
 * Malformed headers throw IllegalArgumentException.
 */
object ContentDisposition {
    /** A parsed header: lowercased type, sanitized file name (filename* preferred) or null, and raw parameters. */
    data class Disposition(val type: String, val filename: String?, val params: LinkedHashMap<String, String>)

    private val TYPE = Regex("(?U)\\s*([!#\$%&'*+\\-.^_`|~0-9A-Za-z]+)\\s*")
    private val TOKEN = Regex("[!#\$%&'*+\\-.^_`|~0-9A-Za-z]+")
    private val UNQUOTED = Regex("(?U)[^;\\s]*")
    private val EXT = Regex("(?d)([A-Za-z0-9!#\$&+\\-^_`{}~]+)'([A-Za-z0-9-]*)'(.*)")
    private val BAD_PCT = Regex("%(?![0-9A-Fa-f]{2})")
    private const val ATTR = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!#\$&+-.^_`|~"

    /** Replaces / \ " and control characters with '_', trims spaces and dots at both ends; empty becomes "download". */
    fun sanitizeFilename(name: String): String {
        val out = name.map { if (it == '/' || it == '\\' || it == '"' || it.code < 0x20 || it.code == 0x7f) '_' else it }
            .joinToString("").trim { it == ' ' || it == '.' }
        return out.ifEmpty { "download" }
    }

    /** Builds an attachment (or inline) header; non-ASCII names get an ASCII fallback plus filename*=UTF-8''. */
    fun buildContentDisposition(filename: String, inline: Boolean = false): String {
        val name = sanitizeFilename(filename)
        val kind = if (inline) "inline" else "attachment"
        if (name.all { it.code in 0x20 until 0x7f }) return "$kind; filename=\"$name\""
        val fallback = StringBuilder()
        val enc = StringBuilder()
        name.codePoints().forEach { cp ->
            fallback.append(if (cp in 0x20 until 0x7f) cp.toChar() else '_')
            if (cp < 128 && ATTR.indexOf(cp.toChar()) >= 0) enc.append(cp.toChar())
            else for (b in String(Character.toChars(cp)).toByteArray(Charsets.UTF_8)) enc.append("%%%02X".format(b.toInt() and 0xff))
        }
        return "$kind; filename=\"$fallback\"; filename*=UTF-8''$enc"
    }

    private fun lookingAt(re: Regex, s: String, i: Int): java.util.regex.Matcher? {
        val m = re.toPattern().matcher(s).region(i, s.length)
        return if (m.lookingAt()) m else null
    }

    /** Parses a Content-Disposition header value. */
    fun parseContentDisposition(s: String): Disposition {
        val m = lookingAt(TYPE, s, 0) ?: throw IllegalArgumentException("missing disposition type")
        val kind = m.group(1).lowercase()
        var i = m.end()
        val n = s.length
        val params = LinkedHashMap<String, String>()
        fun ws() { while (i < n && (s[i] == ' ' || s[i] == '\t')) i++ }
        while (i < n) {
            require(s[i] == ';') { "expected ;" }
            i++
            ws()
            if (i >= n) break
            val t = lookingAt(TOKEN, s, i) ?: throw IllegalArgumentException("expected parameter")
            val name = t.group().lowercase()
            i = t.end()
            ws()
            require(i < n && s[i] == '=') { "expected =" }
            i++
            ws()
            val v: String
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
                val u = lookingAt(UNQUOTED, s, i)!!
                v = u.group()
                i = u.end()
            }
            ws()
            if (name.endsWith("*")) params[name.dropLast(1)] = extValue(v)
            else if (name !in params) params[name] = v
        }
        return Disposition(kind, params["filename"]?.let { sanitizeFilename(it) }, params)
    }

    private fun extValue(v: String): String {
        val m = EXT.matchEntire(v) ?: throw IllegalArgumentException("bad extended value")
        val cs = m.groupValues[1].lowercase()
        require(cs == "utf-8" || cs == "iso-8859-1") { "bad extended value" }
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
}
