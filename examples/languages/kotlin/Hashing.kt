// SPDX-License-Identifier: Apache-2.0

/**
 * Non-cryptographic hashes: CRC-32 (IEEE), FNV-1a 32/64, MurmurHash3 x86_32 and jump consistent hash.
 * Never use them for passwords, MACs or signatures. 32-bit results are unsigned values in a Long.
 */
object Hashing {
    private val CRC_TABLE = IntArray(256) { i ->
        var c = i
        repeat(8) { c = if (c and 1 != 0) 0xEDB88320.toInt() xor (c ushr 1) else c ushr 1 }
        c
    }

    /** CRC-32 (IEEE 802.3, reflected, polynomial 0xEDB88320). */
    fun crc32(data: ByteArray): Long {
        var c = -1
        for (b in data) c = CRC_TABLE[(c xor b.toInt()) and 0xff] xor (c ushr 8)
        return c.inv().toLong() and 0xffffffffL
    }

    fun fnv1a32(data: ByteArray): Long {
        var h = 0x811c9dc5.toInt()
        for (b in data) h = (h xor (b.toInt() and 0xff)) * 0x01000193
        return h.toLong() and 0xffffffffL
    }

    fun fnv1a64(data: ByteArray): ULong {
        var h = 0xcbf29ce484222325uL
        for (b in data) h = (h xor (b.toInt() and 0xff).toULong()) * 0x100000001b3uL
        return h
    }

    /** MurmurHash3 x86_32 with little-endian 4-byte blocks. */
    fun murmur3_32(data: ByteArray, seed: Int = 0): Long {
        val c1 = 0xcc9e2d51.toInt()
        val c2 = 0x1b873593
        var h = seed
        val n = data.size
        val blocks = n - n % 4
        fun u(i: Int) = data[i].toInt() and 0xff
        for (i in 0 until blocks step 4) {
            var k = u(i) or (u(i + 1) shl 8) or (u(i + 2) shl 16) or (u(i + 3) shl 24)
            k *= c1; k = k.rotateLeft(15); k *= c2
            h = h xor k; h = h.rotateLeft(13); h = h * 5 + 0xe6546b64.toInt()
        }
        var k = 0
        for (i in blocks until n) k = k or (u(i) shl (8 * (i - blocks)))
        if (n > blocks) { k *= c1; k = k.rotateLeft(15); k *= c2; h = h xor k }
        h = h xor n
        h = h xor (h ushr 16); h *= 0x85ebca6b.toInt(); h = h xor (h ushr 13); h *= 0xc2b2ae35.toInt(); h = h xor (h ushr 16)
        return h.toLong() and 0xffffffffL
    }

    /** Lamping and Veach jump consistent hash; [buckets] is 1..2^31-1. */
    fun jumpHash(key: ULong, buckets: Int): Int {
        require(buckets >= 1) { "buckets must be 1..2^31-1" }
        var k = key
        var b = -1L
        var j = 0L
        while (j < buckets) {
            b = j
            k = k * 2862933555777941757uL + 1uL
            j = ((b + 1) * ((1L shl 31).toDouble() / ((k shr 33) + 1uL).toDouble())).toLong()
        }
        return b.toInt()
    }
}
