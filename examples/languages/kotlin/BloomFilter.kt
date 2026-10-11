// SPDX-License-Identifier: Apache-2.0
import java.util.Base64

/**
 * Bloom filter with deterministic FNV-1a 64-bit double hashing: h1 = low 32 bits, h2 = high 32 bits, position i =
 * (h1 + i*h2) mod m in unsigned 64-bit arithmetic. Bit j lives in byte j>>3 at mask 1<<(j&7). The serialized form is
 * base64url without padding. Items are hashed as UTF-8. Failures throw IllegalArgumentException.
 */
class BloomFilter private constructor(val m: Int, val k: Int, private val bits: ByteArray) {
    /** An empty filter with m bits (at least 8) and k hash positions (1..64). */
    constructor(m: Int, k: Int) : this(m, k, ByteArray(maxOf(0, (m + 7) / 8)))

    init {
        require(m >= 8 && k in 1..64) { "bad params" }
    }

    companion object {
        /** FNV-1a 64-bit hash of the bytes. */
        fun fnv1a64(data: ByteArray): ULong {
            var h = 0xcbf29ce484222325uL
            for (b in data) {
                h = h xor (b.toInt() and 0xFF).toULong()
                h *= 0x100000001b3uL
            }
            return h
        }

        /** (m, k) with m = ceil(-n ln p / ln(2)^2) (min 8) and k = max(1, floor(m/n ln 2 + 0.5)); n >= 1, 0 < p < 1. */
        fun bloomSizeFor(n: Long, p: Double): Pair<Int, Int> {
            require(n >= 1 && p > 0 && p < 1) { "bad size" }
            val ln2 = Math.log(2.0)
            val raw = Math.ceil(-n * Math.log(p) / (ln2 * ln2))
            require(raw <= Int.MAX_VALUE - 7) { "bad size" }
            val m = maxOf(8, raw.toInt())
            val k = maxOf(1.0, Math.floor(m.toDouble() / n * ln2 + 0.5)).toInt()
            return Pair(m, k)
        }

        /** A filter from serialize() output; rejects a byte length other than ceil(m/8). */
        fun deserialize(m: Int, k: Int, text: String): BloomFilter {
            val raw = Base64.getUrlDecoder().decode(text)
            require(raw.size == (m + 7) / 8) { "length" }
            return BloomFilter(m, k, raw)
        }
    }

    /** The k bit positions for an item. */
    fun positions(item: String): List<Int> {
        val h = fnv1a64(item.toByteArray(Charsets.UTF_8))
        val h1 = h and 0xffffffffuL
        val h2 = h shr 32
        return (0 until k).map { i -> ((h1 + i.toULong() * h2) % m.toULong()).toInt() }
    }

    /** Sets the item's bits. */
    fun add(item: String) {
        for (j in positions(item)) bits[j shr 3] = (bits[j shr 3].toInt() or (1 shl (j and 7))).toByte()
    }

    /** True when all of the item's bits are set (false positives possible, no false negatives). */
    fun mightContain(item: String): Boolean = positions(item).all { j -> bits[j shr 3].toInt() and (1 shl (j and 7)) != 0 }

    /** Estimated item count round(-m/k ln(1 - X/m)), or null when every bit is set. */
    fun countEstimate(): Long? {
        val x = bits.sumOf { Integer.bitCount(it.toInt() and 0xFF) }
        if (x >= m) return null
        return Math.floor(-m.toDouble() / k * Math.log(1 - x.toDouble() / m) + 0.5).toLong()
    }

    /** The bit array as base64url without padding. */
    fun serialize(): String = Base64.getUrlEncoder().withoutPadding().encodeToString(bits)

    /** A new filter with the bits of both; m and k must match. */
    fun union(other: BloomFilter): BloomFilter {
        require(m == other.m && k == other.k) { "mismatch" }
        return BloomFilter(m, k, ByteArray(bits.size) { (bits[it].toInt() or other.bits[it].toInt()).toByte() })
    }
}
