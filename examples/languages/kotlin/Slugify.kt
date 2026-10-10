// SPDX-License-Identifier: Apache-2.0

/**
 * URL slugs: ASCII lowercase words joined by "-", "_" or ".". Latin-1 Supplement and Latin Extended-A
 * letters (U+00C0..U+017F) are transliterated by a fixed table shared by every Genlib language, so the
 * output does not depend on a Unicode database; other non-ASCII characters separate words.
 */
object Slugify {
    /** Transliterations for U+00C0..U+017F in order; an empty entry (U+00D7, U+00F7) means no mapping. */
    private val TABLE = ("A,A,A,A,A,A,AE,C,E,E,E,E,I,I,I,I,D,N,O,O,O,O,O,,O,U,U,U,U,Y,TH,ss," +
        "a,a,a,a,a,a,ae,c,e,e,e,e,i,i,i,i,d,n,o,o,o,o,o,,o,u,u,u,u,y,th,y," +
        "A,a,A,a,A,a,C,c,C,c,C,c,C,c,D,d,D,d,E,e,E,e,E,e,E,e,E,e,G,g,G,g,G,g,G,g,H,h,H,h," +
        "I,i,I,i,I,i,I,i,I,i,IJ,ij,J,j,K,k,q,L,l,L,l,L,l,L,l,L,l,N,n,N,n,N,n,n,N,n,O,o,O,o,O,o,OE,oe," +
        "R,r,R,r,R,r,S,s,S,s,S,s,S,s,T,t,T,t,T,t,U,u,U,u,U,u,U,u,U,u,U,u,W,w,Y,y,Y,Z,z,Z,z,Z,z,s").split(",")

    /**
     * Slug of [text]. [maxLength] 0 means no limit; a longer slug is cut back to a word boundary when one
     * fits. Throws IllegalArgumentException for a separator other than "-", "_" or "." or a negative maxLength.
     */
    fun slugify(text: String, separator: String = "-", maxLength: Int = 0): String {
        require(separator == "-" || separator == "_" || separator == ".") { "separator must be \"-\", \"_\" or \".\"" }
        require(maxLength >= 0) { "maxLength must be non-negative" }
        val words = mutableListOf<String>()
        val cur = StringBuilder()
        for (cp in text.codePoints().toArray()) {
            val mapped = if (cp in 0xC0..0x17F && TABLE[cp - 0xC0].isNotEmpty()) TABLE[cp - 0xC0] else String(Character.toChars(cp))
            for (ch in mapped) {
                val lo = if (ch in 'A'..'Z') ch + 32 else ch
                if (lo in 'a'..'z' || lo in '0'..'9') cur.append(lo)
                else if (ch == '\'' || ch == '’' || ch in '̀'..'ͯ') continue
                else if (cur.isNotEmpty()) { words += cur.toString(); cur.setLength(0) }
            }
        }
        if (cur.isNotEmpty()) words += cur.toString()
        var slug = words.joinToString(separator)
        if (maxLength > 0 && slug.length > maxLength) {
            var cut = slug.substring(0, maxLength)
            if (slug.substring(maxLength, maxLength + 1) != separator && cut.contains(separator)) cut = cut.substring(0, cut.lastIndexOf(separator))
            slug = cut.trimEnd(separator[0])
        }
        return slug
    }

    /** [base], or base-2, base-3, ...: the first not in [taken]. Throws IllegalArgumentException for an empty base. */
    fun uniqueSlug(base: String, taken: Set<String>, separator: String = "-"): String {
        require(base.isNotEmpty()) { "empty base" }
        if (base !in taken) return base
        var n = 2
        while ("$base$separator$n" in taken) n++
        return "$base$separator$n"
    }
}
