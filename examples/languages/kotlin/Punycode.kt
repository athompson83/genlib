// SPDX-License-Identifier: Apache-2.0

/**
 * RFC 3492 Punycode (base 36, tmin 1, tmax 26, skew 38, damp 700, initial bias 72, initial n 128, delimiter '-')
 * with 31-bit overflow checks, plus simplified IDNA-style domain conversion. The domain functions lowercase ASCII
 * letters only and apply no Unicode normalization or IDNA (UTS #46) mapping: normalize (NFC, case-fold) first if
 * needed. Strings are processed by code point. Every failure throws IllegalArgumentException.
 */
object Punycode {
    private const val BASE = 36L
    private const val TMIN = 1L
    private const val TMAX = 26L
    private const val SKEW = 38L
    private const val DAMP = 700L
    private const val MAXINT = 0x7FFFFFFFL

    private fun adapt(delta0: Long, num: Long, first: Boolean): Long {
        var delta = if (first) delta0 / DAMP else delta0 / 2
        delta += delta / num
        var k = 0L
        while (delta > ((BASE - TMIN) * TMAX) / 2) { delta /= BASE - TMIN; k += BASE }
        return k + (BASE - TMIN + 1) * delta / (delta + SKEW)
    }

    private fun digit(d: Long): Char = if (d < 26) ('a' + d.toInt()) else ('0' + (d - 26).toInt())

    private fun threshold(k: Long, bias: Long) = if (k <= bias) TMIN else if (k >= bias + TMAX) TMAX else k - bias

    /** Encodes a Unicode string to Punycode (without the 'xn--' prefix). */
    fun punycodeEncode(s: String): String {
        val cps = s.codePoints().toArray()
        val out = StringBuilder()
        for (c in cps) if (c < 0x80) out.append(c.toChar())
        val b = out.length.toLong()
        var h = b
        if (b > 0) out.append('-')
        var n = 128L
        var delta = 0L
        var bias = 72L
        while (h < cps.size) {
            val m = cps.filter { it >= n }.min().toLong()
            if ((m - n) * (h + 1) > MAXINT - delta) throw IllegalArgumentException("overflow")
            delta += (m - n) * (h + 1)
            n = m
            for (c in cps) {
                if (c < n) {
                    delta++
                    if (delta > MAXINT) throw IllegalArgumentException("overflow")
                }
                if (c.toLong() == n) {
                    var q = delta
                    var k = BASE
                    while (true) {
                        val t = threshold(k, bias)
                        if (q < t) break
                        out.append(digit(t + (q - t) % (BASE - t)))
                        q = (q - t) / (BASE - t)
                        k += BASE
                    }
                    out.append(digit(q))
                    bias = adapt(delta, h + 1, h == b)
                    delta = 0
                    h++
                }
            }
            delta++
            n++
        }
        return out.toString()
    }

    private fun value(c: Int): Long = when (c) {
        in '0'.code..'9'.code -> (c - 22).toLong()
        in 'A'.code..'Z'.code -> (c - 'A'.code).toLong()
        in 'a'.code..'z'.code -> (c - 'a'.code).toLong()
        else -> throw IllegalArgumentException("invalid digit")
    }

    /** Decodes Punycode (either digit case) to a Unicode string; rejects invalid, truncated or overflowing input. */
    fun punycodeDecode(s: String): String {
        val cps = s.codePoints().toArray()
        val i = cps.lastIndexOf('-'.code)
        val out = ArrayList<Int>()
        if (i > 0) for (k in 0 until i) {
            if (cps[k] >= 0x80) throw IllegalArgumentException("non-basic code point")
            out.add(cps[k])
        }
        var pos = if (i >= 0) i + 1 else 0
        var n = 128L
        var idx = 0L
        var bias = 72L
        while (pos < cps.size) {
            val old = idx
            var w = 1L
            var k = BASE
            while (true) {
                if (pos >= cps.size) throw IllegalArgumentException("truncated input")
                val d = value(cps[pos++])
                if (d > (MAXINT - idx) / w) throw IllegalArgumentException("overflow")
                idx += d * w
                val t = threshold(k, bias)
                if (d < t) break
                if (w > MAXINT / (BASE - t)) throw IllegalArgumentException("overflow")
                w *= BASE - t
                k += BASE
            }
            val len = out.size + 1L
            bias = adapt(idx - old, len, old == 0L)
            if (idx / len > MAXINT - n) throw IllegalArgumentException("overflow")
            n += idx / len
            idx %= len
            if (n > 0x10FFFF || n in 0xD800L..0xDFFFL) throw IllegalArgumentException("invalid code point")
            out.add(idx.toInt(), n.toInt())
            idx++
        }
        val sb = StringBuilder()
        for (c in out) sb.appendCodePoint(c)
        return sb.toString()
    }

    /** Converts a domain to ASCII ('xn--' labels); lowercases ASCII only, no normalization or IDNA mapping. */
    fun domainToAscii(domain: String): String {
        val trailing = domain.endsWith(".") && domain.length > 1
        val body = if (trailing) domain.dropLast(1) else domain
        val res = body.split(".").map { l ->
            require(l.isNotEmpty()) { "empty label" }
            val a = l.map { c -> if (c in 'A'..'Z') c + 32 else c }.joinToString("")
            val label = if (a.any { it.code >= 0x80 }) "xn--" + punycodeEncode(a) else a
            require(label.length <= 63) { "label too long" }
            label
        }
        val out = res.joinToString(".")
        require(out.length <= 253) { "name too long" }
        return if (trailing) "$out." else out
    }

    /** Converts a domain to Unicode by decoding each 'xn--' label (prefix matched case-insensitively). */
    fun domainToUnicode(domain: String): String = domain.split(".").joinToString(".") { l ->
        if (l.length >= 4 && l.substring(0, 4).lowercase() == "xn--") punycodeDecode(l.substring(4)) else l
    }
}
