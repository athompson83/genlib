// SPDX-License-Identifier: Apache-2.0
import java.math.BigInteger
import java.security.SecureRandom

/** Time-ordered identifiers: UUIDv7 (RFC 9562) and ULID (Crockford base32), with deterministic builders. */
object Ids {
    private const val CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"
    private const val HEX = "0123456789abcdef"
    private const val MAX_MS = (1L shl 48) - 1
    private val random = SecureRandom()

    private fun check(unixMs: Long, random10: ByteArray) {
        require(unixMs in 0..MAX_MS) { "unixMs must be between 0 and 2^48-1" }
        require(random10.size == 10) { "random bytes must be exactly 10 bytes" }
    }

    /** UUIDv7: 48-bit big-endian [unixMs], then the 10 random bytes with version 7 and variant 0b10 applied. */
    fun uuidV7(unixMs: Long, random10: ByteArray): String {
        check(unixMs, random10)
        val b = ByteArray(16)
        for (i in 0 until 6) b[i] = (unixMs ushr (40 - 8 * i)).toByte()
        random10.copyInto(b, 6)
        b[6] = ((b[6].toInt() and 0x0f) or 0x70).toByte()
        b[8] = ((b[8].toInt() and 0x3f) or 0x80).toByte()
        val out = StringBuilder(36)
        for (i in 0 until 16) {
            if (i == 4 || i == 6 || i == 8 || i == 10) out.append('-')
            out.append(HEX[(b[i].toInt() shr 4) and 0x0f]).append(HEX[b[i].toInt() and 0x0f])
        }
        return out.toString()
    }

    /** ULID: ([unixMs] shl 80) or random as a 128-bit big-endian integer in 26 Crockford base32 characters. */
    fun ulid(unixMs: Long, random10: ByteArray): String {
        check(unixMs, random10)
        var value = BigInteger.valueOf(unixMs).shiftLeft(80).or(BigInteger(1, random10))
        val out = CharArray(26)
        for (i in 25 downTo 0) {
            out[i] = CROCKFORD[value.toInt() and 31]
            value = value.shiftRight(5)
        }
        return String(out)
    }

    /** Returns the unixMs of a UUIDv7 (case-insensitive); rejects bad layout, version or variant. */
    fun uuidV7Time(text: String): Long {
        require(text.length == 36) { "UUID must be 36 characters" }
        val s = text.lowercase()
        for ((i, c) in s.withIndex()) {
            val dash = i == 8 || i == 13 || i == 18 || i == 23
            require(if (dash) c == '-' else c in HEX) { "UUID has an invalid character at $i" }
        }
        require(s[14] == '7') { "UUID is not version 7" }
        require(s[19] in "89ab") { "UUID variant must be RFC 9562 (10xx)" }
        return (s.substring(0, 8) + s.substring(9, 13)).toLong(16)
    }

    /** Returns the unixMs of a ULID (case-insensitive); rejects bad length, characters or a first char above '7'. */
    fun ulidTime(text: String): Long {
        require(text.length == 26) { "ULID must be 26 characters" }
        var ms = 0L
        for ((i, c) in text.uppercase().withIndex()) {
            val v = CROCKFORD.indexOf(c)
            require(v >= 0) { "ULID has an invalid character at $i" }
            require(i != 0 || v <= 7) { "ULID overflows 128 bits" }
            if (i < 10) ms = (ms shl 5) or v.toLong()
        }
        return ms
    }

    private fun random10(): ByteArray = ByteArray(10).also { random.nextBytes(it) }

    /** A new UUIDv7 from the system clock and SecureRandom. */
    fun newUuidV7(): String = uuidV7(System.currentTimeMillis(), random10())

    /** A new ULID from the system clock and SecureRandom. */
    fun newUlid(): String = ulid(System.currentTimeMillis(), random10())
}
