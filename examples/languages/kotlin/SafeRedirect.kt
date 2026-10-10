// SPDX-License-Identifier: Apache-2.0

/** Open-redirect guard: allows same-site paths and absolute http(s) URLs whose origin is on an allowlist. */
object SafeRedirect {
    private val ABSOLUTE = Regex("([hH][tT][tT][pP][sS]?)://([A-Za-z0-9.-]+)(?::([0-9]{1,5}))?(/[^?#]*)?(\\?[^#]*)?(#.*)?")

    /** Origin "scheme://host[:port]" (lower case, default port dropped), or null when [url] is not an acceptable absolute URL. */
    internal fun originOf(url: String): String? {
        val m = ABSOLUTE.matchEntire(url) ?: return null
        val scheme = m.groupValues[1].lowercase()
        val host = m.groupValues[2].lowercase()
        if (host.startsWith(".") || host.endsWith(".") || ".." in host) return null
        var port: String? = null
        if (m.groupValues[3].isNotEmpty()) {
            val p = m.groupValues[3].toInt()
            if (p < 1 || p > 65535) return null
            if (!((scheme == "https" && p == 443) || (scheme == "http" && p == 80))) port = p.toString()
        }
        return "$scheme://$host" + (if (port == null) "" else ":$port")
    }

    /** Returns [target] when it is a local path (not "//") or an allowed absolute URL, otherwise [fallback]. */
    fun safeRedirect(target: String?, allowedOrigins: List<String>, fallback: String = "/"): String {
        if (target == null || target.isEmpty() || target.length > 2048) return fallback
        if (target.any { it.code <= 0x20 || it.code == 0x7f || it == '\\' }) return fallback
        if (target.startsWith("/")) return if (target.startsWith("//")) fallback else target
        val origin = originOf(target) ?: return fallback
        return if (allowedOrigins.any { originOf(it) == origin }) target else fallback
    }
}
