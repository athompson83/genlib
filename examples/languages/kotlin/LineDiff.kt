// SPDX-License-Identifier: Apache-2.0

/**
 * Deterministic LCS line diff and unified output: a valid unified diff (patch reproduces the new text);
 * same format as GNU diff -u, which may pick a different alignment of equal size.
 */
object LineDiff {
    private const val MAX_CELLS = 4_000_000L

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

    private fun ops(a: List<Line>, b: List<Line>): List<LineOp> {
        val n = a.size
        val m = b.size
        require(n.toLong() * m <= MAX_CELLS) { "inputs too large to diff (lines(a) * lines(b) > 4,000,000)" }
        val l = Array(n + 1) { IntArray(m + 1) }
        for (i in n - 1 downTo 0) for (j in m - 1 downTo 0) {
            l[i][j] = if (a[i] == b[j]) l[i + 1][j + 1] + 1 else maxOf(l[i + 1][j], l[i][j + 1])
        }
        val out = mutableListOf<LineOp>()
        var i = 0
        var j = 0
        while (i < n || j < m) {
            if (i < n && j < m && a[i] == b[j]) { out += LineOp("=", a[i]); i++; j++ }
            else if (j >= m || (i < n && l[i + 1][j] >= l[i][j + 1])) { out += LineOp("-", a[i]); i++ }
            else { out += LineOp("+", b[j]); j++ }
        }
        return out
    }

    /** Line operations turning [a] into [b]; throws IllegalArgumentException when lines(a) * lines(b) > 4,000,000. */
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
        for ((hs, he) in hunks) {
            val s = maxOf(0, hs - context)
            val e = minOf(rows.size - 1, he + context)
            val seg = rows.subList(s, e + 1)
            val before = rows.subList(0, s)
            val aRange = range(seg.count { it.kind != "+" }, before.count { it.kind != "+" })
            val bRange = range(seg.count { it.kind != "-" }, before.count { it.kind != "-" })
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
