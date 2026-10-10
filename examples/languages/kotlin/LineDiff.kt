// SPDX-License-Identifier: Apache-2.0

/**
 * Line diff and unified output. The result is a valid unified diff (patch reproduces the new text) and
 * minimal (a shortest edit script). It is usually equal to GNU diff -u (about 95% of small random
 * inputs) but that is not guaranteed. Lines that occur nowhere in the other text are removed first, then
 * Myers' linear-space middle-snake recursion runs in O((N+M)·D) time and O(N+M) memory, and changes are
 * slid down and aligned next to the other file's changes. Inputs above 1,000,000 lines in total throw.
 */
object LineDiff {
    private const val MAX_LINES = 1_000_000

    /** One diff operation: [kind] is "=", "-" or "+". */
    data class Op(val kind: String, val line: String)

    /** A line without its LF; [noEol] marks the last line of a text that does not end in LF, so it only matches another such line. */
    private data class Line(val text: String, val noEol: Boolean)

    private class LineOp(val kind: String, val line: Line)

    private fun split(t: String): List<Line> {
        if (t.isEmpty()) return emptyList()
        val nl = t.endsWith("\n")
        val parts = t.split("\n").toMutableList()
        if (nl) parts.removeAt(parts.size - 1)
        return parts.mapIndexed { k, p -> Line(p, !nl && k == parts.size - 1) }
    }

    /** Returns [x, y, u, v]: a middle snake from (x, y) to (u, v) of the box a[a0:a1] x b[b0:b1]. */
    private fun middleSnake(a: IntArray, b: IntArray, a0: Int, a1: Int, b0: Int, b1: Int): IntArray {
        val n = a1 - a0
        val m = b1 - b0
        val delta = n - m
        val odd = (delta and 1) != 0
        val off = n + m + 1
        val vf = IntArray(2 * off + 1)
        val vb = IntArray(2 * off + 1)
        for (d in 0..(n + m + 1) / 2) {
            for (k in -d..d step 2) {
                var x = if (k == -d || (k != d && vf[off + k - 1] < vf[off + k + 1])) vf[off + k + 1] else vf[off + k - 1] + 1
                var y = x - k
                val sx = x
                val sy = y
                while (x < n && y < m && a[a0 + x] == b[b0 + y]) { x++; y++ }
                vf[off + k] = x
                if (odd && k >= delta - (d - 1) && k <= delta + (d - 1) && x + vb[off + delta - k] >= n) {
                    return intArrayOf(a0 + sx, b0 + sy, a0 + x, b0 + y)
                }
            }
            for (k in -d..d step 2) {
                var x = if (k == -d || (k != d && vb[off + k - 1] < vb[off + k + 1])) vb[off + k + 1] else vb[off + k - 1] + 1
                var y = x - k
                val sx = x
                val sy = y
                while (x < n && y < m && a[a1 - 1 - x] == b[b1 - 1 - y]) { x++; y++ }
                vb[off + k] = x
                if (!odd && delta - k >= -d && delta - k <= d && x + vf[off + delta - k] >= n) {
                    return intArrayOf(a1 - x, b1 - y, a1 - sx, b1 - sy)
                }
            }
        }
        throw IllegalStateException("no middle snake")
    }

    private fun compare(a: IntArray, b: IntArray, lo0: Int, hi0: Int, lo1: Int, hi1: Int, ca: BooleanArray, cb: BooleanArray) {
        var a0 = lo0
        var a1 = hi0
        var b0 = lo1
        var b1 = hi1
        while (a0 < a1 && b0 < b1 && a[a0] == b[b0]) { a0++; b0++ }
        while (a1 > a0 && b1 > b0 && a[a1 - 1] == b[b1 - 1]) { a1--; b1-- }
        if (a0 == a1) { for (j in b0 until b1) cb[j] = true; return }
        if (b0 == b1) { for (i in a0 until a1) ca[i] = true; return }
        val s = middleSnake(a, b, a0, a1, b0, b1)
        compare(a, b, a0, s[0], b0, s[1], ca, cb)
        compare(a, b, s[2], a1, s[3], b1, ca, cb)
    }

    /** Moves each run of changed lines down while the line after it equals its first line. */
    private fun slide(lines: IntArray, changed: BooleanArray) {
        var i = 0
        val n = lines.size
        while (i < n) {
            if (!changed[i]) { i++; continue }
            var j = i
            while (j < n && changed[j]) j++
            while (j < n && lines[i] == lines[j]) {
                changed[i] = false
                changed[j] = true
                i++
                j++
                while (j < n && changed[j]) j++
            }
            i = j
        }
    }

