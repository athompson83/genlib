// SPDX-License-Identifier: Apache-2.0

/** Strict SemVer 2.0.0 parsing and precedence, plus npm node-semver style range matching. */
object Semver {
    private const val NUM = "0|[1-9][0-9]*"
    private const val PRE_ID = "(?:0|[1-9][0-9]*|[0-9]*[a-zA-Z-][0-9a-zA-Z-]*)"
    private const val PRE = "$PRE_ID(?:[.]$PRE_ID)*"
    private const val BUILD = "[0-9a-zA-Z-]+(?:[.][0-9a-zA-Z-]+)*"
    private val FULL = Regex("($NUM)[.]($NUM)[.]($NUM)(?:-($PRE))?(?:[+]($BUILD))?")
    private const val XPART = "($NUM|[xX*])"
    private val PARTIAL = Regex("$XPART(?:[.]$XPART(?:[.]$XPART(?:-($PRE))?(?:[+]($BUILD))?)?)?")
    private val OP = Regex("(\\^|~|>=|<=|>|<|=)?(.*)")
    private val HYPHEN = Regex("(\\S+)\\s+-\\s+(\\S+)")
    private val OP_SPACE = Regex("(>=|<=|>|<|=|\\^|~)\\s+")

    /** A parsed version; build metadata is kept but ignored by [compare]. */
    data class Version(val major: Long, val minor: Long, val patch: Long, val prerelease: List<String> = emptyList(), val build: String? = null) {
        override fun toString(): String {
            var s = "$major.$minor.$patch"
            if (prerelease.isNotEmpty()) s += "-" + prerelease.joinToString(".")
            return if (build == null) s else "$s+$build"
        }
    }

    private fun num(s: String): Long = s.toLongOrNull() ?: throw IllegalArgumentException("version number too large: $s")

    private fun pre(s: String?): List<String> = if (s.isNullOrEmpty()) emptyList() else s.split(".")

    /** Parses a strict SemVer 2.0.0 version (no leading zeros, no "v" prefix, no surrounding spaces). */
    fun parse(text: String): Version {
        val m = FULL.matchEntire(text) ?: throw IllegalArgumentException("invalid semantic version: $text")
        val g = m.groupValues
        return Version(num(g[1]), num(g[2]), num(g[3]), pre(g[4]), g[5].ifEmpty { null })
    }

    private fun numeric(id: String) = id.all { it in '0'..'9' }

    private fun compareIds(a: String, b: String): Int {
        val na = numeric(a)
        val nb = numeric(b)
        return when {
            na && nb -> if (a.length != b.length) a.length.compareTo(b.length) else Integer.signum(a.compareTo(b))
            na -> -1
            nb -> 1
            else -> Integer.signum(a.compareTo(b))
        }
    }

    /** SemVer precedence (section 11): -1, 0 or 1. Build metadata is ignored. */
    fun compare(a: Version, b: Version): Int {
        var c = a.major.compareTo(b.major)
        if (c == 0) c = a.minor.compareTo(b.minor)
        if (c == 0) c = a.patch.compareTo(b.patch)
        if (c != 0) return Integer.signum(c)
        val pa = a.prerelease
        val pb = b.prerelease
        if (pa.isEmpty() || pb.isEmpty()) return pa.isEmpty().compareTo(pb.isEmpty())
        for (i in 0 until minOf(pa.size, pb.size)) {
            val r = compareIds(pa[i], pb[i])
            if (r != 0) return r
        }
        return pa.size.compareTo(pb.size)
    }

    fun compare(a: String, b: String): Int = compare(parse(a), parse(b))

    /** One comparator; version == null means "matches anything". */
    private data class Comparator(val op: String, val version: Version?) {
        fun test(v: Version): Boolean {
            val target = version ?: return true
            val c = compare(v, target)
            return when (op) {
                "<" -> c < 0
                "<=" -> c <= 0
                ">" -> c > 0
                ">=" -> c >= 0
                else -> c == 0
            }
        }
    }

    private val ANY = Comparator("", null)
    private val NONE = Comparator("<", Version(0, 0, 0, listOf("0")))

    private fun isX(s: String) = s.isEmpty() || s == "x" || s == "X" || s == "*"

    private fun inc(n: Long): Long = try { Math.addExact(n, 1L) } catch (e: ArithmeticException) { throw IllegalArgumentException("version number too large") }

    private fun v(ma: Long, mi: Long, pa: Long, pre: List<String> = emptyList()) = Version(ma, mi, pa, pre)

    private fun v0(ma: Long, mi: Long, pa: Long) = Version(ma, mi, pa, listOf("0"))

    private fun partial(text: String): List<String> =
        (PARTIAL.matchEntire(text) ?: throw IllegalArgumentException("invalid version in range: $text")).groupValues

