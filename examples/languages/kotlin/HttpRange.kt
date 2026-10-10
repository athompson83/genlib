// SPDX-License-Identifier: Apache-2.0
import java.math.BigInteger

/** RFC 9110 byte Range request parsing and Content-Range values. */
object HttpRange {
    private val HEADER = Regex("[ \\t]*([A-Za-z]+)=(.*)")
    private val SPEC = Regex("([0-9]+)-([0-9]*)|-([0-9]+)")
    private const val MAX_SPECS = 100

    /** An inclusive byte range. */
    data class ByteRange(val start: Long, val end: Long)

    /** Parse outcome: None = serve 200 with the full body, Unsatisfiable = 416, Ranges = 206 (header order, not merged). */
    sealed class Result {
        data object None : Result()
        data class Unsatisfiable(val contentRange: String) : Result()
        data class Ranges(val ranges: List<ByteRange>) : Result()
    }

    private fun trim(s: String) = s.trim { it == ' ' || it == '\t' }

    /** Parses a Range [header] (null when absent) for a representation of [size] bytes. */
    fun parseRange(header: String?, size: Long): Result {
        require(size >= 0) { "size must be non-negative" }
        if (header == null) return Result.None
        val m = HEADER.matchEntire(header) ?: return Result.None
        if (m.groupValues[1].lowercase() != "bytes") return Result.None
        val specs = m.groupValues[2].split(",").map(::trim)
        if (specs.size > MAX_SPECS || specs.any { it.isEmpty() }) return Result.None
        val big = BigInteger.valueOf(size)
        val out = mutableListOf<ByteRange>()
        for (p in specs) {
            val mm = SPEC.matchEntire(p) ?: return Result.None
            val suffix = mm.groups[3]
            if (suffix != null) {
                val n = BigInteger(suffix.value)
                if (n.signum() == 0 || size == 0L) continue
                out += ByteRange(if (n >= big) 0 else size - n.toLong(), size - 1)
            } else {
                val a = BigInteger(mm.groupValues[1])
                val b = mm.groupValues[2].takeIf { it.isNotEmpty() }?.let(::BigInteger)
                if (b != null && b < a) return Result.None
                if (a >= big) continue
                out += ByteRange(a.toLong(), if (b == null || b >= big) size - 1 else b.toLong())
            }
        }
        return if (out.isEmpty()) Result.Unsatisfiable("bytes */$size") else Result.Ranges(out.toList())
    }

    /** Content-Range value "bytes start-end/size" for a 206 response. */
    fun contentRange(start: Long, end: Long, size: Long): String {
        require(start >= 0 && end >= start && end < size) { "need 0 <= start <= end < size" }
        return "bytes $start-$end/$size"
    }
}
