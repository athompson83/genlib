// SPDX-License-Identifier: Apache-2.0

import java.math.BigDecimal
import java.math.RoundingMode
import java.security.SecureRandom
import kotlin.math.ln

/**
 * Password and passphrase generation with an injected byte source (nextByte returns 0..255) so results are
 * reproducible in tests; the default nextByte uses java.security.SecureRandom (never kotlin.random.Random).
 * Classes: "lower", "upper", "digits", "symbols" (!#$%&*+-=?@^_~). One character per class in class order, the rest
 * from the union, then a Fisher-Yates shuffle; indexes use unbiased rejection sampling. Bad arguments throw
 * IllegalArgumentException.
 */
object PasswordGenerate {
    private val RANDOM = SecureRandom()
    private val CLASSES = mapOf(
        "lower" to "abcdefghijklmnopqrstuvwxyz", "upper" to "ABCDEFGHIJKLMNOPQRSTUVWXYZ",
        "digits" to "0123456789", "symbols" to "!#$%&*+-=?@^_~",
    )

    /** The default byte source: one byte from SecureRandom. */
    val secureByte: () -> Int = { RANDOM.nextInt(256) }

    /** Unbiased index in [0, n) from big-endian bytes of nextByte by rejection sampling. */
    fun randomIndex(n: Int, nextByte: () -> Int = secureByte): Int {
        require(n >= 1) { "n must be positive" }
        if (n == 1) return 0
        var k = 1
        var range = 256L
        while (range < n) { k++; range *= 256 }
        val limit = (range / n) * n
        while (true) {
            var x = 0L
            repeat(k) { x = x * 256 + nextByte() }
            if (x < limit) return (x % n).toInt()
        }
    }

    /** A password with one character per class, union fill and Fisher-Yates shuffle; excludeAmbiguous drops "Il1O0o". */
    fun generatePassword(
        length: Int = 16,
        classes: List<String> = listOf("lower", "upper", "digits", "symbols"),
        nextByte: () -> Int = secureByte,
        excludeAmbiguous: Boolean = false,
    ): String {
        require(classes.isNotEmpty() && classes.toSet().size == classes.size && classes.all { it in CLASSES }) { "bad classes" }
        require(length in classes.size..1024) { "bad length" }
        val alph = classes.map { c -> CLASSES.getValue(c).filter { !(excludeAmbiguous && it in "Il1O0o") } }
        val out = ArrayList<Char>()
        for (a in alph) out.add(a[randomIndex(a.length, nextByte)])
        val union = alph.joinToString("")
        repeat(length - classes.size) { out.add(union[randomIndex(union.length, nextByte)]) }
        for (i in out.size - 1 downTo 1) {
            val j = randomIndex(i + 1, nextByte)
            val t = out[i]; out[i] = out[j]; out[j] = t
        }
        return out.joinToString("")
    }

    /** A passphrase of count (1..64) words picked uniformly from at least 2 distinct non-empty words. */
    fun generatePassphrase(words: List<String>, count: Int = 5, separator: String = "-", nextByte: () -> Int = secureByte): String {
        require(count in 1..64 && words.toSet().size >= 2 && words.none { it.isEmpty() }) { "bad arguments" }
        return (1..count).joinToString(separator) { words[randomIndex(words.size, nextByte)] }
    }

    /** length * log2(alphabetSize), rounded half-even to 2 decimals. */
    fun entropyBits(alphabetSize: Int, length: Int): Double =
        BigDecimal(length * (ln(alphabetSize.toDouble()) / ln(2.0))).setScale(2, RoundingMode.HALF_EVEN).toDouble()
}
