// SPDX-License-Identifier: Apache-2.0

/** Edit distances and similarity scores over Unicode code points (not UTF-16 units or bytes). */
object StringSimilarity {
    private fun cps(s: String): IntArray = s.codePoints().toArray()

    /** Levenshtein distance (insert, delete, substitute cost 1). */
    fun levenshtein(a: String, b: String): Int {
        val x = cps(a)
        val y = cps(b)
        var prev = IntArray(y.size + 1) { it }
        for (i in 1..x.size) {
            val cur = IntArray(y.size + 1)
            cur[0] = i
            for (j in 1..y.size) cur[j] = minOf(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + if (x[i - 1] == y[j - 1]) 0 else 1)
            prev = cur
        }
        return prev[y.size]
    }

    /** Optimal string alignment distance: Levenshtein plus adjacent transposition (cost 1), no substring edited twice. */
    fun damerauOsa(a: String, b: String): Int {
        val x = cps(a)
        val y = cps(b)
        val d = Array(x.size + 1) { IntArray(y.size + 1) }
        for (i in 0..x.size) d[i][0] = i
        for (j in 0..y.size) d[0][j] = j
        for (i in 1..x.size) {
            for (j in 1..y.size) {
                val c = if (x[i - 1] == y[j - 1]) 0 else 1
                d[i][j] = minOf(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + c)
                if (i > 1 && j > 1 && x[i - 1] == y[j - 2] && x[i - 2] == y[j - 1]) d[i][j] = minOf(d[i][j], d[i - 2][j - 2] + 1)
            }
        }
        return d[x.size][y.size]
    }

    /** Jaro similarity in [0, 1]; two empty strings give 1, one empty string gives 0. */
    fun jaro(a: String, b: String): Double {
        val x = cps(a)
        val y = cps(b)
        if (x.isEmpty() && y.isEmpty()) return 1.0
        if (x.isEmpty() || y.isEmpty()) return 0.0
        val w = maxOf(maxOf(x.size, y.size) / 2 - 1, 0)
        val mx = BooleanArray(x.size)
        val my = BooleanArray(y.size)
        var m = 0
        for (i in x.indices) {
            for (j in maxOf(0, i - w) until minOf(y.size, i + w + 1)) {
                if (!my[j] && y[j] == x[i]) { mx[i] = true; my[j] = true; m++; break }
            }
        }
        if (m == 0) return 0.0
        var t = 0
        var k = 0
        for (i in x.indices) {
            if (!mx[i]) continue
            while (!my[k]) k++
            if (x[i] != y[k]) t++
            k++
        }
        return (m.toDouble() / x.size + m.toDouble() / y.size + (m - t / 2.0) / m) / 3
    }

    /** Jaro-Winkler similarity with prefix scale 0.1 and a common prefix of at most 4 code points. */
    fun jaroWinkler(a: String, b: String): Double {
        val j = jaro(a, b)
        val x = cps(a)
        val y = cps(b)
        var l = 0
        while (l < 4 && l < x.size && l < y.size && x[l] == y[l]) l++
        return j + l * 0.1 * (1 - j)
    }

    /** 1 - levenshtein / max(length) (1 for two empty strings). */
    fun similarityRatio(a: String, b: String): Double {
        val n = maxOf(cps(a).size, cps(b).size)
        return if (n == 0) 1.0 else 1 - levenshtein(a, b).toDouble() / n
    }
}
