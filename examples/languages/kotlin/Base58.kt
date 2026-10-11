// SPDX-License-Identifier: Apache-2.0

import java.security.MessageDigest

/**
 * Base58 with the Bitcoin alphabet and Base58Check (payload plus the first 4 bytes of a double SHA-256).
 * The big-number conversion works on byte arrays. Every failure throws IllegalArgumentException.
 */
object Base58 {
    private const val ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz"

    /** Encodes bytes; each leading zero byte becomes a leading '1'. */
    fun base58Encode(bytes: ByteArray): String {
        var zeros = 0
        while (zeros < bytes.size && bytes[zeros] == 0.toByte()) zeros++
        val num = bytes.copyOfRange(zeros, bytes.size)
        val out = StringBuilder()
        var start = 0
        while (start < num.size) {
            var rem = 0
            for (i in start until num.size) {
                val acc = rem * 256 + (num[i].toInt() and 0xFF)
                num[i] = (acc / 58).toByte()
                rem = acc % 58
            }
            out.append(ALPHABET[rem])
            while (start < num.size && num[start] == 0.toByte()) start++
        }
        repeat(zeros) { out.append('1') }
        return out.reverse().toString()
    }

    /** Decodes Base58 text; a character outside the alphabet throws, and "" gives an empty array. */
    fun base58Decode(s: String): ByteArray {
        val ones = s.takeWhile { it == '1' }.length
        var num = ByteArray(0)
        for (ch in s) {
            val d = ALPHABET.indexOf(ch)
            require(d >= 0) { "invalid base58 character" }
            var carry = d
            for (i in num.indices.reversed()) {
                val acc = (num[i].toInt() and 0xFF) * 58 + carry
                num[i] = acc.toByte()
                carry = acc shr 8
            }
            while (carry > 0) {
                num = byteArrayOf(carry.toByte()) + num
                carry = carry shr 8
            }
        }
        val lead = num.takeWhile { it == 0.toByte() }.size
        return ByteArray(ones) + num.copyOfRange(lead, num.size)
    }

    private fun checksum(payload: ByteArray): ByteArray {
        val md = MessageDigest.getInstance("SHA-256")
        return md.digest(md.digest(payload)).copyOf(4)
    }

    /** Base58Check: encodes payload followed by its 4-byte double-SHA-256 checksum. */
    fun base58CheckEncode(payload: ByteArray): String = base58Encode(payload + checksum(payload))

    /** Base58Check: decodes, verifies the 4-byte checksum and returns the payload. */
    fun base58CheckDecode(s: String): ByteArray {
        val b = base58Decode(s)
        require(b.size >= 4) { "too short for a checksum" }
        val payload = b.copyOf(b.size - 4)
        require(MessageDigest.isEqual(checksum(payload), b.copyOfRange(b.size - 4, b.size))) { "checksum mismatch" }
        return payload
    }
}
