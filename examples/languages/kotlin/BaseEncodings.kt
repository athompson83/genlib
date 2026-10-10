// SPDX-License-Identifier: Apache-2.0
import java.io.ByteArrayOutputStream
import java.math.BigInteger

/** Strict base32 (RFC 4648 sections 6 and 7), Bitcoin base58 and unpadded base64url (RFC 4648 section 5). */
object BaseEncodings {
    private const val B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567"
    private const val B32HEX = "0123456789ABCDEFGHIJKLMNOPQRSTUV"
    private const val B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz"
    private const val B64U = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_"
    private val FIFTY_EIGHT = BigInteger.valueOf(58)

    private fun alphabet(name: String): String = when (name) {
        "rfc4648" -> B32
        "hex" -> B32HEX
        else -> throw IllegalArgumentException("base32 alphabet must be rfc4648 or hex")
    }

    /** Uppercase base32; [alphabet] is "rfc4648" or "hex"; [padding] adds "=" to a multiple of 8 characters. */
    fun base32Encode(data: ByteArray, alphabet: String = "rfc4648", padding: Boolean = true): String {
        val a = alphabet(alphabet)
        val out = StringBuilder()
        var bits = 0
        var n = 0
        for (b in data) {
            bits = (bits shl 8) or (b.toInt() and 0xff)
            n += 8
            while (n >= 5) { n -= 5; out.append(a[(bits ushr n) and 31]) }
            bits = bits and ((1 shl n) - 1)
        }
        if (n > 0) out.append(a[(bits shl (5 - n)) and 31])
        if (padding) while (out.length % 8 != 0) out.append('=')
        return out.toString()
    }

    /** Case-insensitive strict decode; throws IllegalArgumentException for bad length, padding, characters or non-zero leftover bits. */
    fun base32Decode(text: String, alphabet: String = "rfc4648", padding: Boolean = true): ByteArray {
        val a = alphabet(alphabet)
        var t = text.uppercase()
        if (padding) {
            require(t.length % 8 == 0) { "base32 length must be a multiple of 8" }
            val stripped = t.trimEnd('=')
            require(t.length - stripped.length in setOf(0, 1, 3, 4, 6)) { "invalid base32 padding" }
            t = stripped
        } else {
            require('=' !in t) { "unexpected base32 padding" }
        }
        require(t.length % 8 !in setOf(1, 3, 6)) { "invalid base32 length" }
        val out = ByteArrayOutputStream()
        var bits = 0
        var n = 0
        for (ch in t) {
            val v = a.indexOf(ch)
            require(v >= 0) { "invalid base32 character" }
            bits = (bits shl 5) or v
            n += 5
            if (n >= 8) { n -= 8; out.write((bits ushr n) and 0xff) }
            bits = bits and ((1 shl n) - 1)
        }
        require(bits == 0) { "non-canonical base32 (non-zero trailing bits)" }
        return out.toByteArray()
    }

    /** Bitcoin-alphabet base58; each leading zero byte becomes one leading "1". */
    fun base58Encode(data: ByteArray): String {
        val zeros = data.takeWhile { it.toInt() == 0 }.size
        var n = BigInteger(1, data)
        val s = StringBuilder()
        while (n.signum() > 0) {
            val qr = n.divideAndRemainder(FIFTY_EIGHT)
            s.append(B58[qr[1].toInt()])
            n = qr[0]
        }
        repeat(zeros) { s.append('1') }
        return s.reverse().toString()
    }

    /** Decodes base58; throws IllegalArgumentException for characters outside the Bitcoin alphabet (0, O, I, l, ...). */
    fun base58Decode(text: String): ByteArray {
        var n = BigInteger.ZERO
        for (ch in text) {
            val v = B58.indexOf(ch)
            require(v >= 0) { "invalid base58 character" }
            n = n.multiply(FIFTY_EIGHT).add(BigInteger.valueOf(v.toLong()))
        }
        val zeros = text.takeWhile { it == '1' }.length
        var body = if (n.signum() == 0) ByteArray(0) else n.toByteArray()
        if (body.size > 1 && body[0].toInt() == 0) body = body.copyOfRange(1, body.size)
        return ByteArray(zeros) + body
    }

    /** Unpadded URL-safe base64. */
    fun base64UrlEncode(data: ByteArray): String {
        val out = StringBuilder()
        var bits = 0
        var n = 0
        for (b in data) {
            bits = (bits shl 8) or (b.toInt() and 0xff)
            n += 8
            while (n >= 6) { n -= 6; out.append(B64U[(bits ushr n) and 63]) }
            bits = bits and ((1 shl n) - 1)
        }
        if (n > 0) out.append(B64U[(bits shl (6 - n)) and 63])
        return out.toString()
    }

    /** Strict decode: rejects "=", "+", "/", other characters, length mod 4 == 1 and non-zero trailing bits. */
    fun base64UrlDecode(text: String): ByteArray {
        require(text.length % 4 != 1) { "invalid base64url length" }
        val out = ByteArrayOutputStream()
        var bits = 0
        var n = 0
        for (ch in text) {
            val v = B64U.indexOf(ch)
            require(v >= 0) { "invalid base64url character" }
            bits = (bits shl 6) or v
            n += 6
            if (n >= 8) { n -= 8; out.write((bits ushr n) and 0xff) }
            bits = bits and ((1 shl n) - 1)
        }
        require(bits == 0) { "non-canonical base64url (non-zero trailing bits)" }
        return out.toByteArray()
    }
}
