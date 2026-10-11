// SPDX-License-Identifier: Apache-2.0

/**
 * Glob matching for '/'-separated paths: '*', '?', '[...]' (never crossing '/'), whole-segment '**', '{a,b}'
 * alternatives and backslash escapes. A segment starting with '.' needs a literal '.' in the pattern unless dot is set.
 * Matching is case-sensitive and works on Unicode code points. Malformed patterns throw IllegalArgumentException.
 */
object GlobMatch {
    /** True when path matches the glob pattern; dot=true lets wildcards match segments starting with '.'. */
    fun globMatch(pattern: String, path: String, dot: Boolean = false): Boolean {
        require(pattern.isNotEmpty()) { "empty pattern" }
        require((pattern.length - pattern.trimEnd('\\').length) % 2 == 0) { "trailing backslash" }
        var k = 0
        while (k < pattern.length) {
            if (pattern[k] == '\\') { k += 2; continue }
            if (pattern[k] == '[') {
                var j = k + 1
                if (j < pattern.length && (pattern[j] == '!' || pattern[j] == '^')) j++
                if (j < pattern.length && pattern[j] == ']') j++
                while (j < pattern.length && pattern[j] != ']') j += if (pattern[j] == '\\') 2 else 1
                require(j < pattern.length) { "unterminated [" }
                k = j
            }
            k++
        }
        val p = path.codePoints().toArray()
        return expandBraces(pattern).any { matchOne(it, p, dot) }
    }

    /** The paths that match the pattern, in their original order; dot as in globMatch. */
    fun globFilter(pattern: String, paths: List<String>, dot: Boolean = false): List<String> =
        paths.filter { globMatch(pattern, it, dot) }

    private fun expandBraces(p: String): List<String> {
        var i = -1
        var k = 0
        while (k < p.length) {
            val c = p[k]
            if (c == '\\') { k += 2; continue }
            if (c == '{') { i = k; break }
            require(c != '}') { "unmatched }" }
            k++
        }
        if (i < 0) return listOf(p)
        var j = i + 1
        val parts = mutableListOf<String>()
        val cur = StringBuilder()
        var closed = false
        while (j < p.length) {
            val c = p[j]
            if (c == '\\') { cur.append(p, j, minOf(j + 2, p.length)); j += 2; continue }
            require(c != '{') { "nested braces are not supported" }
            if (c == ',') { parts.add(cur.toString()); cur.setLength(0); j++; continue }
            if (c == '}') { parts.add(cur.toString()); closed = true; break }
            cur.append(c)
            j++
        }
        require(closed) { "unterminated {" }
        return parts.flatMap { expandBraces(p.substring(0, i) + it + p.substring(j + 1)) }
    }

    private fun splitSegments(p: IntArray): List<IntArray> {
        val segs = mutableListOf<IntArray>()
        val cur = mutableListOf<Int>()
        var k = 0
        while (k < p.size) {
            if (p[k] == '\\'.code && k + 1 < p.size) { cur.add(p[k]); cur.add(p[k + 1]); k += 2; continue }
            if (p[k] == '/'.code) { segs.add(cur.toIntArray()); cur.clear(); k++; continue }
            cur.add(p[k])
            k++
        }
        segs.add(cur.toIntArray())
        return segs
    }

    private fun startsWithDot(s: IntArray) = s.isNotEmpty() && s[0] == '.'.code

    private fun matchOne(pattern: String, path: IntArray, dot: Boolean): Boolean {
        val ps = splitSegments(pattern.codePoints().toArray())
        val ss = mutableListOf<IntArray>()
        var start = 0
        for (i in 0..path.size) {
            if (i == path.size || path[i] == '/'.code) { ss.add(path.copyOfRange(start, i)); start = i + 1 }
        }
        val memo = HashMap<Long, Boolean>()
        fun m(i: Int, j: Int): Boolean {
            val key = (i.toLong() shl 32) or j.toLong()
            memo[key]?.let { return it }
            val r = when {
                i == ps.size -> j == ss.size
                ps[i].size == 2 && ps[i][0] == '*'.code && ps[i][1] == '*'.code -> {
                    var hit = false
                    for (k in j..ss.size) {
                        if (k > j && !dot && startsWithDot(ss[k - 1])) break
                        if (m(i + 1, k)) { hit = true; break }
                    }
                    hit
                }
                j >= ss.size -> false
                else -> segMatch(ps[i], ss[j], dot) && m(i + 1, j + 1)
            }
            memo[key] = r
            return r
        }
        return m(0, 0)
    }

    private fun segMatch(pat: IntArray, s: IntArray, dot: Boolean): Boolean {
        if (!dot && startsWithDot(s) && !startsWithDot(pat) && !(pat.size > 1 && pat[0] == '\\'.code && pat[1] == '.'.code)) return false
        val memo = HashMap<Long, Boolean>()
        fun m(pi0: Int, si0: Int): Boolean {
            val key = (pi0.toLong() shl 32) or si0.toLong()
            memo[key]?.let { return it }
            var pi = pi0
            var si = si0
            var result: Boolean? = null
            while (result == null && pi < pat.size) {
                var c = pat[pi]
                if (c == '*'.code) {
                    while (pi < pat.size && pat[pi] == '*'.code) pi++
                    result = pi == pat.size || (si..s.size).any { m(pi, it) }
                    break
                }
                if (si >= s.size) { result = false; break }
                if (c == '?'.code) { pi++; si++; continue }
                if (c == '['.code) {
                    var j = pi + 1
                    var neg = false
                    if (j < pat.size && (pat[j] == '!'.code || pat[j] == '^'.code)) { neg = true; j++ }
                    var first = true
                    var hit = false
                    while (true) {
                        require(j < pat.size) { "unterminated [" }
                        if (pat[j] == ']'.code && !first) break
                        first = false
                        var a = pat[j]
                        if (a == '\\'.code && j + 1 < pat.size) { j++; a = pat[j] }
                        var hi = a
                        if (j + 2 < pat.size && pat[j + 1] == '-'.code && pat[j + 2] != ']'.code) {
                            var b = pat[j + 2]
                            if (b == '\\'.code && j + 3 < pat.size) { j++; b = pat[j + 2] }
                            hi = b
                            j += 3
                        } else j++
                        if (s[si] in a..hi) hit = true
                    }
                    if (hit == neg) { result = false; break }
                    pi = j + 1
                    si++
                    continue
                }
                if (c == '\\'.code) {
                    require(pi + 1 < pat.size) { "trailing backslash" }
                    c = pat[pi + 1]
                    pi++
                }
                if (s[si] != c) { result = false; break }
                pi++
                si++
            }
            val r = result ?: (si == s.size)
            memo[key] = r
            return r
        }
        return m(0, 0)
    }
}
