// SPDX-License-Identifier: Apache-2.0

/** Deterministic LCS line diff and GNU diff -u compatible unified output. */
object LineDiff {
    private const val MAX_CELLS = 4_000_000L

    /** One diff operation: [kind] is "=", "-" or "+". */
    data class Op(val kind: String, val line: String)

    private class Lines(val lines: List<String>, val finalNewline: Boolean)

    private class Row(val kind: String, val line: String, val a: Int, val b: Int)

    private fun split(t: String): Lines {
        if (t.isEmpty()) return Lines(emptyList(), true)
        val nl = t.endsWith("\n")
        val lines = t.split("\n").toMutableList()
        if (nl) lines.removeAt(lines.size - 1)
        return Lines(lines, nl)
    }

    private fun ops(a: List<String>, b: List<String>): List<Op> {
        val n = a.size
        val m = b.size
        require(n.toLong() * m <= MAX_CELLS) { "inputs too large to diff (lines(a) * lines(b) > 4,000,000)" }
        val l = Array(n + 1) { IntArray(m + 1) }
        for (i in n - 1 downTo 0) for (j in m - 1 downTo 0) {
            l[i][j] = if (a[i] == b[j]) l[i + 1][j + 1] + 1 else maxOf(l[i + 1][j], l[i][j + 1])
        }
        val out = mutableListOf<Op>()
        var i = 0
        var j = 0
        while (i < n || j < m) {
            if (i < n && j < m && a[i] == b[j]) { out += Op("=", a[i]); i++; j++ }
            else if (j >= m || (i < n && l[i + 1][j] >= l[i][j + 1])) { out += Op("-", a[i]); i++ }
            else { out += Op("+", b[j]); j++ }
        }
        return out
    }

    /** Line operations turning [a] into [b]; throws IllegalArgumentException when lines(a) * lines(b) > 4,000,000. */
    fun diffLines(a: String, b: String): List<Op> = ops(split(a).lines, split(b).lines)

    /** GNU-style unified diff, or "" when the texts are equal. */
    fun unifiedDiff(aText: String, bText: String, fromName: String = "a", toName: String = "b", context: Int = 3): String {
        require(context >= 0) { "context must be non-negative" }
        val la = split(aText)
        val lb = split(bText)
        val a = la.lines
        val b = lb.lines
        val rows = mutableListOf<Row>()
        var ai = 0
        var bi = 0
        for (op in ops(a, b)) {
            when (op.kind) {
                "=" -> rows += Row("=", op.line, ai++, bi++)
                "-" -> rows += Row("-", op.line, ai++, -1)
                else -> rows += Row("+", op.line, -1, bi++)
            }
        }
        if (la.finalNewline != lb.finalNewline && rows.isNotEmpty()) {
            val last = rows.last()
            if (last.kind == "=" && last.a == a.size - 1 && last.b == b.size - 1) {
                rows.removeAt(rows.size - 1)
                rows += Row("-", last.line, last.a, -1)
                rows += Row("+", last.line, -1, last.b)
            }
        }
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
            val aLines = seg.filter { it.kind != "+" }
            val bLines = seg.filter { it.kind != "-" }
            val aRange = range(aLines.size, aLines.firstOrNull()?.a ?: -1, before.count { it.kind != "+" })
            val bRange = range(bLines.size, bLines.firstOrNull()?.b ?: -1, before.count { it.kind != "-" })
            out.append("@@ -$aRange +$bRange @@\n")
            for (r in seg) {
                out.append(if (r.kind == "=") " " else r.kind).append(r.line).append('\n')
                if (r.kind != "+" && r.a == a.size - 1 && !la.finalNewline && (r.kind == "-" || la.finalNewline == lb.finalNewline)) {
                    out.append("\\ No newline at end of file\n")
                } else if (r.kind == "+" && r.b == b.size - 1 && !lb.finalNewline) {
                    out.append("\\ No newline at end of file\n")
                }
            }
        }
        return out.toString()
    }

    private fun range(count: Int, first: Int, before: Int): String = when (count) {
        0 -> "$before,0"
        1 -> "${first + 1}"
        else -> "${first + 1},$count"
    }
}
