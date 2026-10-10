// SPDX-License-Identifier: Apache-2.0

/**
 * IP address parsing, RFC 5952 canonical text, CIDR membership and an SSRF guard ([isPublicIp]).
 *
 * SSRF use: resolve the hostname yourself, check EVERY resolved address with [isPublicIp], then
 * connect to that checked address (no second DNS lookup), and re-check after every redirect.
 * Parsing is hand-written so results do not depend on platform resolvers such as InetAddress.
 */
object IpCidr {
    private val V4_PART = Regex("0|[1-9][0-9]{0,2}")
    private val V6_CHARS = Regex("[0-9A-Fa-f:.]+")
    private val HEX_GROUP = Regex("[0-9A-Fa-f]{1,4}")
    private val PREFIX = Regex("0|[1-9][0-9]{0,2}")
    private val V4_SPECIAL = listOf("0.0.0.0/8", "10.0.0.0/8", "100.64.0.0/10", "127.0.0.0/8", "169.254.0.0/16", "172.16.0.0/12",
        "192.0.0.0/24", "192.0.2.0/24", "192.88.99.0/24", "192.168.0.0/16", "198.18.0.0/15", "198.51.100.0/24", "203.0.113.0/24", "224.0.0.0/4", "240.0.0.0/4")
    private val V6_SPECIAL = listOf("::/128", "::1/128", "100::/64", "2001::/23", "2001:db8::/32", "2002::/16", "fc00::/7", "fe80::/10", "ff00::/8")

    private fun parseV4(s: String): ByteArray {
        val parts = s.split(".")
        require(parts.size == 4) { "invalid IPv4 address: $s" }
        return ByteArray(4) { i ->
            require(V4_PART.matches(parts[i]) && parts[i].toInt() <= 255) { "invalid IPv4 address: $s" }
            parts[i].toInt().toByte()
        }
    }

    private fun groups(x: String, original: String): List<Int> {
        if (x.isEmpty()) return emptyList()
        return x.split(":").map { h ->
            require(HEX_GROUP.matches(h)) { "invalid IPv6 address: $original" }
            h.toInt(16)
        }
    }

    private fun parseV6(original: String): ByteArray {
        var s = original
        val first = s.indexOf("::")
        require(!(first >= 0 && s.indexOf("::", first + 1) >= 0) && V6_CHARS.matches(s)) { "invalid IPv6 address: $original" }
        var tail4: ByteArray? = null
        if ('.' in s) {
            val i = s.lastIndexOf(':')
            tail4 = parseV4(s.substring(i + 1))
            s = if (i >= 1 && s[i - 1] == ':') s.substring(0, i + 1) else s.substring(0, i)
        }
        val need = if (tail4 == null) 8 else 6
        val dc = s.indexOf("::")
        val g: List<Int>
        if (dc >= 0) {
            val a = groups(s.substring(0, dc), original)
            val b = groups(s.substring(dc + 2), original)
            require(a.size + b.size <= need - 1) { "invalid IPv6 address: $original" }
            g = a + List(need - a.size - b.size) { 0 } + b
        } else {
            g = groups(s, original)
            require(g.size == need) { "invalid IPv6 address: $original" }
        }
        val out = ByteArray(16)
        g.forEachIndexed { i, v -> out[2 * i] = (v shr 8).toByte(); out[2 * i + 1] = v.toByte() }
        tail4?.copyInto(out, 12)
        return out
    }

    /** Parses IPv4 dotted decimal (4 bytes) or RFC 4291 IPv6 text (16 bytes); throws IllegalArgumentException otherwise. */
    fun parseIp(text: String): ByteArray = if (':' in text) parseV6(text) else parseV4(text)

    private fun hasPrefix(b: ByteArray, vararg prefix: Int) = prefix.indices.all { (b[it].toInt() and 0xff) == prefix[it] }

    private fun isMapped(b: ByteArray) = b.size == 16 && hasPrefix(b, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0xff, 0xff)

    private fun v4Text(b: ByteArray, off: Int) = (off until off + 4).joinToString(".") { (b[it].toInt() and 0xff).toString() }

    /** RFC 5952 text for 4 or 16 address bytes. */
    fun formatIp(b: ByteArray): String {
        require(b.size == 4 || b.size == 16) { "address must be 4 or 16 bytes" }
        if (b.size == 4) return v4Text(b, 0)
        if (isMapped(b)) return "::ffff:" + v4Text(b, 12)
        val g = IntArray(8) { ((b[2 * it].toInt() and 0xff) shl 8) or (b[2 * it + 1].toInt() and 0xff) }
        var best = -1
        var bestLen = 1
        var i = 0
        while (i < 8) {
            if (g[i] == 0) {
                var j = i
                while (j < 8 && g[j] == 0) j++
                if (j - i > bestLen) { best = i; bestLen = j - i }
                i = j
            } else i++
        }
        val hex = g.map { it.toString(16) }
        if (best < 0) return hex.joinToString(":")
        return hex.subList(0, best).joinToString(":") + "::" + hex.subList(best + bestLen, 8).joinToString(":")
    }

    /** Canonical (RFC 5952) text of an IP address. */
    fun canonicalIp(text: String): String = formatIp(parseIp(text))

    private fun bit(b: ByteArray, i: Int) = (b[i / 8].toInt() and (0x80 shr (i % 8))) != 0

    /** True when [ip] is inside [cidr] ("address/prefix"); different families never match. Throws on a malformed CIDR or set host bits. */
    fun cidrContains(cidr: String, ip: String): Boolean {
        val pieces = cidr.split("/")
        require(pieces.size == 2) { "invalid CIDR: $cidr" }
        val net = parseIp(pieces[0])
        require(PREFIX.matches(pieces[1])) { "invalid CIDR prefix: $cidr" }
        val prefix = pieces[1].toInt()
        require(prefix <= net.size * 8) { "CIDR prefix too long: $cidr" }
        require((prefix until net.size * 8).none { bit(net, it) }) { "CIDR has host bits set: $cidr" }
        val x = parseIp(ip)
        if (x.size != net.size) return false
        return (0 until prefix).all { bit(x, it) == bit(net, it) }
    }

    /** False for loopback, private, link-local, shared, documentation, multicast, reserved and other special ranges. */
    fun isPublicIp(ip: String): Boolean {
        val b = parseIp(ip)
        if (b.size == 16 && (isMapped(b) || hasPrefix(b, 0, 0x64, 0xff, 0x9b, 0, 0, 0, 0, 0, 0, 0, 0))) return isPublicIp(v4Text(b, 12))
        val text = formatIp(b)
        return (if (b.size == 4) V4_SPECIAL else V6_SPECIAL).none { cidrContains(it, text) }
    }
}
