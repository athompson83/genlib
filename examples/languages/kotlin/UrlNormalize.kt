// SPDX-License-Identifier: Apache-2.0

/** RFC 3986 section 6 normalization for http/https URLs (hand-parsed; no java.net.URI). Uses [IpCidr.canonicalIp] for IPv6 hosts. */
object UrlNormalize {
    private val URL = Regex("([A-Za-z][A-Za-z0-9+.-]*)://([^/?#]*)([^?#]*)(\\?[^#]*)?(#.*)?", RegexOption.DOT_MATCHES_ALL)
    private val AUTHORITY = Regex("(\\[[0-9A-Fa-f:.]+\\]|[A-Za-z0-9.-]+)(?::([0-9]*))?")
    private const val UNRESERVED = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~"

    /** RFC 3986 5.2.4 remove_dot_segments. */
    fun removeDotSegments(path: String): String {
        var input = path
        val out = StringBuilder()
        while (input.isNotEmpty()) {
            when {
                input.startsWith("../") -> input = input.substring(3)
                input.startsWith("./") -> input = input.substring(2)
                input.startsWith("/./") -> input = "/" + input.substring(3)
                input == "/." -> input = "/"
                input.startsWith("/../") || input == "/.." -> {
                    input = "/" + input.substring(if (input == "/..") 3 else 4)
                    out.setLength(maxOf(out.lastIndexOf("/"), 0))
                }
                input == "." || input == ".." -> input = ""
                else -> {
                    val i = input.indexOf('/', if (input.startsWith("/")) 1 else 0)
                    if (i < 0) { out.append(input); input = "" } else { out.append(input, 0, i); input = input.substring(i) }
                }
            }
        }
        return out.toString()
    }

    private fun hex(c: Char): Int = when (c) {
        in '0'..'9' -> c - '0'
        in 'a'..'f' -> c - 'a' + 10
        in 'A'..'F' -> c - 'A' + 10
        else -> -1
    }

    private fun normalizePercent(s: String): String {
        val out = StringBuilder(s.length)
        var i = 0
        while (i < s.length) {
            val c = s[i]
            if (c != '%') { out.append(c); i++; continue }
            require(i + 2 < s.length && hex(s[i + 1]) >= 0 && hex(s[i + 2]) >= 0) { "invalid percent-encoding" }
            val decoded = (hex(s[i + 1]) * 16 + hex(s[i + 2])).toChar()
            if (decoded in UNRESERVED) out.append(decoded) else out.append('%').append(s.substring(i + 1, i + 3).uppercase())
            i += 3
        }
        return out.toString()
    }

    /** Normalized http(s) URL: lower-case scheme/host, default port removed, percent-encoding normalized, dot segments removed, fragment dropped. */
    fun normalizeUrl(text: String): String {
        require(text.none { it.code <= 0x20 || it.code == 0x7f }) { "url contains whitespace or control characters" }
        val m = requireNotNull(URL.matchEntire(text)) { "url must be scheme://authority..." }
        val scheme = m.groupValues[1].lowercase()
        val auth = m.groupValues[2]
        require(scheme == "http" || scheme == "https") { "scheme must be http or https" }
        require('@' !in auth) { "userinfo is not allowed" }
        val hm = requireNotNull(AUTHORITY.matchEntire(auth)) { "invalid host" }
        var host = hm.groupValues[1].lowercase()
        if (host.startsWith("[")) host = "[" + IpCidr.canonicalIp(host.substring(1, host.length - 1)) + "]"
        var port: String? = hm.groups[2]?.value?.takeIf { it.isNotEmpty() }
        if (port != null) {
            val digits = port.trimStart('0').ifEmpty { "0" }
            require(digits.length <= 5 && digits.toInt() <= 65535) { "port out of range" }
            val p = digits.toInt()
            port = if ((scheme == "http" && p == 80) || (scheme == "https" && p == 443)) null else p.toString()
        }
        val path = removeDotSegments(normalizePercent(m.groupValues[3])).ifEmpty { "/" }
        val query = m.groups[4]?.value?.let(::normalizePercent)?.takeIf { it != "?" } ?: ""
        return "$scheme://$host" + (if (port == null) "" else ":$port") + path + query
    }
}
