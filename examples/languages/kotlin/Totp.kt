// SPDX-License-Identifier: Apache-2.0
import java.io.ByteArrayOutputStream
import java.security.MessageDigest
import java.security.SecureRandom
import javax.crypto.Mac
import javax.crypto.spec.SecretKeySpec

/** HOTP (RFC 4226) and TOTP (RFC 6238) one-time passwords, Base32 secrets and otpauth URIs. */
object Totp {
    private const val BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567"

    fun hotp(secret: ByteArray, counter: Long, digits: Int = 6, algorithm: String = "SHA1"): String {
        require(secret.isNotEmpty()) { "secret must not be empty" }
        require(digits in 1..10) { "digits must be between 1 and 10" }
        val message = ByteArray(8)
        var c = counter
        for (i in 7 downTo 0) { message[i] = c.toByte(); c = c ushr 8 }
        val mac = Mac.getInstance(macName(algorithm))
        mac.init(SecretKeySpec(secret, mac.algorithm))
        val hash = mac.doFinal(message)
        val offset = hash[hash.size - 1].toInt() and 0x0f
        val binary = ((hash[offset].toLong() and 0x7f) shl 24) or ((hash[offset + 1].toLong() and 0xff) shl 16) or
            ((hash[offset + 2].toLong() and 0xff) shl 8) or (hash[offset + 3].toLong() and 0xff)
        var modulus = 1L
        repeat(digits) { modulus *= 10 }
        return (binary % modulus).toString().padStart(digits, '0')
    }

    fun totp(secret: ByteArray, unixSeconds: Long, step: Int = 30, digits: Int = 6, algorithm: String = "SHA1", t0: Long = 0): String =
        hotp(secret, counterFor(unixSeconds, step, t0), digits, algorithm)

    fun verifyTotp(
        code: String?, secret: ByteArray, unixSeconds: Long, window: Int = 1, step: Int = 30, digits: Int = 6,
        algorithm: String = "SHA1",
    ): Boolean {
        require(window >= 0) { "window must be >= 0" }
        if (code == null || code.length != digits || !code.all { it in '0'..'9' }) return false
        val given = code.toByteArray(Charsets.US_ASCII)
        val current = counterFor(unixSeconds, step, 0)
        var match = false
        for (offset in -window..window) {
            val counter = current + offset
            if (counter < 0) continue
            val expected = hotp(secret, counter, digits, algorithm).toByteArray(Charsets.US_ASCII)
            match = match or MessageDigest.isEqual(expected, given)
        }
        return match
    }

    fun base32Encode(data: ByteArray): String {
        val out = StringBuilder()
        var buffer = 0
        var bits = 0
        for (b in data) {
            buffer = (buffer shl 8) or (b.toInt() and 0xff)
            bits += 8
            while (bits >= 5) {
                out.append(BASE32[(buffer ushr (bits - 5)) and 31])
                bits -= 5
            }
        }
        if (bits > 0) out.append(BASE32[(buffer shl (5 - bits)) and 31])
        return out.toString()
    }

    fun base32Decode(text: String): ByteArray {
        val s = text.replace(" ", "").replace("-", "").trimEnd('=')
        val out = ByteArrayOutputStream()
        var buffer = 0
        var bits = 0
        s.forEachIndexed { i, ch ->
            val value = BASE32.indexOf(ch.uppercaseChar())
            require(value >= 0) { "invalid base32 character at index $i" }
            buffer = (buffer shl 5) or value
            bits += 5
            if (bits >= 8) {
                out.write((buffer ushr (bits - 8)) and 0xff)
                bits -= 8
            }
        }
        return out.toByteArray()
    }

    fun otpauthUri(
        issuer: String, account: String, secretBase32: String, digits: Int = 6, period: Int = 30, algorithm: String = "SHA1",
    ): String {
        require(issuer.isNotEmpty() && account.isNotEmpty()) { "issuer and account are required" }
        base32Decode(secretBase32)
        macName(algorithm)
        val enc = percentEncode(issuer)
        return "otpauth://totp/$enc:${percentEncode(account)}?secret=$secretBase32&issuer=$enc" +
            "&algorithm=$algorithm&digits=$digits&period=$period"
    }

    fun generateSecret(bytes: Int = 20): ByteArray {
        require(bytes >= 1) { "bytes must be positive" }
        return ByteArray(bytes).also { SecureRandom().nextBytes(it) }
    }

    private fun counterFor(unixSeconds: Long, step: Int, t0: Long): Long {
        require(step > 0) { "step must be positive" }
        val counter = Math.floorDiv(unixSeconds - t0, step.toLong())
        require(counter >= 0) { "time is before t0" }
        return counter
    }

    private fun macName(algorithm: String): String = when (algorithm) {
        "SHA1" -> "HmacSHA1"
        "SHA256" -> "HmacSHA256"
        "SHA512" -> "HmacSHA512"
        else -> throw IllegalArgumentException("unsupported algorithm: $algorithm")
    }

    /** RFC 3986 percent-encoding: unreserved characters stay, everything else is %XX of UTF-8. */
    private fun percentEncode(value: String): String = buildString {
        for (b in value.toByteArray(Charsets.UTF_8)) {
            val c = b.toInt() and 0xff
            val ch = c.toChar()
            if (ch in 'A'..'Z' || ch in 'a'..'z' || ch in '0'..'9' || ch in "-._~") append(ch)
            else append('%').append("%02X".format(c))
        }
    }
}
