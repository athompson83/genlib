// SPDX-License-Identifier: Apache-2.0

/** Server-driven content negotiation: Accept (media types) and Accept-Language (RFC 9110, RFC 4647 basic filtering). */
object ContentNegotiation {
    private val Q = Regex("0(\\.[0-9]{0,3})?|1(\\.0{0,3})?")
    private val MEDIA_RANGE = Regex("[!#\$%&'*+.^_`|~0-9a-z-]+/[!#\$%&'*+.^_`|~0-9a-z-]+")
    private val LANGUAGE_RANGE = Regex("\\*|[a-z]{1,8}(-[a-z0-9]{1,8})*")

    private data class Item(val value: String, val q: Double)

    private fun trim(s: String) = s.trim { it == ' ' || it == '\t' }

    /** Items "value;params" with a valid q (default 1); values are lower-cased; invalid q or empty items are skipped. */
    private fun parse(header: String): List<Item> {
        val items = mutableListOf<Item>()
        for (raw in header.split(",")) {
            val part = trim(raw)
            if (part.isEmpty()) continue
            val bits = part.split(";").map(::trim)
            var q: Double? = 1.0
            for (bit in bits.drop(1)) {
                val k = bit.substringBefore('=')
                val v = if ('=' in bit) bit.substringAfter('=').trim() else ""
                if (k.trim().lowercase() != "q") continue
                q = if (Q.matches(v)) v.toDouble() else null
                if (q == null) break
            }
            if (q != null) items += Item(bits[0].lowercase(), q)
        }
        return items
    }

    private fun <T> pick(available: List<String>, ranges: List<T>, q: (T) -> Double, specificity: (T, String) -> Int): String? {
        var best: String? = null
        var bestQ = 0.0
        for (a in available) {
            var spec = 0
            var aq = 0.0
            for (r in ranges) {
                val s = specificity(r, a)
                if (s > spec) { spec = s; aq = q(r) }
            }
            if (spec > 0 && aq > bestQ) { best = a; bestQ = aq }
        }
        return best
    }

    /** Best available media type for an Accept header (null or blank: first available); null when nothing is acceptable. */
    fun negotiateMediaType(accept: String?, available: List<String>): String? {
        if (accept == null || accept.isBlank()) return available.firstOrNull()
        for (a in available) require(a.split("/").size == 2) { "available media type must be type/subtype: $a" }
        val ranges = parse(accept).filter { MEDIA_RANGE.matches(it.value) }
        return pick(available, ranges, { it.q }) { r, a ->
            val ts = a.lowercase().split("/")
            val (rt, rs) = r.value.split("/")
            when {
                rt == ts[0] && rs == ts[1] -> 3
                rt == ts[0] && rs == "*" -> 2
                rt == "*" && rs == "*" -> 1
                else -> 0
            }
        }
    }

    /** Best available language tag (original case) for an Accept-Language header; null when nothing is acceptable. */
    fun negotiateLanguage(acceptLanguage: String?, available: List<String>): String? {
        if (acceptLanguage == null || acceptLanguage.isBlank()) return available.firstOrNull()
        val ranges = parse(acceptLanguage).filter { LANGUAGE_RANGE.matches(it.value) }
        return pick(available, ranges, { it.q }) { r, a ->
            val tag = a.lowercase()
            when {
                r.value == "*" -> 1
                tag == r.value || tag.startsWith(r.value + "-") -> 2 + r.value.count { it == '-' }
                else -> 0
            }
        }
    }
}
