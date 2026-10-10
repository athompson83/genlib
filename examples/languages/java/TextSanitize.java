// SPDX-License-Identifier: Apache-2.0
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Set;

/**
 * Removes control, bidirectional and invisible characters from user text (Trojan Source, CVE-2021-42574), keeps
 * ZWNJ/ZWJ (U+200C/U+200D) for emoji sequences and Indic/Persian text, and normalizes whitespace.
 */
public final class TextSanitize {
    private static final Set<Integer> BIDI = Set.of(0x061C, 0x200E, 0x200F, 0x202A, 0x202B, 0x202C, 0x202D, 0x202E, 0x2066, 0x2067, 0x2068, 0x2069);
    private static final Set<Integer> INVISIBLE = Set.of(0x200B, 0x2060, 0xFEFF);

    private TextSanitize() {}

    /** A bidirectional control at a code point index, with its uppercase hex code (e.g. "202E"). */
    public record BidiControl(int index, String hex) {}

    /** Sanitize options. Build with the fluent setters; maxLength is in code points (null = no limit). */
    public static final class Options {
        boolean allowNewlines = true;
        Integer maxLength;

        public Options allowNewlines(boolean v) { allowNewlines = v; return this; }
        public Options maxLength(int v) { maxLength = v; return this; }
    }

    private static boolean isControl(int cp) { return cp < 0x20 || (cp >= 0x7f && cp <= 0x9f); }

    public static String sanitizeText(String text) { return sanitizeText(text, new Options()); }

    /** CRLF/CR to LF, keep LF (or a space) and TAB, drop other controls, bidi controls and invisible characters, then truncate. */
    public static String sanitizeText(String text, Options o) {
        if (o.maxLength != null && o.maxLength < 0) throw new IllegalArgumentException("maxLength must be non-negative");
        String t = text.replace("\r\n", "\n").replace('\r', '\n');
        StringBuilder out = new StringBuilder();
        int kept = 0;
        for (int i = 0; i < t.length(); ) {
            int cp = t.codePointAt(i);
            i += Character.charCount(cp);
            if (o.maxLength != null && kept >= o.maxLength) break;
            if (cp == '\n') out.append(o.allowNewlines ? '\n' : ' ');
            else if (cp == '\t') out.append('\t');
            else if (isControl(cp) || BIDI.contains(cp) || INVISIBLE.contains(cp)) continue;
            else out.appendCodePoint(cp);
            kept++;
        }
        return out.toString();
    }

    /** Bidirectional controls with their code point indexes; non-empty means the text can display differently from its logic. */
    public static List<BidiControl> findBidiControls(String text) {
        List<BidiControl> out = new ArrayList<>();
        int index = 0;
        for (int i = 0; i < text.length(); ) {
            int cp = text.codePointAt(i);
            if (BIDI.contains(cp)) out.add(new BidiControl(index, String.format(Locale.ROOT, "%04X", cp)));
            i += Character.charCount(cp);
            index++;
        }
        return out;
    }

    /** Collapses runs of space, tab, LF, CR, FF and VT into one space and trims leading/trailing spaces. */
    public static String normalizeWhitespace(String text) {
        String s = text.replaceAll("[ \\t\\n\\r\\f\\x0B]+", " ");
        int b = 0;
        int e = s.length();
        while (b < e && s.charAt(b) == ' ') b++;
        while (e > b && s.charAt(e - 1) == ' ') e--;
        return s.substring(b, e);
    }
}
