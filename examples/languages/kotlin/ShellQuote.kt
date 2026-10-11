// SPDX-License-Identifier: Apache-2.0

/**
 * POSIX shell quoting and splitting without any expansion ($, *, ~ stay literal). shellQuote leaves safe words
 * unchanged and otherwise single-quotes, writing ' as '\''. shellSplit handles single quotes, double quotes (backslash
 * escapes only $ ` " \ and newline), backslash escapes and '#' comments at the start of a word. An unterminated quote
 * or a trailing backslash throws IllegalArgumentException.
 */
object ShellQuote {
    private val SAFE = Regex("[A-Za-z0-9@%+=:,./_-]+")

    /** Quotes one argument for a POSIX shell ('' for the empty string). */
    fun shellQuote(arg: String): String = when {
        arg.isEmpty() -> "''"
        SAFE.matches(arg) -> arg
        else -> "'" + arg.replace("'", "'\\''") + "'"
    }

    /** Quotes each argument and joins them with single spaces. */
    fun shellJoin(args: List<String>): String = args.joinToString(" ") { shellQuote(it) }

    /** Splits a command line into words like a POSIX shell, without expansion. */
    fun shellSplit(line: String): List<String> {
        val words = ArrayList<String>()
        var cur: StringBuilder? = null
        var i = 0
        val n = line.length
        while (i < n) {
            val c = line[i]
            if (c == ' ' || c == '\t' || c == '\n') {
                if (cur != null) { words.add(cur.toString()); cur = null }
                i++
                continue
            }
            if (c == '#' && cur == null) {
                val j = line.indexOf('\n', i)
                i = if (j < 0) n else j
                continue
            }
            val word = cur ?: StringBuilder().also { cur = it }
            when (c) {
                '\'' -> {
                    val j = line.indexOf('\'', i + 1)
                    require(j >= 0) { "unterminated single quote" }
                    word.append(line, i + 1, j)
                    i = j + 1
                }
                '"' -> {
                    i++
                    while (true) {
                        require(i < n) { "unterminated double quote" }
                        val d = line[i]
                        if (d == '"') { i++; break }
                        if (d == '\\' && i + 1 < n && line[i + 1] in "$`\"\\\n") {
                            if (line[i + 1] != '\n') word.append(line[i + 1])
                            i += 2
                            continue
                        }
                        word.append(d)
                        i++
                    }
                }
                '\\' -> {
                    require(i + 1 < n) { "trailing backslash" }
                    if (line[i + 1] != '\n') word.append(line[i + 1]) else if (word.isEmpty()) cur = null
                    i += 2
                }
                else -> { word.append(c); i++ }
            }
        }
        cur?.let { words.add(it.toString()) }
        return words
    }
}
