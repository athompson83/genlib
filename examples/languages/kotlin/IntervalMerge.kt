// SPDX-License-Identifier: Apache-2.0

/**
 * Integer half-open intervals [start, end) as Pair(start, end) with start < end (otherwise IllegalArgumentException).
 * Every list result is sorted and non-overlapping, with touching intervals merged. Touching intervals do not overlap.
 */
object IntervalMerge {
    private fun validate(xs: List<Pair<Long, Long>>) {
        for ((s, e) in xs) require(s < e) { "bad interval" }
    }

    /** Sorts and merges overlapping or touching intervals. */
    fun merge(xs: List<Pair<Long, Long>>): List<Pair<Long, Long>> {
        validate(xs)
        val out = ArrayList<Pair<Long, Long>>()
        for ((s, e) in xs.sortedWith(compareBy({ it.first }, { it.second }))) {
            if (out.isNotEmpty() && s <= out.last().second) out[out.size - 1] = out.last().first to maxOf(out.last().second, e)
            else out.add(s to e)
        }
        return out
    }

    /** The parts covered by both a and b. */
    fun intersect(a: List<Pair<Long, Long>>, b: List<Pair<Long, Long>>): List<Pair<Long, Long>> {
        val x = merge(a)
        val y = merge(b)
        val out = ArrayList<Pair<Long, Long>>()
        var i = 0
        var j = 0
        while (i < x.size && j < y.size) {
            val s = maxOf(x[i].first, y[j].first)
            val e = minOf(x[i].second, y[j].second)
            if (s < e) out.add(s to e)
            if (x[i].second < y[j].second) i++ else j++
        }
        return merge(out)
    }

    /** The parts of a not covered by b. */
    fun subtract(a: List<Pair<Long, Long>>, b: List<Pair<Long, Long>>): List<Pair<Long, Long>> {
        val y = merge(b)
        val out = ArrayList<Pair<Long, Long>>()
        for ((s, e) in merge(a)) {
            var cur = s
            for ((bs, be) in y) {
                if (be <= cur || bs >= e) continue
                if (bs > cur) out.add(cur to bs)
                cur = maxOf(cur, be)
                if (cur >= e) break
            }
            if (cur < e) out.add(cur to e)
        }
        return out
    }

    /** The parts of [lo, hi) not covered by xs; lo must be below hi. */
    fun gaps(xs: List<Pair<Long, Long>>, lo: Long, hi: Long): List<Pair<Long, Long>> {
        require(lo < hi) { "bad bounds" }
        return subtract(listOf(lo to hi), xs)
    }

    /** The covered length after merging. */
    fun total(xs: List<Pair<Long, Long>>): Long = merge(xs).sumOf { it.second - it.first }

    /** True when the two intervals share at least one point. */
    fun overlaps(x: Pair<Long, Long>, y: Pair<Long, Long>): Boolean {
        validate(listOf(x, y))
        return x.first < y.second && y.first < x.second
    }

    /** True when some interval holds p (start inclusive, end exclusive). */
    fun contains(xs: List<Pair<Long, Long>>, p: Long): Boolean = merge(xs).any { p >= it.first && p < it.second }
}
