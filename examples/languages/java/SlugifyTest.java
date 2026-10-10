// SPDX-License-Identifier: Apache-2.0
// Vector rows are generated from the shared wave 8 vectors (vectors.json) used by all Genlib languages.
import java.util.HashSet;
import java.util.List;
import java.util.Set;

/** Wave 8 vectors (shared with every Genlib language) for slugify. */
public final class SlugifyTest {
    private static int passed;
    private static int failed;

    /** {text, separator, maxLength, expected}. */
    private static final String[][] CASES = {
        {"Hello, World!", "-", "0", "hello-world"},
        {"Cr\u00e8me br\u00fbl\u00e9e & Caf\u00e9", "-", "0", "creme-brulee-cafe"},
        {"Stra\u00dfe in \u0141\u00f3d\u017a", "-", "0", "strasse-in-lodz"},
        {"don't stop", "-", "0", "dont-stop"},
        {"don\u2019t stop", "-", "0", "dont-stop"},
        {"  --Already--slugged--  ", "-", "0", "already-slugged"},
        {"\u65e5\u672c\u8a9e title 2026", "-", "0", "title-2026"},
        {"\u00c6r\u00f8sk\u00f8bing \u0152UVRE", "-", "0", "aeroskobing-oeuvre"},
        {"Cre\u0300me bru\u0302le\u0301e", "-", "0", "creme-brulee"},
        {"\u00c0\u00c1\u00c2\u00c3\u00c4\u00c5 \u00e0\u00e1\u00e2\u00e3\u00e4\u00e5 \u00c7\u00e7 \u00d1\u00f1", "-", "0", "aaaaaa-aaaaaa-cc-nn"},
        {"\u0132ssel \u0140 \u0138 \u017f \u0149", "-", "0", "ijssel-l-q-s-n"},
        {"C# and C++", "-", "0", "c-and-c"},
        {"100% pure", "-", "0", "100-pure"},
        {"", "-", "0", ""},
        {"---", "-", "0", ""},
        {"a_b.c-d", "-", "0", "a-b-c-d"},
        {"Emoji \ud83d\ude00 test", "-", "0", "emoji-test"},
        {"\uff26\uff55\uff4c\uff4c width", "-", "0", "width"},
        {"\u01c5emal (outside the table)", "-", "0", "emal-outside-the-table"},
        {"\u00ff \u0178", "-", "0", "y-y"},
        {"MiXeD CaSe 42", "-", "0", "mixed-case-42"},
        {"Hello, World!", "_", "0", "hello_world"},
        {"Hello, World!", ".", "0", "hello.world"},
        {"Cr\u00e8me br\u00fbl\u00e9e & Caf\u00e9", "_", "0", "creme_brulee_cafe"},
        {"Cr\u00e8me br\u00fbl\u00e9e & Caf\u00e9", ".", "0", "creme.brulee.cafe"},
        {"Stra\u00dfe in \u0141\u00f3d\u017a", "_", "0", "strasse_in_lodz"},
        {"Stra\u00dfe in \u0141\u00f3d\u017a", ".", "0", "strasse.in.lodz"},
        {"don't stop", "_", "0", "dont_stop"},
        {"don't stop", ".", "0", "dont.stop"},
        {"The quick brown fox jumps", "-", "12", "the-quick"},
        {"The quick brown fox jumps", "-", "9", "the-quick"},
        {"The quick brown fox jumps", "-", "10", "the-quick"},
        {"Supercalifragilistic", "-", "5", "super"},
        {"ab cd", "-", "3", "ab"},
        {"ab cd", "-", "2", "ab"},
        {"ab cd", "-", "5", "ab-cd"},
        {"ab cd", "-", "100", "ab-cd"},
        {"a b", "-", "1", "a"}
    };

    /** {text, separator, maxLength}: each must throw. */
    private static final String[][] INVALID = {
        {"x", "/", "0"},
        {"x", "", "0"},
        {"x", "--", "0"},
        {"x", "-", "-1"}
    };

    /** {base, expected, taken...}. */
    private static final String[][] UNIQUE = {
        {"post", "post"},
        {"post", "post-2", "post"},
        {"post", "post-4", "post", "post-2", "post-3"},
        {"post", "post", "post-2"},
        {"a", "a-3", "a", "a-2", "a-4"}
    };

