// SPDX-License-Identifier: Apache-2.0

import java.util.ArrayList;
import java.util.List;

/**
 * Plain-text wrapping and truncation counted in code points. wrapText keeps input line breaks (CRLF and CR become LF),
 * fills lines greedily on runs of spaces/tabs and breaks words longer than the width. truncateText cuts at a late
 * space when one exists and appends the ellipsis. Bad widths throw IllegalArgumentException.
 */
public final class TextWrap {
    private TextWrap() {}

    private static int len(String s) { return s.codePointCount(0, s.length()); }

    private static String head(String s, int n) { return s.substring(0, s.offsetByCodePoints(0, n)); }

    /** Wraps text to at most width code points per line (width >= 1), joining lines with \n. */
    public static String wrapText(String text, int width) {
        if (width < 1) throw new IllegalArgumentException("width");
        List<String> out = new ArrayList<>();
        for (String line : text.replace("\r\n", "\n").replace('\r', '\n').split("\n", -1)) {
            String cur = "";
            for (String w : line.split("[ \t]+", -1)) {
                if (w.isEmpty()) continue;
                while (len(w) > width) {
                    if (!cur.isEmpty()) { out.add(cur); cur = ""; }
                    out.add(head(w, width));
                    w = w.substring(head(w, width).length());
                }
                if (w.isEmpty()) continue;
                if (cur.isEmpty()) cur = w;
                else if (len(cur) + 1 + len(w) <= width) cur += " " + w;
                else { out.add(cur); cur = w; }
            }
            out.add(cur);
        }
        return String.join("\n", out);
    }

    /** Text unchanged when it fits maxLen code points, else cut (preferring a late space) plus the ellipsis. */
    public static String truncateText(String text, int maxLen, String ellipsis) {
        if (len(text) <= maxLen) return text;
        int keep = maxLen - len(ellipsis);
        if (maxLen < 1 || keep < 0) throw new IllegalArgumentException("max_len");
        String cut = head(text, keep);
        int sp = cut.lastIndexOf(' ');
        if (sp > 0 && len(cut.substring(0, sp)) >= keep / 2) cut = cut.substring(0, sp);
        int e = cut.length();
        while (e > 0 && cut.charAt(e - 1) == ' ') e--;
        return cut.substring(0, e) + ellipsis;
    }

    /** truncateText with the "…" ellipsis. */
    public static String truncateText(String text, int maxLen) { return truncateText(text, maxLen, "…"); }
}
