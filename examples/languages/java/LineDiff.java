// SPDX-License-Identifier: Apache-2.0
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;

/**
 * Deterministic LCS line diff and unified output: a valid unified diff (patch reproduces the new text);
 * same format as GNU diff -u, which may pick a different alignment of equal size.
 */
public final class LineDiff {
    private static final long MAX_CELLS = 4_000_000L;

    private LineDiff() {}

    /** One diff operation: kind is "=", "-" or "+". */
    public record Op(String kind, String line) {}

    /** A line without its LF; noEol marks the last line of a text that does not end in LF, so it only matches another such line. */
    private record Line(String text, boolean noEol) {}

    private record LineOp(String kind, Line line) {}

    private static List<Line> split(String t) {
        List<Line> out = new ArrayList<>();
        if (t.isEmpty()) return out;
        boolean nl = t.endsWith("\n");
        List<String> parts = new ArrayList<>(Arrays.asList(t.split("\n", -1)));
        if (nl) parts.remove(parts.size() - 1);
        for (int k = 0; k < parts.size(); k++) out.add(new Line(parts.get(k), !nl && k == parts.size() - 1));
        return out;
    }

    private static List<LineOp> ops(List<Line> a, List<Line> b) {
        int n = a.size();
        int m = b.size();
        if ((long) n * m > MAX_CELLS) throw new IllegalArgumentException("inputs too large to diff (lines(a) * lines(b) > 4,000,000)");
        int[][] l = new int[n + 1][m + 1];
        for (int i = n - 1; i >= 0; i--) {
            for (int j = m - 1; j >= 0; j--) {
                l[i][j] = a.get(i).equals(b.get(j)) ? l[i + 1][j + 1] + 1 : Math.max(l[i + 1][j], l[i][j + 1]);
            }
        }
        List<LineOp> out = new ArrayList<>();
        int i = 0;
        int j = 0;
        while (i < n || j < m) {
            if (i < n && j < m && a.get(i).equals(b.get(j))) { out.add(new LineOp("=", a.get(i))); i++; j++; }
            else if (j >= m || (i < n && l[i + 1][j] >= l[i][j + 1])) { out.add(new LineOp("-", a.get(i))); i++; }
            else { out.add(new LineOp("+", b.get(j))); j++; }
        }
        return out;
    }

    /** Line operations turning a into b; throws IllegalArgumentException when lines(a) * lines(b) > 4,000,000. */
    public static List<Op> diffLines(String a, String b) {
        List<Op> out = new ArrayList<>();
        for (LineOp op : ops(split(a), split(b))) out.add(new Op(op.kind(), op.line().text()));
        return out;
    }

    public static String unifiedDiff(String a, String b) { return unifiedDiff(a, b, "a", "b", 3); }

    /** Valid unified diff (patch reproduces the new text), or "" when the texts are equal. */
    public static String unifiedDiff(String aText, String bText, String fromName, String toName, int context) {
        if (context < 0) throw new IllegalArgumentException("context must be non-negative");
        List<LineOp> rows = ops(split(aText), split(bText));
        List<Integer> changes = new ArrayList<>();
        for (int k = 0; k < rows.size(); k++) if (!rows.get(k).kind().equals("=")) changes.add(k);
        if (changes.isEmpty()) return "";
        List<int[]> hunks = new ArrayList<>();
        int start = changes.get(0);
        int end = start;
        for (int c = 1; c < changes.size(); c++) {
            int k = changes.get(c);
            if (k - end - 1 <= 2 * context) end = k;
            else { hunks.add(new int[] {start, end}); start = k; end = k; }
        }
        hunks.add(new int[] {start, end});
        StringBuilder out = new StringBuilder("--- " + fromName + "\n+++ " + toName + "\n");
        for (int[] h : hunks) {
            int s = Math.max(0, h[0] - context);
            int e = Math.min(rows.size() - 1, h[1] + context);
            List<LineOp> seg = rows.subList(s, e + 1);
            int aBefore = 0;
            int bBefore = 0;
            for (LineOp r : rows.subList(0, s)) { if (!r.kind().equals("+")) aBefore++; if (!r.kind().equals("-")) bBefore++; }
            int aCount = 0;
            int bCount = 0;
            for (LineOp r : seg) { if (!r.kind().equals("+")) aCount++; if (!r.kind().equals("-")) bCount++; }
            out.append("@@ -").append(range(aCount, aBefore)).append(" +").append(range(bCount, bBefore)).append(" @@\n");
            for (LineOp r : seg) {
                out.append(r.kind().equals("=") ? " " : r.kind()).append(r.line().text()).append('\n');
                if (r.line().noEol()) out.append("\\ No newline at end of file\n");
            }
        }
        return out.toString();
    }

    private static String range(int count, int before) {
        if (count == 0) return before + ",0";
        return count == 1 ? String.valueOf(before + 1) : (before + 1) + "," + count;
    }
}
