// SPDX-License-Identifier: Apache-2.0

/**
 * Deterministic feature-flag evaluation. The same flag and user always give the same answer, and raising
 * rolloutPercent only adds users (bucket = fmix32(fnv1a32(key + ":" + userId)) % 10000 is compared with
 * percent * 100; fmix32 is the MurmurHash3 finalizer).
 *
 * BREAKING (behavior): earlier versions used plain FNV-1a, whose lowest bit is the parity of the input bytes,
 * so 50/50 experiments with similar keys put the same users in the same half. The finalizer makes experiments
 * independent but changes every bucket and variant assignment; re-baseline running rollouts and experiments
 * when upgrading.
 */
object FeatureFlags {
    private val KEY = Regex("[A-Za-z0-9._-]{1,100}")

    /** A weighted variant; [weight] is a positive integer. */
    data class Variant(val name: String, val weight: Int)

    /** A flag definition; [rolloutPercent] is 0..100 with at most two decimals. */
    data class Flag(
        val key: String,
        val enabled: Boolean = true,
        val allow: List<String> = emptyList(),
        val deny: List<String> = emptyList(),
        val rolloutPercent: Double = 100.0,
        val variants: List<Variant> = emptyList(),
    )

    /** The evaluation; [variant] is null when off or the flag has no variants. */
    data class Result(val on: Boolean, val reason: String, val bucket: Int, val variant: String?)

    /** FNV-1a 32 over UTF-8, then the MurmurHash3 fmix32 finalizer; returned as an unsigned 32-bit value. */
    private fun bucketHash(s: String): Long {
        var h = 0x811c9dc5.toInt()
        for (b in s.toByteArray(Charsets.UTF_8)) h = (h xor (b.toInt() and 0xff)) * 0x01000193
        h = h xor (h ushr 16)
        h *= 0x85ebca6b.toInt()
        h = h xor (h ushr 13)
        h *= 0xc2b2ae35.toInt()
        h = h xor (h ushr 16)
        return h.toLong() and 0xffffffffL
    }

    /** Evaluates the flag for a user; throws IllegalArgumentException for an invalid key, percent or variant. */
    fun evaluateFlag(flag: Flag, userId: String): Result {
        require(KEY.matches(flag.key)) { "flag key must match [A-Za-z0-9._-]{1,100}" }
        val pct = flag.rolloutPercent
        require(pct >= 0 && pct <= 100 && Math.rint(pct * 100) == pct * 100) { "rolloutPercent must be 0..100 with at most two decimals" }
        val basisPoints = Math.round(pct * 100)
        require(flag.variants.all { it.name.isNotEmpty() && it.weight >= 1 }) { "variants need a name and a positive integer weight" }
        val total = flag.variants.sumOf { it.weight.toLong() }
        val bucket = (bucketHash(flag.key + ":" + userId) % 10000).toInt()
        fun variant(): String? {
            if (flag.variants.isEmpty()) return null
            var x = bucketHash(flag.key + ":variant:" + userId) % total
            for (v in flag.variants) {
                if (x < v.weight) return v.name
                x -= v.weight
            }
            return null
        }
        return when {
            !flag.enabled -> Result(false, "disabled", bucket, null)
            userId in flag.deny -> Result(false, "deny", bucket, null)
            userId in flag.allow -> Result(true, "allow", bucket, variant())
            bucket < basisPoints -> Result(true, "rollout", bucket, variant())
            else -> Result(false, "excluded", bucket, null)
        }
    }
}