    /**
     * One bottom-up pass: slides a run of changed x lines up through equal lines when that places it
     * next to changed lines of the other file, so a hunk shows a replacement instead of a deletion and
     * an insertion apart.
     */
    private fun align(x: IntArray, cx: BooleanArray, cy: BooleanArray) {
        val ne = cx.count { !it }
        val xb = IntArray(ne + 1)
        val yb = IntArray(ne + 2)
        val xe = IntArray(ne + 1)
        xb[0] = -1
        yb[0] = -1
        var i = 0
        var j = 0
        for (p in 0 until ne) {
            while (cx[i]) i++
            while (cy[j]) j++
            xb[p + 1] = i
            yb[p + 1] = j
            xe[p] = i
            i++
            j++
        }
        yb[ne + 1] = cy.size
        xe[ne] = cx.size
        var g = ne
        while (g >= 1) {
            val x0 = xb[g] + 1
            val x1 = xe[g]
            if (x1 > x0 && yb[g + 1] - yb[g] == 1) {
                var h = g
                var top = x0
                var last = x1 - 1
                while (h >= 1 && xb[h] == top - 1 && x[top - 1] == x[last]) {
                    h--
                    top--
                    last--
                    if (yb[h + 1] - yb[h] > 1) {
                        for (k in top until x0) cx[k] = true
                        for (k in last + 1 until x1) cx[k] = false
                        g = h
                        break
                    }
                    if (h >= 1 && xe[h] - xb[h] > 1) break
                }
            }
            g--
        }
    }

    private fun keep(lines: IntArray, inOther: BooleanArray, changed: BooleanArray): IntArray {
        for (i in lines.indices) changed[i] = !inOther[lines[i]]
        return lines.indices.filter { !changed[it] }.toIntArray()
    }

    private fun ops(a: List<Line>, b: List<Line>): List<LineOp> {
        require(a.size.toLong() + b.size <= MAX_LINES) { "diff input too large (more than 1,000,000 lines)" }
        val ids = HashMap<Line, Int>()
        val ia = IntArray(a.size) { ids.getOrPut(a[it]) { ids.size } }
        val ib = IntArray(b.size) { ids.getOrPut(b[it]) { ids.size } }
        val inA = BooleanArray(ids.size)
        val inB = BooleanArray(ids.size)
        for (v in ia) inA[v] = true
        for (v in ib) inB[v] = true
        val ca = BooleanArray(ia.size)
        val cb = BooleanArray(ib.size)
        // A line that never occurs in the other file is in no common subsequence: mark it changed and
        // run Myers only on the remaining lines (the result stays minimal).
        val ka = keep(ia, inB, ca)
        val kb = keep(ib, inA, cb)
        val fa = IntArray(ka.size) { ia[ka[it]] }
        val fb = IntArray(kb.size) { ib[kb[it]] }
        val sa = BooleanArray(fa.size)
        val sb = BooleanArray(fb.size)
        compare(fa, fb, 0, fa.size, 0, fb.size, sa, sb)
        for (k in ka.indices) ca[ka[k]] = sa[k]
        for (k in kb.indices) cb[kb[k]] = sb[k]
        slide(ia, ca)
        slide(ib, cb)
        align(ia, ca, cb)
        align(ib, cb, ca)
        val out = ArrayList<LineOp>()
        var i = 0
        var j = 0
        while (i < ia.size || j < ib.size) {
            if (i < ia.size && ca[i]) out += LineOp("-", a[i++])
            else if (j < ib.size && cb[j]) out += LineOp("+", b[j++])
            else { out += LineOp("=", a[i]); i++; j++ }
        }
        return out
    }

    /** Line operations turning [a] into [b]; throws IllegalArgumentException above 1,000,000 lines in total. */
    fun diffLines(a: String, b: String): List<Op> = ops(split(a), split(b)).map { Op(it.kind, it.line.text) }

    /** Valid unified diff (patch reproduces the new text), or "" when the texts are equal. */
    fun unifiedDiff(aText: String, bText: String, fromName: String = "a", toName: String = "b", context: Int = 3): String {
        require(context >= 0) { "context must be non-negative" }
        val rows = ops(split(aText), split(bText))
        val changes = rows.indices.filter { rows[it].kind != "=" }
        if (changes.isEmpty()) return ""
        val hunks = mutableListOf<Pair<Int, Int>>()
        var start = changes[0]
        var end = start
        for (k in changes.drop(1)) {
            if (k - end - 1 <= 2 * context) end = k else { hunks += start to end; start = k; end = k }
        }
        hunks += start to end
        val out = StringBuilder("--- $fromName\n+++ $toName\n")
        var aBefore = 0
        var bBefore = 0
        var counted = 0
        for ((hs, he) in hunks) {
            val s = maxOf(0, hs - context)
            val e = minOf(rows.size - 1, he + context)
            while (counted < s) {
                val kind = rows[counted++].kind
                if (kind != "+") aBefore++
                if (kind != "-") bBefore++
            }
            val seg = rows.subList(s, e + 1)
            val aRange = range(seg.count { it.kind != "+" }, aBefore)
            val bRange = range(seg.count { it.kind != "-" }, bBefore)
            out.append("@@ -$aRange +$bRange @@\n")
            for (r in seg) {
                out.append(if (r.kind == "=") " " else r.kind).append(r.line.text).append('\n')
                if (r.line.noEol) out.append("\\ No newline at end of file\n")
            }
        }
        return out.toString()
    }

    private fun range(count: Int, before: Int): String = when (count) {
        0 -> "$before,0"
        1 -> "${before + 1}"
        else -> "${before + 1},$count"
    }
}
