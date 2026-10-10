// SPDX-License-Identifier: Apache-2.0

/** RFC 6350 vCard 4.0 export with TEXT escaping, validated EMAIL/TEL/URL values and 75-octet line folding. */
object VCard {
    private val CONTROL = Regex("[\\x00-\\x09\\x0b-\\x1f\\x7f]")
    private val TYPE = Regex("[a-z][a-z0-9-]*")
    private val EMAIL = Regex("(?U)[^\\s@]+@[^\\s@]+")
    private val TEL = Regex("\\+?[0-9][0-9 ().-]{1,30}")
    private val URL = Regex("(?U)https?://\\S+")

    /** One typed value (EMAIL or TEL); [type] matches [a-z][a-z0-9-]* when present. */
    data class Typed(val value: String, val type: String? = null)

    /** Structured name (N). */
    data class Name(
        val family: String = "",
        val given: String = "",
        val additional: String = "",
        val prefix: String = "",
        val suffix: String = "",
    )

    /** ADR components. */
    data class Address(
        val type: String? = null,
        val poBox: String = "",
        val extended: String = "",
        val street: String = "",
        val locality: String = "",
        val region: String = "",
        val postalCode: String = "",
        val country: String = "",
    )

    /** A contact; [fn] is required and not blank. Empty optional fields are omitted. */
    data class Contact(
        val fn: String,
        val n: Name? = null,
        val org: String? = null,
        val title: String? = null,
        val emails: List<Typed> = emptyList(),
        val phones: List<Typed> = emptyList(),
        val address: Address? = null,
        val urls: List<String> = emptyList(),
        val note: String? = null,
        val uid: String? = null,
    )

    private fun esc(s: String): String {
        require(!CONTROL.containsMatchIn(s)) { "control characters are not allowed in vCard text" }
        return s.replace("\\", "\\\\").replace(",", "\\,").replace(";", "\\;").replace("\n", "\\n")
    }

    private fun type(t: String?): String {
        if (t == null) return ""
        require(TYPE.matches(t)) { "TYPE must match [a-z][a-z0-9-]*" }
        return ";TYPE=$t"
    }

    /** Folds a content line at 75 octets (74 after the leading space) without splitting a UTF-8 character; adds CRLF. */
    internal fun fold(line: String): String {
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

    /** The vCard text (CRLF line endings); throws IllegalArgumentException for a blank fn or an invalid field. */
    fun buildVcard(c: Contact): String {
        require(c.fn.isNotBlank()) { "fn is required" }
        val lines = mutableListOf("BEGIN:VCARD", "VERSION:4.0", "FN:" + esc(c.fn))
        c.n?.let { n -> lines += "N:" + listOf(n.family, n.given, n.additional, n.prefix, n.suffix).joinToString(";") { esc(it) } }
        if (!c.org.isNullOrEmpty()) lines += "ORG:" + esc(c.org)
        if (!c.title.isNullOrEmpty()) lines += "TITLE:" + esc(c.title)
        for (e in c.emails) {
            require(EMAIL.matches(e.value)) { "invalid email" }
            lines += "EMAIL" + type(e.type) + ":" + esc(e.value)
        }
        for (p in c.phones) {
            require(TEL.matches(p.value)) { "invalid phone number" }
            lines += "TEL" + type(p.type) + ":" + p.value
        }
        c.address?.let { a ->
            lines += "ADR" + type(a.type) + ":" + listOf(a.poBox, a.extended, a.street, a.locality, a.region, a.postalCode, a.country).joinToString(";") { esc(it) }
        }
        for (u in c.urls) {
            require(URL.matches(u)) { "URL must be http(s) without whitespace" }
            lines += "URL:$u"
        }
        if (!c.note.isNullOrEmpty()) lines += "NOTE:" + esc(c.note)
        if (!c.uid.isNullOrEmpty()) lines += "UID:" + esc(c.uid)
        lines += "END:VCARD"
        return lines.joinToString("") { fold(it) }
    }
}