    /** {character, transliteration}: the shared U+00C0..U+017F table. */
    private static final String[][] TABLE = {
        {"\u00c0", "A"},
        {"\u00c1", "A"},
        {"\u00c2", "A"},
        {"\u00c3", "A"},
        {"\u00c4", "A"},
        {"\u00c5", "A"},
        {"\u00c6", "AE"},
        {"\u00c7", "C"},
        {"\u00c8", "E"},
        {"\u00c9", "E"},
        {"\u00ca", "E"},
        {"\u00cb", "E"},
        {"\u00cc", "I"},
        {"\u00cd", "I"},
        {"\u00ce", "I"},
        {"\u00cf", "I"},
        {"\u00d0", "D"},
        {"\u00d1", "N"},
        {"\u00d2", "O"},
        {"\u00d3", "O"},
        {"\u00d4", "O"},
        {"\u00d5", "O"},
        {"\u00d6", "O"},
        {"\u00d8", "O"},
        {"\u00d9", "U"},
        {"\u00da", "U"},
        {"\u00db", "U"},
        {"\u00dc", "U"},
        {"\u00dd", "Y"},
        {"\u00de", "TH"},
        {"\u00df", "ss"},
        {"\u00e0", "a"},
        {"\u00e1", "a"},
        {"\u00e2", "a"},
        {"\u00e3", "a"},
        {"\u00e4", "a"},
        {"\u00e5", "a"},
        {"\u00e6", "ae"},
        {"\u00e7", "c"},
        {"\u00e8", "e"},
        {"\u00e9", "e"},
        {"\u00ea", "e"},
        {"\u00eb", "e"},
        {"\u00ec", "i"},
        {"\u00ed", "i"},
        {"\u00ee", "i"},
        {"\u00ef", "i"},
        {"\u00f0", "d"},
        {"\u00f1", "n"},
        {"\u00f2", "o"},
        {"\u00f3", "o"},
        {"\u00f4", "o"},
        {"\u00f5", "o"},
        {"\u00f6", "o"},
        {"\u00f8", "o"},
        {"\u00f9", "u"},
        {"\u00fa", "u"},
        {"\u00fb", "u"},
        {"\u00fc", "u"},
        {"\u00fd", "y"},
        {"\u00fe", "th"},
        {"\u00ff", "y"},
        {"\u0100", "A"},
        {"\u0101", "a"},
        {"\u0102", "A"},
        {"\u0103", "a"},
        {"\u0104", "A"},
        {"\u0105", "a"},
        {"\u0106", "C"},
        {"\u0107", "c"},
        {"\u0108", "C"},
        {"\u0109", "c"},
        {"\u010a", "C"},
        {"\u010b", "c"},
        {"\u010c", "C"},
        {"\u010d", "c"},
        {"\u010e", "D"},
        {"\u010f", "d"},
        {"\u0110", "D"},
        {"\u0111", "d"},
        {"\u0112", "E"},
        {"\u0113", "e"},
        {"\u0114", "E"},
        {"\u0115", "e"},
        {"\u0116", "E"},
        {"\u0117", "e"},
        {"\u0118", "E"},
        {"\u0119", "e"},
        {"\u011a", "E"},
        {"\u011b", "e"},
        {"\u011c", "G"},
        {"\u011d", "g"},
        {"\u011e", "G"},
        {"\u011f", "g"},
        {"\u0120", "G"},
        {"\u0121", "g"},
        {"\u0122", "G"},
        {"\u0123", "g"},
        {"\u0124", "H"},
        {"\u0125", "h"},
        {"\u0126", "H"},
        {"\u0127", "h"},
        {"\u0128", "I"},
        {"\u0129", "i"},
        {"\u012a", "I"},
        {"\u012b", "i"},
        {"\u012c", "I"},
        {"\u012d", "i"},
        {"\u012e", "I"},
        {"\u012f", "i"},
        {"\u0130", "I"},
        {"\u0131", "i"},
        {"\u0132", "IJ"},
        {"\u0133", "ij"},
        {"\u0134", "J"},
        {"\u0135", "j"},
        {"\u0136", "K"},
        {"\u0137", "k"},
        {"\u0138", "q"},
        {"\u0139", "L"},
        {"\u013a", "l"},
        {"\u013b", "L"},
        {"\u013c", "l"},
        {"\u013d", "L"},
        {"\u013e", "l"},
        {"\u013f", "L"},
        {"\u0140", "l"},
        {"\u0141", "L"},
        {"\u0142", "l"},
        {"\u0143", "N"},
        {"\u0144", "n"},
        {"\u0145", "N"},
        {"\u0146", "n"},
        {"\u0147", "N"},
        {"\u0148", "n"},
        {"\u0149", "n"},
        {"\u014a", "N"},
        {"\u014b", "n"},
        {"\u014c", "O"},
        {"\u014d", "o"},
        {"\u014e", "O"},
        {"\u014f", "o"},
        {"\u0150", "O"},
        {"\u0151", "o"},
        {"\u0152", "OE"},
        {"\u0153", "oe"},
        {"\u0154", "R"},
        {"\u0155", "r"},
        {"\u0156", "R"},
        {"\u0157", "r"},
        {"\u0158", "R"},
        {"\u0159", "r"},
        {"\u015a", "S"},
        {"\u015b", "s"},
        {"\u015c", "S"},
        {"\u015d", "s"},
        {"\u015e", "S"},
        {"\u015f", "s"},
        {"\u0160", "S"},
        {"\u0161", "s"},
        {"\u0162", "T"},
        {"\u0163", "t"},
        {"\u0164", "T"},
        {"\u0165", "t"},
        {"\u0166", "T"},
        {"\u0167", "t"},
        {"\u0168", "U"},
        {"\u0169", "u"},
        {"\u016a", "U"},
        {"\u016b", "u"},
        {"\u016c", "U"},
        {"\u016d", "u"},
        {"\u016e", "U"},
        {"\u016f", "u"},
        {"\u0170", "U"},
        {"\u0171", "u"},
        {"\u0172", "U"},
        {"\u0173", "u"},
        {"\u0174", "W"},
        {"\u0175", "w"},
        {"\u0176", "Y"},
        {"\u0177", "y"},
        {"\u0178", "Y"},
        {"\u0179", "Z"},
        {"\u017a", "z"},
        {"\u017b", "Z"},
        {"\u017c", "z"},
        {"\u017d", "Z"},
        {"\u017e", "z"},
        {"\u017f", "s"}
    };

