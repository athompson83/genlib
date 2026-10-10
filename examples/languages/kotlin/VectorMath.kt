// SPDX-License-Identifier: Apache-2.0

/** Vector math for embeddings: dot, norm, cosine, normalize, brute-force top-k and MMR re-ranking. */
object VectorMath {
    /** A vector index with its cosine score. */
    data class Scored(val index: Int, val score: Double)

    private fun check(a: DoubleArray, b: DoubleArray) {
        require(a.size == b.size) { "vectors must have the same length" }
        require(a.isNotEmpty()) { "vectors must not be empty" }
    }

    /** Dot product (plain left-to-right sum). */
    fun dot(a: DoubleArray, b: DoubleArray): Double {
        check(a, b)
        var s = 0.0
        for (i in a.indices) s += a[i] * b[i]
        return s
    }

    /** Euclidean length. */
    fun norm(a: DoubleArray): Double {
        require(a.isNotEmpty()) { "vectors must not be empty" }
        var s = 0.0
        for (x in a) s += x * x
        return Math.sqrt(s)
    }

    /** Cosine similarity clamped to [-1, 1]; 0 when either vector is all zeros. */
    fun cosine(a: DoubleArray, b: DoubleArray): Double {
        check(a, b)
        val na = norm(a)
        val nb = norm(b)
        if (na == 0.0 || nb == 0.0) return 0.0
        return maxOf(-1.0, minOf(1.0, dot(a, b) / (na * nb)))
    }

    /** Unit vector in the same direction; error on a zero vector. */
    fun normalize(a: DoubleArray): DoubleArray {
        val n = norm(a)
        require(n != 0.0) { "cannot normalize a zero vector" }
        return DoubleArray(a.size) { a[it] / n }
    }

    /** The [k] most cosine-similar vectors, best first; ties keep the lower index. */
    fun topK(query: DoubleArray, vectors: List<DoubleArray>, k: Int): List<Scored> {
        require(k >= 0) { "k must be >= 0" }
        val scored = vectors.mapIndexed { i, v -> Scored(i, cosine(query, v)) }
            .sortedWith { x, y -> if (x.score > y.score) -1 else if (x.score < y.score) 1 else x.index.compareTo(y.index) }
        return scored.take(k)
    }

    /** Maximal marginal relevance: indices maximizing lambda*cos(query, v) - (1-lambda)*max cos(v, picked); ties keep the lower index. */
    fun mmr(query: DoubleArray, vectors: List<DoubleArray>, k: Int, lambda: Double = 0.5): List<Int> {
        require(k >= 0) { "k must be >= 0" }
        require(lambda >= 0 && lambda <= 1) { "lambda must be in [0, 1]" }
        val rel = vectors.map { cosine(query, it) }
        val picked = mutableListOf<Int>()
        val used = BooleanArray(vectors.size)
        while (picked.size < minOf(k, vectors.size)) {
            var best = -1
            var bestScore = 0.0
            for (i in vectors.indices) {
                if (used[i]) continue
                var red = 0.0
                var any = false
                for (j in picked) {
                    val c = cosine(vectors[i], vectors[j])
                    if (!any || c > red) { red = c; any = true }
                }
                val s = lambda * rel[i] - (1 - lambda) * red
                if (best < 0 || s > bestScore) { best = i; bestScore = s }
            }
            picked.add(best)
            used[best] = true
        }
        return picked
    }
}
