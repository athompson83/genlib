// SPDX-License-Identifier: Apache-2.0

/** Natural sort ("file2" before "file10"): ASCII digit runs compare by value, text runs by ASCII-folded code points. */
object NaturalSort {
    private class Run(val digit: Boolean, val cps: IntArray)

    private fun isDigit(c: Int) = c in '0'.code..'9'.code

    private fun runs(s: IntArray): List<Run> {
        val out = mutableListOf<Run>()
        var i = 0
        while (i < s.size) {
            var j = i
            val digit = isDigit(s[i])
            while (j < s.size && isDigit(s[j]) == digit) j++
            out.add(Run(digit, s.copyOfRange(i, j)))
            i = j
        }
        return out
    }

    private fun fold(s: IntArray) = IntArray(s.size) { if (s[it] in 'A'.code..'Z'.code) s[it] + 32 else s[it] }

    private fun cmp(a: IntArray, b: IntArray): Int {
        for (i in 0 until minOf(a.size, b.size)) if (a[i] != b[i]) return a[i].compareTo(b[i])
        return a.size.compareTo(b.size)
    }

    private fun stripZeros(s: IntArray): IntArray {
        var i = 0
        while (i < s.size && s[i] == '0'.code) i++
        return if (i == s.size) intArrayOf('0'.code) else s.copyOfRange(i, s.size)
    }

    /** -1, 0 or 1: run by run (digit runs by value and before text runs), then fewer runs, fewer leading zeros, code points. */
    fun naturalCompare(a: String, b: String): Int {
        val ca = a.codePoints().toArray()
        val cb = b.codePoints().toArray()
        val ra = runs(ca)
        val rb = runs(cb)
        val n = minOf(ra.size, rb.size)
        for (i in 0 until n) {
            val x = ra[i]
            val y = rb[i]
            val c = if (x.digit && y.digit) {
                val na = stripZeros(x.cps)
                val nb = stripZeros(y.cps)
                na.size.compareTo(nb.size).let { if (it != 0) it else cmp(na, nb) }
            } else if (x.digit != y.digit) {
                if (x.digit) -1 else 1
            } else {
                cmp(fold(x.cps), fold(y.cps))
            }
            if (c != 0) return Integer.signum(c)
        }
        val c = ra.size.compareTo(rb.size)
        if (c != 0) return Integer.signum(c)
        for (i in 0 until n) {
            if (ra[i].digit && rb[i].digit) {
                val d = ra[i].cps.size.compareTo(rb[i].cps.size)
                if (d != 0) return Integer.signum(d)
            }
        }
        return Integer.signum(cmp(ca, cb))
    }

    /** A new list sorted with [naturalCompare] (stable). */
    fun naturalSort(items: List<String>): List<String> = items.sortedWith(::naturalCompare)
}
