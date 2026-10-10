// SPDX-License-Identifier: Apache-2.0
import java.util.Set;

/**
 * URL slugs: ASCII lowercase words joined by "-", "_" or ".". Latin-1 Supplement and Latin Extended-A
 * letters (U+00C0..U+017F) are transliterated by a fixed table shared by every Genlib language, so the
 * output does not depend on a Unicode database; other non-ASCII characters separate words.
 */
public final class Slugify {
    /** Transliterations for U+00C0..U+017F in order; an empty entry (U+00D7, U+00F7) means no mapping. */
    private static final String[] TABLE = ("A,A,A,A,A,A,AE,C,E,E,E,E,I,I,I,I,D,N,O,O,O,O,O,,O,U,U,U,U,Y,TH,ss,"
        + "a,a,a,a,a,a,ae,c,e,e,e,e,i,i,i,i,d,n,o,o,o,o,o,,o,u,u,u,u,y,th,y,"
        + "A,a,A,a,A,a,C,c,C,c,C,c,C,c,D,d,D,d,E,e,E,e,E,e,E,e,E,e,G,g,G,g,G,g,G,g,H,h,H,h,"
        + "I,i,I,i,I,i,I,i,I,i,IJ,ij,J,j,K,k,q,L,l,L,l,L,l,L,l,L,l,N,n,N,n,N,n,n,N,n,O,o,O,o,O,o,OE,oe,"
        + "R,r,R,r,R,r,S,s,S,s,S,s,S,s,T,t,T,t,T,t,U,u,U,u,U,u,U,u,U,u,U,u,W,w,Y,y,Y,Z,z,Z,z,Z,z,s").split(",", -1);

    private Slugify() {}

    public static String slugify(String text) { return slugify(text, "-", 0); }

    public static String slugify(String text, String separator) { return slugify(text, separator, 0); }

    /**
     * Slug of text. maxLength 0 means no limit; a longer slug is cut back to a word boundary when one
     * fits. Throws IllegalArgumentException for a separator other than "-", "_" or "." or a negative maxLength.
     */
    public static String slugify(String text, String separator, int maxLength) {
        if (!"-".equals(separator) && !"_".equals(separator) && !".".equals(separator)) {
            throw new IllegalArgumentException("separator must be \"-\", \"_\" or \".\"");
        }
        if (maxLength < 0) throw new IllegalArgumentException("maxLength must be non-negative");
        StringBuilder slug = new StringBuilder();
        StringBuilder cur = new StringBuilder();
        int[] cps = text.codePoints().toArray();
        for (int cp : cps) {
            String mapped = cp >= 0xC0 && cp <= 0x17F && !TABLE[cp - 0xC0].isEmpty() ? TABLE[cp - 0xC0] : new String(Character.toChars(cp));
            for (int k = 0; k < mapped.length(); k++) {
                char ch = mapped.charAt(k);
                char lo = ch >= 'A' && ch <= 'Z' ? (char) (ch + 32) : ch;
                if ((lo >= 'a' && lo <= 'z') || (lo >= '0' && lo <= '9')) cur.append(lo);
                else if (ch == '\'' || ch == '’' || (ch >= '̀' && ch <= 'ͯ')) continue;
                else if (cur.length() > 0) { flush(slug, cur, separator); }
            }
        }
        if (cur.length() > 0) flush(slug, cur, separator);
        String s = slug.toString();
        if (maxLength > 0 && s.length() > maxLength) {
            String cut = s.substring(0, maxLength);
            if (!s.substring(maxLength, maxLength + 1).equals(separator) && cut.contains(separator)) cut = cut.substring(0, cut.lastIndexOf(separator));
            while (cut.endsWith(separator)) cut = cut.substring(0, cut.length() - 1);
            s = cut;
        }
        return s;
    }

    private static void flush(StringBuilder slug, StringBuilder cur, String separator) {
        if (slug.length() > 0) slug.append(separator);
        slug.append(cur);
        cur.setLength(0);
    }

    public static String uniqueSlug(String base, Set<String> taken) { return uniqueSlug(base, taken, "-"); }

    /** base, or base-2, base-3, ...: the first not in taken. Throws IllegalArgumentException for an empty base. */
    public static String uniqueSlug(String base, Set<String> taken, String separator) {
        if (base == null || base.isEmpty()) throw new IllegalArgumentException("empty base");
        if (!taken.contains(base)) return base;
        int n = 2;
        while (taken.contains(base + separator + n)) n++;
        return base + separator + n;
    }
}
