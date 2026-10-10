// SPDX-License-Identifier: Apache-2.0
import java.io.ByteArrayOutputStream
import java.nio.ByteBuffer
import java.nio.charset.CharacterCodingException
import java.nio.charset.CodingErrorAction

/** Campaign (UTM) links: build, parse and strip click-tracking parameters. No network access. */
object UtmLinks {
    /** UTM keys (without utm_) in output order. */
    val UTM_KEYS = listOf("id", "source", "medium", "campaign", "term", "content")
    /** Non-UTM click identifiers removed by [stripTracking]. */
    val TRACKING_PARAMS = setOf(
        "gclid", "gbraid", "wbraid", "fbclid", "msclkid", "ttclid", "twclid", "li_fat_id", "mc_cid", "mc_eid",
        "_hsenc", "_hsmi", "yclid", "igshid",
    )

    data class Utm(
        val source: String, val medium: String, val campaign: String,
        val term: String? = null, val content: String? = null, val id: String? = null,
    )

    private class Parts(url: String) {
        val base: String
        val query: String?
        val fragment: String?

        init {
            val hash = url.indexOf('#')
            val rest = if (hash < 0) url else url.substring(0, hash)
            fragment = if (hash < 0) null else url.substring(hash + 1)
            val q = rest.indexOf('?')
            base = if (q < 0) rest else rest.substring(0, q)
            query = if (q < 0) null else rest.substring(q + 1)
        }

        fun params(): MutableList<String> = query?.split('&')?.filter { it.isNotEmpty() }?.toMutableList() ?: mutableListOf()

        fun join(params: List<String>): String = buildString {
            append(base)
            if (params.isNotEmpty()) append('?').append(params.joinToString("&"))
            if (fragment != null) append('#').append(fragment)
        }
    }

    private fun rawKey(param: String) = param.substringBefore('=')

    /** Percent-encodes UTF-8, keeping RFC 3986 unreserved characters. */
    fun percentEncode(value: String): String = buildString {
        for (b in value.toByteArray(Charsets.UTF_8)) {
            val c = b.toInt() and 0xff
            if (c in 'A'.code..'Z'.code || c in 'a'.code..'z'.code || c in '0'.code..'9'.code || c.toChar() in "-._~") append(c.toChar())
            else append('%').append(c.toString(16).uppercase().padStart(2, '0'))
        }
    }

    /** Decodes %XX and + (as space) into UTF-8; malformed input throws. */
    fun percentDecode(value: String): String {
        val raw = value.toByteArray(Charsets.UTF_8)
        val bytes = ByteArrayOutputStream()
        var i = 0
        while (i < raw.size) {
            val b = raw[i].toInt() and 0xff
            when (b) {
                '+'.code -> bytes.write(' '.code)
                '%'.code -> {
                    val hi = if (i + 1 < raw.size) Character.digit(raw[i + 1].toInt(), 16) else -1
                    val lo = if (i + 2 < raw.size) Character.digit(raw[i + 2].toInt(), 16) else -1
                    require(hi >= 0 && lo >= 0) { "malformed percent-encoding in $value" }
                    bytes.write(hi * 16 + lo)
                    i += 2
                }
                else -> bytes.write(b)
            }
            i++
        }
        return try {
            Charsets.UTF_8.newDecoder().onMalformedInput(CodingErrorAction.REPORT)
                .onUnmappableCharacter(CodingErrorAction.REPORT).decode(ByteBuffer.wrap(bytes.toByteArray())).toString()
        } catch (e: CharacterCodingException) {
            throw IllegalArgumentException("percent-encoded value is not UTF-8: $value", e)
        }
    }

    private fun validateBase(url: String) {
        val lower = url.lowercase()
        val rest = when {
            lower.startsWith("https://") -> lower.substring(8)
            lower.startsWith("http://") -> lower.substring(7)
            else -> null
        }
        val ok = rest != null && rest.isNotEmpty() && rest[0] !in "/?#" && url.none { it.isWhitespace() || it.isISOControl() }
        require(ok) { "base URL must be an absolute http(s) URL: $url" }
    }

    /** Appends, or replaces in place, utm_* parameters (trimmed, lowercased), keeping the fragment last. */
    fun buildUtmUrl(baseUrl: String, utm: Utm): String {
        validateBase(baseUrl)
        require(utm.source.isNotBlank()) { "source is required" }
        require(utm.medium.isNotBlank()) { "medium is required" }
        require(utm.campaign.isNotBlank()) { "campaign is required" }
        val values = listOf(utm.id, utm.source, utm.medium, utm.campaign, utm.term, utm.content)
        val parts = Parts(baseUrl)
        val out = parts.params()
        values.forEachIndexed { k, value ->
            if (value == null || value.isBlank()) return@forEachIndexed
            val key = "utm_" + UTM_KEYS[k]
            val param = key + "=" + percentEncode(value.trim().lowercase())
            val pos = out.indexOfFirst { rawKey(it) == key }
            if (pos < 0) { out += param; return@forEachIndexed }
            out[pos] = param
            for (i in out.size - 1 downTo pos + 1) if (rawKey(out[i]) == key) out.removeAt(i)
        }
        return parts.join(out)
    }

    /** Present UTM values keyed without utm_, in id, source, medium, campaign, term, content order; first wins. */
    fun parseUtm(url: String): Map<String, String> {
        val found = arrayOfNulls<String>(UTM_KEYS.size)
        for (p in Parts(url).params()) {
            val key = percentDecode(p.substringBefore('='))
            if (!key.startsWith("utm_")) continue
            val slot = UTM_KEYS.indexOf(key.substring(4))
            if (slot >= 0 && found[slot] == null) found[slot] = percentDecode(if ('=' in p) p.substringAfter('=') else "")
        }
        val out = LinkedHashMap<String, String>()
        found.forEachIndexed { i, v -> if (v != null) out[UTM_KEYS[i]] = v }
        return out
    }

    /** Removes utm_* and known click identifiers, keeping other parameters in order and the fragment. */
    fun stripTracking(url: String): String {
        val parts = Parts(url)
        return parts.join(parts.params().filter { val k = rawKey(it); !k.startsWith("utm_") && k !in TRACKING_PARAMS })
    }
}
