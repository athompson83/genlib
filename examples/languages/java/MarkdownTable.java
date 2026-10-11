// SPDX-License-Identifier: Apache-2.0

import java.util.ArrayList;
import java.util.List;

/**
 * GitHub-flavored Markdown table rendering. Cells escape \ and | and turn CRLF/CR/LF into &lt;br&gt;; column width is
 * the longest escaped cell in code points (at least 3). Alignment per column is "left", "right", "center", or null
 * or "none" for no colon. Lines are joined with \n without a trailing newline. An empty header list, a row of the
 * wrong width or an unknown alignment throws IllegalArgumentException.
 */
public final class MarkdownTable {
    private MarkdownTable() {}

    private static String esc(String c) {
        return c.replace("\\", "\\\\").replace("|", "\\|").replace("\r\n", "<br>").replace("\r", "<br>").replace("\n", "<br>");
    }

    private static int len(String s) { return s.codePointCount(0, s.length()); }

    private static String pad(String s, int w, String a) {
        int gap = w - len(s);
        if ("right".equals(a)) return " ".repeat(gap) + s;
        if ("center".equals(a)) return " ".repeat(gap / 2) + s + " ".repeat(gap - gap / 2);
        return s + " ".repeat(gap);
    }

    private static String sep(int w, String a) {
        char[] d = "-".repeat(w).toCharArray();
        if ("left".equals(a) || "center".equals(a)) d[0] = ':';
        if ("right".equals(a) || "center".equals(a)) d[w - 1] = ':';
        return new String(d);
    }

    private static String line(List<String> cells) { return "| " + String.join(" | ", cells) + " |"; }

    /** Renders headers and rows as a Markdown table; align may be null (no alignment) or one entry per column. */
    public static String markdownTable(List<String> headers, List<List<String>> rows, List<String> align) {
        if (headers.isEmpty()) throw new IllegalArgumentException("headers");
        int n = headers.size();
        List<String> al = new ArrayList<>();
        if (align == null) for (int i = 0; i < n; i++) al.add(null);
        else {
            if (align.size() != n) throw new IllegalArgumentException("align");
            for (String a : align) {
                if (a == null || a.equals("none")) al.add(null);
                else if (a.equals("left") || a.equals("right") || a.equals("center")) al.add(a);
                else throw new IllegalArgumentException("align");
            }
        }
        for (List<String> r : rows) if (r.size() != n) throw new IllegalArgumentException("row width");
        List<List<String>> cells = new ArrayList<>();
        List<String> h = new ArrayList<>();
        for (String c : headers) h.add(esc(c));
        cells.add(h);
        for (List<String> r : rows) {
            List<String> e = new ArrayList<>();
            for (String c : r) e.add(esc(c));
            cells.add(e);
        }
        int[] widths = new int[n];
        for (int i = 0; i < n; i++) {
            widths[i] = 3;
            for (List<String> r : cells) widths[i] = Math.max(widths[i], len(r.get(i)));
        }
        List<String> out = new ArrayList<>();
        List<String> seps = new ArrayList<>();
        for (int i = 0; i < n; i++) seps.add(sep(widths[i], al.get(i)));
        for (int r = 0; r < cells.size(); r++) {
            List<String> padded = new ArrayList<>();
            for (int i = 0; i < n; i++) padded.add(pad(cells.get(r).get(i), widths[i], al.get(i)));
            out.add(line(padded));
            if (r == 0) out.add(line(seps));
        }
        return String.join("\n", out);
    }

    /** markdownTable without alignment. */
    public static String markdownTable(List<String> headers, List<List<String>> rows) { return markdownTable(headers, rows, null); }
}