    private fun comparator(token: String, out: MutableList<Comparator>) {
        val om = OP.matchEntire(token) ?: throw IllegalArgumentException("invalid comparator: $token")
        val op = om.groupValues[1]
        val g = partial(om.groupValues[2])
        val xM = isX(g[1])
        val xm = xM || isX(g[2])
        val xp = xm || isX(g[3])
        var ma = if (xM) 0 else num(g[1])
        var mi = if (xm) 0 else num(g[2])
        val pa = if (xp) 0 else num(g[3])
        val pr = if (xp) emptyList() else pre(g[4])
        when (op) {
            "^" -> when {
                xM -> out += ANY
                xm -> { out += Comparator(">=", v(ma, 0, 0)); out += Comparator("<", v0(inc(ma), 0, 0)) }
                xp -> { out += Comparator(">=", v(ma, mi, 0)); out += Comparator("<", if (ma == 0L) v0(0, inc(mi), 0) else v0(inc(ma), 0, 0)) }
                else -> {
                    out += Comparator(">=", v(ma, mi, pa, pr))
                    out += Comparator("<", if (ma != 0L) v0(inc(ma), 0, 0) else if (mi != 0L) v0(0, inc(mi), 0) else v0(0, 0, inc(pa)))
                }
            }
            "~" -> when {
                xM -> out += ANY
                xm -> { out += Comparator(">=", v(ma, 0, 0)); out += Comparator("<", v0(inc(ma), 0, 0)) }
                else -> { out += Comparator(">=", v(ma, mi, pa, pr)); out += Comparator("<", v0(ma, inc(mi), 0)) }
            }
            else -> {
                var gt = if (op == "=" && xp) "" else op
                when {
                    xM -> out += if (gt == "<" || gt == ">") NONE else ANY
                    gt.isNotEmpty() && xp -> {
                        if (gt == ">") { gt = ">="; if (xm) { ma = inc(ma); mi = 0 } else mi = inc(mi) }
                        else if (gt == "<=") { gt = "<"; if (xm) ma = inc(ma) else mi = inc(mi) }
                        out += Comparator(gt, if (gt == "<") v0(ma, mi, 0) else v(ma, mi, 0))
                    }
                    xm -> { out += Comparator(">=", v(ma, 0, 0)); out += Comparator("<", v0(inc(ma), 0, 0)) }
                    xp -> { out += Comparator(">=", v(ma, mi, 0)); out += Comparator("<", v0(ma, inc(mi), 0)) }
                    else -> out += Comparator(gt.ifEmpty { "=" }, v(ma, mi, pa, pr))
                }
            }
        }
    }

    private fun hyphen(from: String, to: String, out: MutableList<Comparator>) {
        val f = partial(from)
        val t = partial(to)
        out += when {
            isX(f[1]) -> ANY
            isX(f[2]) -> Comparator(">=", v(num(f[1]), 0, 0))
            isX(f[3]) -> Comparator(">=", v(num(f[1]), num(f[2]), 0))
            else -> Comparator(">=", v(num(f[1]), num(f[2]), num(f[3]), pre(f[4])))
        }
        out += when {
            isX(t[1]) -> ANY
            isX(t[2]) -> Comparator("<", v0(inc(num(t[1])), 0, 0))
            isX(t[3]) -> Comparator("<", v0(num(t[1]), inc(num(t[2])), 0))
            else -> Comparator("<=", v(num(t[1]), num(t[2]), num(t[3]), pre(t[4])))
        }
    }

    private fun parseSet(raw: String): List<Comparator> {
        val out = mutableListOf<Comparator>()
        val trimmed = raw.trim()
        val h = HYPHEN.matchEntire(trimmed)
        if (h != null) { hyphen(h.groupValues[1], h.groupValues[2], out); return out }
        val set = OP_SPACE.replace(trimmed, "$1")
        if (set.isEmpty()) return listOf(ANY)
        for (token in set.split(Regex("\\s+"))) comparator(token, out)
        return out
    }

    private fun testSet(set: List<Comparator>, version: Version): Boolean {
        if (!set.all { it.test(version) }) return false
        if (version.prerelease.isEmpty()) return true
        // A prerelease only matches when a comparator in this set opts into the same major.minor.patch prerelease.
        // Synthetic "<X.Y.Z-0" upper bounds can never admit an X.Y.Z prerelease, so they never qualify here.
        return set.any { c ->
            val a = c.version
            a != null && a.prerelease.isNotEmpty() && a.major == version.major && a.minor == version.minor && a.patch == version.patch
        }
    }

    /** True when [version] satisfies the npm-style [range] (|| sets of comparators, ^, ~, x-ranges, hyphen ranges). */
    fun satisfies(version: String, range: String): Boolean {
        val v = parse(version)
        val sets = range.split("||").map { parseSet(it) }
        return sets.any { testSet(it, v) }
    }
}
