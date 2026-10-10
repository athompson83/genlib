// SPDX-License-Identifier: Apache-2.0
using System.Text;

namespace Genlib.Validation;

/// <summary>
/// URL slugs ("Crème brûlée &amp; Café" -> "creme-brulee-cafe") with a fixed transliteration table for U+00C0..U+017F, so
/// every language gives identical results without a Unicode database. Other non-ASCII characters end a word.
/// </summary>
public static class Slugify {
    // Transliteration of U+00C0..U+017F in order, comma separated; an empty entry (U+00D7, U+00F7) keeps the character.
    private const string TableSource =
        "A,A,A,A,A,A,AE,C,E,E,E,E,I,I,I,I,D,N,O,O,O,O,O,,O,U,U,U,U,Y,TH,ss,a,a,a,a,a,a,ae,c,e,e,e,e,i,i,i,i,d,n,o,o,o,o,o,,o,u,u,u,u,y,th,y," +
        "A,a,A,a,A,a,C,c,C,c,C,c,C,c,D,d,D,d,E,e,E,e,E,e,E,e,E,e,G,g,G,g,G,g,G,g,H,h,H,h,I,i,I,i,I,i,I,i,I,i,IJ,ij,J,j,K,k,q,L,l,L,l,L,l,L,l,L,l," +
        "N,n,N,n,N,n,n,N,n,O,o,O,o,O,o,OE,oe,R,r,R,r,R,r,S,s,S,s,S,s,S,s,T,t,T,t,T,t,U,u,U,u,U,u,U,u,U,u,U,u,W,w,Y,y,Y,Z,z,Z,z,Z,z,s";
    private static readonly string[] Table = TableSource.Split(',');

    /// <summary>
    /// Lowercase ASCII words joined by <paramref name="separator"/> ("-", "_" or "."). Apostrophes (U+0027, U+2019) and combining
    /// marks (U+0300..U+036F) do not break a word. When <paramref name="maxLength"/> &gt; 0 the slug is cut at a word boundary
    /// where possible (a single long word is cut inside). Throws <see cref="ArgumentException"/> for a bad separator or a
    /// negative maxLength.
    /// </summary>
    public static string Slug(string text, string separator = "-", int maxLength = 0) {
        ArgumentNullException.ThrowIfNull(text);
        if (separator is not ("-" or "_" or ".")) throw new ArgumentException("separator must be \"-\", \"_\" or \".\"", nameof(separator));
        if (maxLength < 0) throw new ArgumentOutOfRangeException(nameof(maxLength), "maxLength must not be negative");
        var words = new List<string>();
        var cur = new StringBuilder();
        void Feed(int cp) {
            if (cp >= 'A' && cp <= 'Z') cur.Append((char)(cp + 32));
            else if ((cp >= 'a' && cp <= 'z') || (cp >= '0' && cp <= '9')) cur.Append((char)cp);
            else if (cp == '\'' || cp == 0x2019 || (cp >= 0x300 && cp <= 0x36F)) return;
            else if (cur.Length > 0) { words.Add(cur.ToString()); cur.Clear(); }
        }
        foreach (var rune in text.EnumerateRunes()) {
            int cp = rune.Value;
            string mapped = cp >= 0xC0 && cp <= 0x17F ? Table[cp - 0xC0] : "";
            if (mapped.Length == 0) Feed(cp);
            else foreach (char ch in mapped) Feed(ch);
        }
        if (cur.Length > 0) words.Add(cur.ToString());
        string slug = string.Join(separator, words);
        if (maxLength > 0 && slug.Length > maxLength) {
            string cut = slug[..maxLength];
            if (slug[maxLength] != separator[0] && cut.Contains(separator[0])) cut = cut[..cut.LastIndexOf(separator[0])];
            slug = cut.TrimEnd(separator[0]);
        }
        return slug;
    }

    /// <summary>
    /// <paramref name="baseSlug"/> when it is not taken, else the first free of base-2, base-3, ... (joined with
    /// <paramref name="separator"/>). Throws <see cref="ArgumentException"/> for an empty base.
    /// </summary>
    public static string UniqueSlug(string baseSlug, IReadOnlySet<string> taken, string separator = "-") {
        if (string.IsNullOrEmpty(baseSlug)) throw new ArgumentException("empty base", nameof(baseSlug));
        ArgumentNullException.ThrowIfNull(taken);
        if (!taken.Contains(baseSlug)) return baseSlug;
        int n = 2;
        while (taken.Contains(baseSlug + separator + n)) n++;
        return baseSlug + separator + n;
    }
}
