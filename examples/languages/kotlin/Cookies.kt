// SPDX-License-Identifier: Apache-2.0
import java.time.LocalDateTime
import java.time.ZoneOffset
import java.util.Locale

/** Set-Cookie serialization with RFC 6265 and current browser prefix/SameSite/Partitioned rules, and Cookie header parsing. */
object Cookies {
    private val TOKEN = Regex("[!#\$%&'*+\\-.^_`|~0-9A-Za-z]+")
    private val OCTETS = Regex("[\\x21\\x23-\\x2b\\x2d-\\x3a\\x3c-\\x5b\\x5d-\\x7e]*")
    private val DOMAIN = Regex("\\.?[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?(?:\\.[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)*")
    private val PATH_BAD = Regex("[\\x00-\\x1f\\x7f;]")
    private val DAYS = listOf("Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun")
    private val MONTHS = listOf("Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec")

    /** Set-Cookie attributes; null / false means not set. [expires] is unix seconds; [sameSite] is "Strict", "Lax" or "None". */
    data class Options(
        val maxAge: Long? = null,
        val expires: Long? = null,
        val domain: String? = null,
        val path: String? = null,
        val secure: Boolean = false,
        val httpOnly: Boolean = false,
        val sameSite: String? = null,
        val partitioned: Boolean = false,
    )

    private fun imfFixdate(unixSeconds: Long): String {
        val d = LocalDateTime.ofEpochSecond(unixSeconds, 0, ZoneOffset.UTC)
        return String.format(Locale.ROOT, "%s, %02d %s %04d %02d:%02d:%02d GMT", DAYS[d.dayOfWeek.value - 1], d.dayOfMonth, MONTHS[d.monthValue - 1], d.year, d.hour, d.minute, d.second)
    }

    /** A Set-Cookie header value; throws IllegalArgumentException for invalid names, values or attribute combinations. */
    fun serializeCookie(name: String, value: String, o: Options = Options()): String {
        require(TOKEN.matches(name)) { "cookie name must be an RFC 7230 token" }
        require(OCTETS.matches(value)) { "cookie value has characters outside cookie-octet; encode it first" }
        require(o.domain == null || DOMAIN.matches(o.domain)) { "invalid cookie domain" }
        require(o.path == null || (o.path.startsWith("/") && !PATH_BAD.containsMatchIn(o.path))) { "cookie path must start with / and contain no controls or ;" }
        require(o.sameSite == null || o.sameSite in listOf("Strict", "Lax", "None")) { "SameSite must be Strict, Lax or None" }
        require(o.sameSite != "None" || o.secure) { "SameSite=None requires Secure" }
        require(!o.partitioned || o.secure) { "Partitioned requires Secure" }
        require(!name.startsWith("__Secure-") || o.secure) { "__Secure- requires Secure" }
        require(!name.startsWith("__Host-") || (o.secure && o.domain == null && o.path == "/")) { "__Host- requires Secure, Path=/ and no Domain" }
        require(o.maxAge == null || o.maxAge >= 0) { "maxAge must be non-negative" }
        val out = mutableListOf("$name=$value")
        if (o.maxAge != null) out += "Max-Age=${o.maxAge}"
        if (o.expires != null) out += "Expires=" + imfFixdate(o.expires)
        if (o.domain != null) out += "Domain=" + o.domain.lowercase()
        if (o.path != null) out += "Path=" + o.path
        if (o.secure) out += "Secure"
        if (o.httpOnly) out += "HttpOnly"
        if (o.sameSite != null) out += "SameSite=" + o.sameSite
        if (o.partitioned) out += "Partitioned"
        return out.joinToString("; ")
    }

    /** Ordered name/value pairs from a Cookie request header (duplicates kept, one pair of surrounding quotes removed). */
    fun parseCookieHeader(header: String): List<Pair<String, String>> {
        val out = mutableListOf<Pair<String, String>>()
        for (piece in header.split(";")) {
            val eq = piece.indexOf('=')
            if (eq < 0) continue
            val n = piece.substring(0, eq).trim { it == ' ' || it == '\t' }
            var v = piece.substring(eq + 1).trim { it == ' ' || it == '\t' }
            if (n.isEmpty()) continue
            if (v.length >= 2 && v.first() == '"' && v.last() == '"') v = v.substring(1, v.length - 1)
            out += n to v
        }
        return out
    }
}
