// SPDX-License-Identifier: Apache-2.0

/**
 * WHATWG HTML "valid e-mail address" syntax (ASCII only), at most 254 characters with a local part of at most 64.
 * This checks syntax only: "user.@example.com" and "a@b" are valid. Ownership needs a confirmation email.
 */
object EmailAddress {
    private const val LABEL = "[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?"
    private val EMAIL = Regex("[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@$LABEL(?:\\.$LABEL)*")

    fun emailValid(s: String): Boolean = s.length <= 254 && EMAIL.matches(s) && s.indexOf('@') <= 64

    private fun asciiSpace(c: Char) = c == ' ' || c == '\t' || c == '\n' || c == '\u000C' || c == '\r'

    /** Trims ASCII whitespace, validates and lowercases the domain; the local part keeps its case. */
    fun emailNormalize(s: String): String {
        val t = s.trim(::asciiSpace)
        require(emailValid(t)) { "invalid email address" }
        return t.substringBefore('@') + "@" + t.substringAfter('@').lowercase()
    }
}
