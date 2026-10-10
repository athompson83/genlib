// SPDX-License-Identifier: Apache-2.0
import java.security.MessageDigest
import java.security.SecureRandom
import javax.crypto.Mac
import javax.crypto.spec.SecretKeySpec

/** MFA recovery (backup) codes: Crockford-style base32 generation, normalization and keyed hashing. */
object RecoveryCodes {
    const val ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"

    fun generateRecoveryCodes(count: Int = 10, groups: Int = 2, groupLength: Int = 5): List<String> {
        require(count >= 1 && groups >= 1 && groupLength >= 1) { "count, groups and groupLength must be positive" }
        require(groups * groupLength >= 8) { "codes must have at least 8 symbols" }
        val random = SecureRandom()
        val codes = LinkedHashSet<String>()
        while (codes.size < count) {
            // 32-symbol alphabet: nextInt(32) is a uniform 5-bit draw, so selection is unbiased.
            codes += (1..groups).joinToString("-") {
                buildString { repeat(groupLength) { append(ALPHABET[random.nextInt(32)]) } }
            }
        }
        return codes.toList()
    }

    fun normalizeRecoveryCode(input: String, groups: Int = 2, groupLength: Int = 5): String {
        val out = StringBuilder()
        for (raw in input) {
            var c = raw.uppercaseChar()
            if (c == ' ' || c == '-') continue
            c = when (c) { 'O' -> '0'; 'I', 'L' -> '1'; else -> c }
            require(c in ALPHABET) { "invalid recovery code character" }
            out.append(c)
        }
        require(out.length == groups * groupLength) { "recovery code has the wrong length" }
        return out.toString()
    }

    fun hashRecoveryCode(code: String, key: ByteArray): String {
        require(key.isNotEmpty()) { "key must not be empty" }
        val mac = Mac.getInstance("HmacSHA256")
        mac.init(SecretKeySpec(key, "HmacSHA256"))
        return mac.doFinal(normalizeRecoveryCode(code).toByteArray(Charsets.US_ASCII))
            .joinToString("") { "%02x".format(it.toInt() and 0xff) }
    }

    /** Index of the matching stored hash, or -1. Compares against every hash without early exit. */
    fun findRecoveryCode(input: String, storedHashes: List<String>, key: ByteArray): Int {
        require(key.isNotEmpty()) { "key must not be empty" }
        val candidate = try {
            hashRecoveryCode(input, key).toByteArray(Charsets.US_ASCII)
        } catch (e: IllegalArgumentException) {
            return -1
        }
        var found = -1
        storedHashes.forEachIndexed { i, stored ->
            val equal = MessageDigest.isEqual(candidate, stored.toByteArray(Charsets.US_ASCII))
            if (equal && found < 0) found = i
        }
        return found
    }
}