    private static void check(boolean ok, String name) {
        if (ok) passed++; else { failed++; System.err.println("FAIL: " + name); }
    }

    private static void eq(Object expected, Object actual, String name) {
        check(java.util.Objects.equals(expected, actual), name + " expected <" + expected + "> got <" + actual + ">");
    }

    private static void throwsIae(Runnable r, String name) {
        try { r.run(); check(false, name + " did not throw"); }
        catch (IllegalArgumentException e) { check(true, name); }
    }

    public static void main(String[] args) {
        for (int k = 0; k < CASES.length; k++) {
            String[] v = CASES[k];
            eq(v[3], Slugify.slugify(v[0], v[1], Integer.parseInt(v[2])), "case " + k);
        }
        for (int k = 0; k < INVALID.length; k++) {
            String[] v = INVALID[k];
            throwsIae(() -> Slugify.slugify(v[0], v[1], Integer.parseInt(v[2])), "invalid " + k);
        }
        for (int k = 0; k < UNIQUE.length; k++) {
            String[] v = UNIQUE[k];
            Set<String> taken = new HashSet<>(List.of(v).subList(2, v.length));
            eq(v[1], Slugify.uniqueSlug(v[0], taken), "unique " + k);
        }
        throwsIae(() -> Slugify.uniqueSlug("", Set.of()), "empty base");
        eq("post_2", Slugify.uniqueSlug("post", Set.of("post"), "_"), "unique with separator");
        eq(190, TABLE.length, "table size");
        for (String[] t : TABLE) eq(t[1].toLowerCase(java.util.Locale.ROOT), Slugify.slugify(t[0]), "table U+" + Integer.toHexString(t[0].charAt(0)));
        eq("hello-world", Slugify.slugify("Hello, World!"), "default separator");
        eq("hello_world", Slugify.slugify("Hello, World!", "_"), "two-argument form");

        System.out.println("SlugifyTest: " + passed + " passed, " + failed + " failed");
        if (failed > 0) System.exit(1);
    }
}
