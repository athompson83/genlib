// SPDX-License-Identifier: Apache-2.0

import java.io.ByteArrayOutputStream
import java.nio.ByteBuffer
import java.nio.charset.CharacterCodingException
import java.nio.charset.CodingErrorAction
import java.util.Base64

/** data: URLs (RFC 2397 with the WHATWG fetch rules simplified): parse to bytes and build. Errors throw IllegalArgumentException. */
object DataUri {
    /** A parsed data: URL: lowercased media type, ordered parameters, whether it was base64 and the decoded bytes. */
    class Parsed(val mime: String, val params: LinkedHashMap<String, String>, val base64: Boolean, val data: ByteArray)

    private const val TOKEN = "[!#\$%&'*+\\-.^_`|~0-9A-Za-z]+"
    private val MIME = Regex("$TOKEN/$TOKEN")
    private val MEDIA = Regex("(?U)$TOKEN/$TOKEN(\\s*;\\s*$TOKEN=[^;,\\s]+)*")
    private val B64 = Regex("(?U);\\s*base64\\s*$", RegexOption.IGNORE_CASE)
    private const val KEEP = "-_.!~*'();/?:@&=+\$,"

    /** Parses a data: URL; an empty or invalid media type becomes text/plain with charset US-ASCII. */
    fun parseDataUri(url: String): Parsed {
        require(url.length >= 5 && url.substring(0, 5).lowercase() == "data:") { "not a data: URL" }
        val rest = url.substring(5)
        val comma = rest.indexOf(',')
        require(comma >= 0) { "missing comma" }
        var header = rest.substring(0, comma).trim()
        val body = rest.substring(comma + 1)
        var isB64 = false
        B64.find(header)?.let { isB64 = true; header = header.substring(0, it.range.first) }
        val parts = header.split(";")
        var mime = parts[0].trim().lowercase()
        var params = LinkedHashMap<String, String>()
        for (p in parts.drop(1)) {
            val eq = p.indexOf('=')
            if (eq < 0) continue
            val k = p.substring(0, eq).trim().lowercase()
            if (k.isNotEmpty() && k !in params) params[k] = p.substring(eq + 1).trim()
        }
        if (!MIME.matches(mime)) {
            mime = "text/plain"
            if ("charset" !in params) params = LinkedHashMap<String, String>().apply { put("charset", "US-ASCII"); putAll(params) }
        }
        var data = pct(body)
        if (isB64) {
            val s = StringBuilder()
            for (b in data) if (b.toInt().toChar() !in "\t\n\u000c\r ") s.append((b.toInt() and 0xff).toChar())
            if (s.endsWith("==")) s.setLength(s.length - 2) else if (s.endsWith("=")) s.setLength(s.length - 1)
            require(s.length % 4 != 1 && s.all { it in 'A'..'Z' || it in 'a'..'z' || it in '0'..'9' || it == '+' || it == '/' }) { "invalid base64" }
            data = Base64.getDecoder().decode(s.toString())
        }
        return Parsed(mime, params, isB64, data)
    }

    /** Builds a data: URL; base64 null picks percent-encoding only for textual types whose bytes are valid UTF-8. */
    fun buildDataUri(data: ByteArray, mime: String = "application/octet-stream", base64: Boolean? = null): String {
        require(MEDIA.matches(mime)) { "invalid media type" }
        val useB64 = base64 ?: run {
            val base = mime.split(";")[0].trim().lowercase()
            val textual = base.startsWith("text/") || base.endsWith("+json") || base.endsWith("+xml") ||
                base == "application/json" || base == "application/xml" || base == "application/javascript"
            !(textual && validUtf8(data))
        }
        if (useB64) return "data:$mime;base64," + Base64.getEncoder().encodeToString(data)
        val sb = StringBuilder("data:").append(mime).append(',')
        for (x in data) {
            val b = x.toInt() and 0xff
            val c = b.toChar()
            if (c in 'A'..'Z' || c in 'a'..'z' || c in '0'..'9' || (b < 128 && c in KEEP)) sb.append(c) else sb.append("%%%02X".format(b))
        }
        return sb.toString()
    }

    private fun validUtf8(data: ByteArray): Boolean = try {
        Charsets.UTF_8.newDecoder().onMalformedInput(CodingErrorAction.REPORT)
            .onUnmappableCharacter(CodingErrorAction.REPORT).decode(ByteBuffer.wrap(data))
        true
    } catch (e: CharacterCodingException) {
        false
    }

    private fun hex(b: Byte): Int = Character.digit(b.toInt() and 0xff, 16).let { if ((b.toInt() and 0xff) < 128) it else -1 }

    private fun pct(s: String): ByteArray {
        val b = s.toByteArray(Charsets.UTF_8)
        val out = ByteArrayOutputStream()
        var i = 0
        while (i < b.size) {
            if (b[i] == '%'.code.toByte() && i + 2 < b.size && hex(b[i + 1]) >= 0 && hex(b[i + 2]) >= 0) {
                out.write(hex(b[i + 1]) * 16 + hex(b[i + 2]))
                i += 3
            } else out.write(b[i++].toInt())
        }
        return out.toByteArray()
    }
}
