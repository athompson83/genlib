// SPDX-License-Identifier: Apache-2.0

/** Check-digit validators: Luhn (payment cards), IBAN (ISO 13616 mod 97), GTIN/EAN/UPC and ISBN-10/13. */
object CheckDigits {
    private val IBAN = Regex("[A-Z]{2}[0-9]{2}[A-Z0-9]{11,30}")
    private val ISBN10 = Regex("[0-9]{9}[0-9X]")

    private fun strip(s: String) = s.filter { it != ' ' && it != '-' }

    private fun allDigits(t: String) = t.isNotEmpty() && t.all { it in '0'..'9' }

    /** True when [s] (spaces and hyphens ignored) is at least 2 ASCII digits passing the Luhn check. */
    fun luhnValid(s: String): Boolean {
        val t = strip(s)
        if (!allDigits(t) || t.length < 2) return false
        var total = 0
        for (i in t.indices) {
            var d = t[t.length - 1 - i] - '0'
            if (i % 2 == 1) { d *= 2; if (d > 9) d -= 9 }
            total += d
        }
        return total % 10 == 0
    }

    /** The digit that makes payload + digit pass the Luhn check. */
    fun luhnCheckDigit(payload: String): String {
        val t = strip(payload)
        require(allDigits(t)) { "payload must contain only digits, spaces and hyphens" }
        for (d in '0'..'9') if (luhnValid(t + d)) return d.toString()
        error("unreachable")
    }

    private fun compactIban(s: String) = s.replace(" ", "").uppercase()

    /** True when [s] (spaces ignored, any case) is a structurally valid IBAN whose mod-97 remainder is 1. */
    fun ibanValid(s: String): Boolean {
        val t = compactIban(s)
        if (!IBAN.matches(t)) return false
        val r = t.substring(4) + t.substring(0, 4)
        var rem = 0
        for (c in r) {
            val v = if (c <= '9') c - '0' else c - 'A' + 10
            rem = (rem * (if (v > 9) 100 else 10) + v) % 97
        }
        return rem == 1
    }

    /** A valid IBAN in upper case, in groups of four separated by single spaces. */
    fun ibanFormat(s: String): String {
        require(ibanValid(s)) { "invalid IBAN" }
        return compactIban(s).chunked(4).joinToString(" ")
    }

    /** True for a GTIN-8/12/13/14 (EAN/UPC) with a correct check digit; spaces and hyphens ignored. */
    fun gtinValid(s: String): Boolean {
        val t = strip(s)
        if (!allDigits(t) || t.length !in setOf(8, 12, 13, 14)) return false
        var total = 0
        for (i in t.indices) total += (t[t.length - 1 - i] - '0') * (if (i % 2 == 1) 3 else 1)
        return total % 10 == 0
    }

    /** True for an ISBN-10 (9 digits then a digit or X) with a correct check digit; spaces and hyphens ignored. */
    fun isbn10Valid(s: String): Boolean {
        val t = strip(s).uppercase()
        if (!ISBN10.matches(t)) return false
        var total = 0
        for (i in 0 until 10) total += (10 - i) * (if (t[i] == 'X') 10 else t[i] - '0')
        return total % 11 == 0
    }

    /** True for a 13-digit ISBN with prefix 978 or 979 and a correct GTIN check digit. */
    fun isbn13Valid(s: String): Boolean {
        val t = strip(s)
        return t.length == 13 && (t.startsWith("978") || t.startsWith("979")) && gtinValid(t)
    }

    /** Converts a valid ISBN-10 to its 978-prefixed ISBN-13 (digits only). */
    fun isbn10To13(s: String): String {
        require(isbn10Valid(s)) { "invalid ISBN-10" }
        val body = "978" + strip(s).substring(0, 9)
        for (d in '0'..'9') if (gtinValid(body + d)) return body + d
        error("unreachable")
    }
}
