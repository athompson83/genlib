// SPDX-License-Identifier: Apache-2.0
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.format.DateTimeParseException

/** RFC 5545 VCALENDAR writer with TEXT escaping and 75-octet line folding. */
object IcsEvents {
    /** One VEVENT. [start]/[end] are both UTC "YYYY-MM-DDTHH:MM:SSZ" or both "YYYY-MM-DD". */
    data class Event(
        val uid: String, val dtstamp: String, val start: String, val end: String, val summary: String,
        val description: String? = null, val location: String? = null, val url: String? = null,
    )

    private val UTC = Regex("[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z")
    private val DATE = Regex("[0-9]{4}-[0-9]{2}-[0-9]{2}")

    private fun utc(s: String): LocalDateTime? =
        if (!UTC.matches(s)) null else try { LocalDateTime.parse(s.substring(0, 19)) } catch (e: DateTimeParseException) { null }

    private fun date(s: String): LocalDate? =
        if (!DATE.matches(s)) null else try { LocalDate.parse(s) } catch (e: DateTimeParseException) { null }

    /** Escapes RFC 5545 TEXT: backslash, semicolon, comma and line breaks. */
    fun escapeText(value: String): String =
        value.replace("\\", "\\\\").replace(";", "\\;").replace(",", "\\,")
            .replace("\r\n", "\n").replace("\r", "\n").replace("\n", "\\n")

    /** Folds a content line at 75 octets (74 after the leading space), never splitting a UTF-8 character. */
    fun fold(line: String): String {
        val out = StringBuilder()
        var used = 0
        var limit = 75
        var i = 0
        while (i < line.length) {
            val cp = line.codePointAt(i)
            val ch = String(Character.toChars(cp))
            val size = ch.toByteArray(Charsets.UTF_8).size
            if (used + size > limit) { out.append("\r\n "); used = 0; limit = 74 }
            out.append(ch)
            used += size
            i += Character.charCount(cp)
        }
        return out.append("\r\n").toString()
    }

    private fun compact(s: String) = s.replace("-", "").replace(":", "")

    private fun validateUrl(url: String) {
        val lower = url.lowercase()
        val rest = when {
            lower.startsWith("https://") -> lower.substring(8)
            lower.startsWith("http://") -> lower.substring(7)
            else -> null
        }
        val ok = rest != null && rest.isNotEmpty() && rest[0] !in "/?#" && url.none { it.isWhitespace() || it.isISOControl() }
        require(ok) { "url must be an absolute http(s) URL: $url" }
    }

    /** Builds a published VCALENDAR; every line ends with CRLF. */
    fun icsCalendar(events: List<Event>, prodId: String): String {
        require(prodId.isNotEmpty()) { "prodId is required" }
        val out = StringBuilder()
        listOf("BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:" + escapeText(prodId), "CALSCALE:GREGORIAN", "METHOD:PUBLISH")
            .forEach { out.append(fold(it)) }
        for (e in events) {
            require(e.uid.isNotEmpty()) { "uid is required" }
            require(e.summary.isNotEmpty()) { "summary is required" }
            require(utc(e.dtstamp) != null) { "dtstamp must be UTC YYYY-MM-DDTHH:MM:SSZ: ${e.dtstamp}" }
            val st = utc(e.start)
            val en = utc(e.end)
            val (startLine, endLine) = if (st != null && en != null) {
                require(en.isAfter(st)) { "end must be after start" }
                "DTSTART:" + compact(e.start) to "DTEND:" + compact(e.end)
            } else {
                val sd = date(e.start)
                val ed = date(e.end)
                require(sd != null && ed != null) { "start and end must both be UTC date-times or both be dates" }
                require(ed.isAfter(sd)) { "end must be after start" }
                "DTSTART;VALUE=DATE:" + compact(e.start) to "DTEND;VALUE=DATE:" + compact(e.end)
            }
            e.url?.let { validateUrl(it) }
            val lines = mutableListOf("BEGIN:VEVENT", "UID:" + escapeText(e.uid), "DTSTAMP:" + compact(e.dtstamp),
                startLine, endLine, "SUMMARY:" + escapeText(e.summary))
            e.description?.let { lines.add("DESCRIPTION:" + escapeText(it)) }
            e.location?.let { lines.add("LOCATION:" + escapeText(it)) }
            e.url?.let { lines.add("URL:$it") }
            lines.add("END:VEVENT")
            lines.forEach { out.append(fold(it)) }
        }
        return out.append(fold("END:VCALENDAR")).toString()
    }
}
