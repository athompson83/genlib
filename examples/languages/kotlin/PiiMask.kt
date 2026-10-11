// SPDX-License-Identifier: Apache-2.0

/**
 * Display masking of personal data for logs and UIs (not anonymization): emails, phone numbers, card numbers,
 * generic middles, and free-text redaction of emails and Luhn-valid card numbers. Emails and maskMiddle work on
 * code points. Every failure throws IllegalArgumentException.
 */
object PiiMask {
    private val EMAIL = Regex("[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}")
    private val CARD = Regex("(?<![0-9])[0-9](?:[ -]?[0-9]){12,18}(?![0-9])")
    private val COUNTRY = Regex("(?U)\\+(\\d{1,3}) ")
    private val CARD_CHARS = Regex("[0-9 -]+")

    private fun asciiDigit(c: Char) = c in '0'..'9'

    /** "jane.doe@example.com" -> "j*******@example.com" (at least 3 '*'); needs exactly one '@' and both parts. */
    fun maskEmail(e: String): String {
        require(e.count { it == '@' } == 1) { "not an email address" }
        val (local, domain) = e.split("@")
        require(local.isNotEmpty() && domain.isNotEmpty()) { "not an email address" }
        val len = local.codePointCount(0, local.length)
        return StringBuilder().appendCodePoint(local.codePointAt(0)).append("*".repeat(maxOf(3, len - 1))).append('@').append(domain).toString()
    }

    /** Keeps the last 4 ASCII digits (and a leading "+CC " country code), masking other digits; needs 7+ digits. */
    fun maskPhone(p: String): String {
        val total = p.count { asciiDigit(it) }
        require(total >= 7) { "not a phone number" }
        val keepFront = COUNTRY.matchAt(p, 0)?.groupValues?.get(1)?.let { it.codePointCount(0, it.length) } ?: 0
        var seen = 0
        val out = StringBuilder()
        for (c in p) {
            if (asciiDigit(c)) { out.append(if (seen < keepFront || seen >= total - 4) c else '*'); seen++ } else out.append(c)
        }
        return out.toString()
    }

    /** Keeps the last 4 of 12-19 digits, keeping space/hyphen separators; other characters are an error. */
    fun maskCard(c: String): String {
        require(CARD_CHARS.matches(c)) { "not a card number" }
        val total = c.count { asciiDigit(it) }
        require(total in 12..19) { "not a card number" }
        var seen = 0
        val out = StringBuilder()
        for (ch in c) {
            if (asciiDigit(ch)) { out.append(if (seen >= total - 4) ch else '*'); seen++ } else out.append(ch)
        }
        return out.toString()
    }

    /** Keeps keepStart/keepEnd code points and masks the rest with mask (one code point); short strings are fully masked. */
    fun maskMiddle(s: String, keepStart: Int = 1, keepEnd: Int = 1, mask: String = "*"): String {
        require(keepStart >= 0 && keepEnd >= 0 && mask.codePointCount(0, mask.length) == 1) { "bad arguments" }
        val cps = s.codePoints().toArray()
        if (cps.size <= keepStart + keepEnd) return mask.repeat(cps.size)
        return String(cps, 0, keepStart) + mask.repeat(cps.size - keepStart - keepEnd) + String(cps, cps.size - keepEnd, keepEnd)
    }

    private fun luhn(d: String): Boolean {
        var s = 0
        for ((i, ch) in d.reversed().withIndex()) {
            var n = ch - '0'
            if (i % 2 == 1) n = if (n * 2 > 9) n * 2 - 9 else n * 2
            s += n
        }
        return s % 10 == 0
    }

    /** Masks the given kinds ("email", "card") in free text; phone numbers are not detected in free text. */
    fun redact(text: String, kinds: List<String> = listOf("email", "card")): String {
        require(kinds.all { it == "email" || it == "card" }) { "unsupported kind" }
        var t = text
        if ("card" in kinds) t = CARD.replace(t) { m -> if (luhn(m.value.replace(" ", "").replace("-", ""))) maskCard(m.value) else m.value }
        if ("email" in kinds) t = EMAIL.replace(t) { m -> maskEmail(m.value) }
        return t
    }
}
