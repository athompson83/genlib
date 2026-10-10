// SPDX-License-Identifier: Apache-2.0

/**
 * NIST SP 800-63B style password checks without composition rules. Use a large breached-password list as the
 * blocklist, allow every printable character (spaces and emoji included), never truncate, and rate-limit attempts.
 */
object PasswordPolicy {
    private const val ALNUM = "0123456789abcdefghijklmnopqrstuvwxyz"
    private val ALNUM_REVERSED = ALNUM.reversed()

    /** Check options; [context] holds user-specific words (entries shorter than 4 characters are ignored). */
    data class Options(
        val minLength: Int = 15,
        val maxLength: Int = 64,
        val blocklist: List<String> = emptyList(),
        val context: List<String> = emptyList(),
    )

    /** [ok] is true when [failures] is empty; failures are in a fixed order. */
    data class Result(val ok: Boolean, val failures: List<String>)

    private fun asciiLower(s: String): String = buildString { for (c in s) append(if (c in 'A'..'Z') c + 32 else c) }

    private fun isControl(cp: Int) = cp < 0x20 || cp in 0x7f..0x9f

    /** Failures: too-short, too-long, control-characters, blocklisted, contains-context, repetitive (lengths in code points). */
    fun checkPassword(password: String, o: Options = Options()): Result {
        require(o.minLength >= 1 && o.maxLength >= o.minLength) { "need 1 <= minLength <= maxLength" }
        val cps = password.codePoints().toArray()
        val fails = mutableListOf<String>()
        if (cps.size < o.minLength) fails += "too-short"
        if (cps.size > o.maxLength) fails += "too-long"
        if (cps.any { isControl(it) }) fails += "control-characters"
        val low = asciiLower(password)
        if (o.blocklist.any { low == asciiLower(it) }) fails += "blocklisted"
        if (o.context.any { it.codePointCount(0, it.length) >= 4 && low.contains(asciiLower(it)) }) fails += "contains-context"
        if (repetitive(cps)) fails += "repetitive"
        return Result(fails.isEmpty(), fails.toList())
    }

    private fun repetitive(cps: IntArray): Boolean {
        for (i in 0..cps.size - 4) {
            if (cps[i] == cps[i + 1] && cps[i] == cps[i + 2] && cps[i] == cps[i + 3]) return true
            val w = StringBuilder()
            for (k in i until i + 4) {
                val c = if (cps[k] in 'A'.code..'Z'.code) cps[k] + 32 else cps[k]
                if (c > 0x7f || ALNUM.indexOf(c.toChar()) < 0) break
                w.append(c.toChar())
            }
            if (w.length == 4 && (ALNUM.contains(w) || ALNUM_REVERSED.contains(w))) return true
        }
        return false
    }
}
