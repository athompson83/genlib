// SPDX-License-Identifier: Apache-2.0
import java.time.DateTimeException
import java.time.LocalDateTime
import java.time.ZoneOffset
import java.util.Locale

/** Entity tags and conditional request evaluation (RFC 9110 section 13): returns 200, 304 or 412. */
object HttpConditional {
    private val ETAG = Regex("(?:W/)?\"[\\x21\\x23-\\x7e\\x80-\\xff]*\"")
    private val IMF = Regex("([A-Z][a-z]{2}), ([0-9]{2}) ([A-Z][a-z]{2}) ([0-9]{4}) ([0-9]{2}):([0-9]{2}):([0-9]{2}) GMT")
    private val DAYS = listOf("Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun")
    private val MONTHS = listOf("Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec")

    /** Parsed If-Match / If-None-Match value: the wildcard "*" or a list of valid entity tags. */
    sealed class EntityTags {
        data object Wildcard : EntityTags()
        data class Tags(val tags: List<String>) : EntityTags()
    }

    /** A request's conditional headers and the current representation's validators; null means absent / unknown. */
    data class Request(
        val method: String,
        val etag: String? = null,
        val lastModified: Long? = null,
        val ifMatch: String? = null,
        val ifNoneMatch: String? = null,
        val ifModifiedSince: String? = null,
        val ifUnmodifiedSince: String? = null,
    )

    private fun trim(s: String) = s.trim { it == ' ' || it == '\t' }

    /** "*" or the valid entity tags among the comma-separated items (invalid items are ignored). */
    fun parseEtags(header: String): EntityTags {
        val h = trim(header)
        if (h == "*") return EntityTags.Wildcard
        return EntityTags.Tags(h.split(",").map(::trim).filter { ETAG.matches(it) })
    }

    /** Strong comparison: neither tag is weak and they are identical. */
    fun strongMatch(a: String, b: String) = !a.startsWith("W/") && !b.startsWith("W/") && a == b

    /** Weak comparison: identical after removing a leading W/. */
    fun weakMatch(a: String, b: String) = a.removePrefix("W/") == b.removePrefix("W/")

    /** IMF-fixdate text for unix seconds, e.g. "Wed, 21 Oct 2026 07:28:00 GMT". */
    fun formatHttpDate(unixSeconds: Long): String {
        val d = LocalDateTime.ofEpochSecond(unixSeconds, 0, ZoneOffset.UTC)
        return String.format(Locale.ROOT, "%s, %02d %s %04d %02d:%02d:%02d GMT", DAYS[d.dayOfWeek.value - 1], d.dayOfMonth, MONTHS[d.monthValue - 1], d.year, d.hour, d.minute, d.second)
    }

    /** Unix seconds for an exact IMF-fixdate, or null when the text is anything else. */
    fun parseHttpDate(text: String?): Long? {
        val m = IMF.matchEntire(text ?: return null) ?: return null
        val g = m.groupValues
        val month = MONTHS.indexOf(g[3]) + 1
        val year = g[4].toInt()
        if (month == 0 || year < 1) return null
        return try {
            val d = LocalDateTime.of(year, month, g[2].toInt(), g[5].toInt(), g[6].toInt(), g[7].toInt())
            if (DAYS[d.dayOfWeek.value - 1] != g[1]) null else d.toEpochSecond(ZoneOffset.UTC)
        } catch (e: DateTimeException) {
            null
        }
    }

    /** Evaluates preconditions in RFC 9110 13.2.2 order: 412 (failed), 304 (not modified) or 200 (proceed). */
    fun evaluateConditional(r: Request): Int {
        val safe = r.method == "GET" || r.method == "HEAD"
        val etag = r.etag
        val lastModified = r.lastModified
        if (r.ifMatch != null) {
            when (val tags = parseEtags(r.ifMatch)) {
                is EntityTags.Wildcard -> if (etag == null) return 412
                is EntityTags.Tags -> if (etag == null || tags.tags.none { strongMatch(it, etag) }) return 412
            }
        } else if (r.ifUnmodifiedSince != null && lastModified != null) {
            val d = parseHttpDate(r.ifUnmodifiedSince)
            if (d != null && lastModified > d) return 412
        }
        if (r.ifNoneMatch != null) {
            val hit = etag != null && when (val tags = parseEtags(r.ifNoneMatch)) {
                is EntityTags.Wildcard -> true
                is EntityTags.Tags -> tags.tags.any { weakMatch(it, etag) }
            }
            if (hit) return if (safe) 304 else 412
        } else if (r.ifModifiedSince != null && safe && lastModified != null) {
            val d = parseHttpDate(r.ifModifiedSince)
            if (d != null && lastModified <= d) return 304
        }
        return 200
    }
}
