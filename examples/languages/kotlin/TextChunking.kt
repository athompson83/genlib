// SPDX-License-Identifier: Apache-2.0

/**
 * Text chunking for retrieval (RAG): split at the largest natural boundary that fits (paragraph, line,
 * sentence, word, code point), pack greedily, optionally overlap whole pieces. Lengths count code points.
 */
object TextChunking {
    private fun ws(c: Int) = c == ' '.code || c == '\t'.code || c == '\n'.code || c == '\r'.code || c == 0x0C || c == 0x0B

    private fun startsWith(t: IntArray, at: Int, sep: IntArray): Boolean {
        if (at + sep.size > t.size) return false
        for (k in sep.indices) if (t[at + k] != sep[k]) return false
        return true
    }

    private fun find(t: IntArray, sep: IntArray, start: Int): Int {
        var i = start
        while (i + sep.size <= t.size) { if (startsWith(t, i, sep)) return i; i++ }
        return -1
    }

    private fun isEnd(c: Int) = c == '.'.code || c == '!'.code || c == '?'.code

    private fun splitKeep(t: IntArray, level: Int): List<IntArray> {
        val out = mutableListOf<IntArray>()
        if (level == 0 || level == 1 || level == 3) {
            val sep = when (level) { 0 -> intArrayOf(10, 10); 1 -> intArrayOf(10); else -> intArrayOf(32) }
            var start = 0
            while (true) {
                val i = find(t, sep, start)
                if (i < 0) break
                var j = i + sep.size
                while (startsWith(t, j, sep)) j += sep.size
                out.add(t.copyOfRange(start, j))
                start = j
            }
            if (start < t.size) out.add(t.copyOfRange(start, t.size))
            return out
        }
        if (level == 2) {
            var start = 0
            var i = 0
            while (i < t.size) {
                if (isEnd(t[i]) && i + 1 < t.size && ws(t[i + 1])) {
                    var j = i + 1
                    while (j < t.size && ws(t[j])) j++
                    out.add(t.copyOfRange(start, j))
                    start = j
                    i = j
                    continue
                }
                i++
            }
            if (start < t.size) out.add(t.copyOfRange(start, t.size))
            return out
        }
        for (c in t) out.add(intArrayOf(c))
        return out
    }

    private fun pieces(t: IntArray, max: Int, level: Int): List<IntArray> {
        if (t.size <= max) return listOf(t)
        val out = mutableListOf<IntArray>()
        for (p in splitKeep(t, level)) if (p.size <= max) out.add(p) else out.addAll(pieces(p, max, level + 1))
        return out
    }

    private fun emit(cur: List<IntArray>, chunks: MutableList<String>) {
        val all = IntArray(cur.sumOf { it.size })
        var at = 0
        for (p in cur) { p.copyInto(all, at); at += p.size }
        var a = 0
        var b = all.size
        while (a < b && ws(all[a])) a++
        while (b > a && ws(all[b - 1])) b--
        if (b > a) chunks.add(String(all, a, b - a))
    }

    /** Chunks of at most [maxChars] code points, trimmed of ASCII whitespace, never empty; [overlap] repeats whole trailing pieces. */
    fun chunkText(text: String, maxChars: Int, overlap: Int = 0): List<String> {
        require(maxChars >= 1) { "maxChars must be >= 1" }
        require(overlap in 0 until maxChars) { "overlap must be in 0..maxChars-1" }
        val chunks = mutableListOf<String>()
        var cur = mutableListOf<IntArray>()
        var size = 0
        for (p in pieces(text.codePoints().toArray(), maxChars, 0)) {
            if (cur.isNotEmpty() && size + p.size > maxChars) {
                emit(cur, chunks)
                val keep = ArrayDeque<IntArray>()
                var total = 0
                if (overlap > 0) {
                    for (k in cur.size - 1 downTo 1) {
                        val q = cur[k]
                        if (total + q.size > overlap) break
                        keep.addFirst(q)
                        total += q.size
                    }
                }
                while (keep.isNotEmpty() && total + p.size > maxChars) total -= keep.removeFirst().size
                cur = keep.toMutableList()
                size = total
            }
            cur.add(p)
            size += p.size
        }
        if (cur.isNotEmpty()) emit(cur, chunks)
        return chunks
    }
}
