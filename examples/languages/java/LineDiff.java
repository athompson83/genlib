// SPDX-License-Identifier: Apache-2.0
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;

/** Deterministic LCS line diff and GNU diff -u compatible unified output. */
public final class LineDiff {
    private static final long MAX_CELLS = 4_000_000L;

    private LineDiff() {}

    /** One diff operation: kind is "=", "-" or "+". */
    public record Op(String kind, String line) {}

    private record Lines(List<String> lines, boolean finalNewline) {}

    private record Row(String kind, String line, int a, int b) {}

    private static Lines split(String t) {
        if (t.isEmpty()) return new Lines(List.of(), true);
        boolean nl = t.endsWith("\n");
        List<String> lines = new ArrayList<>(Arrays.asList(t.split("\n", -1)));
        if (nl) lines.remove(lines.size() - 1);
        return new Lines(lines, nl);
    }

    private static List<Op> ops(List<String> a, List<String> b) {
        int n = a.size();
        int m = b.size();
        if ((long) n * m > MAX_CELLS) throw new IllegalArgumentException("inputs too large to diff (lines(a) * lines(b) > 4,000,000)");
        int[][] l = new int[n + 1][m + 1];
        for (int i = n - 1; i >= 0; i--) {
            for (int j = m - 1; j >= 0; j--) {
                l[i][j] = a.get(i).equals(b.get(j)) ? l[i + 1][j + 1] + 1 : Math.max(l[i + 1][j], l[i][j + 1]);
            }
        }
        List<Op> out = new ArrayList<>();
        int i = 0;
        int j = 0;
        while (i < n || j < m) {
            if (i < n && j < m && a.get(i).equals(b.get(j))) { out.add(new Op("=", a.get(i))); i++; j++; }
            else if (j >= m || (i < n && l[i + 1][j] >= l[i][j + 1])) { out.add(new Op("-", a.get(i))); i++; }
            else { out.add(new Op("+", b.get(j))); j++; }
        }
        return out;
    }

    /** Line operations turning a into b; throws IllegalArgumentException when lines(a) * lines(b) > 4,000,000. */
    public static List<Op> diffLines(String a, String b) {
        return ops(split(a).lines(), split(b).lines());
    }

    public static String unifiedDiff(String a, String b) { return unifiedDiff(a, b, "a", "b", 3); }

    /** GNU-style unified diff, or "" when the texts are equal. */
    public static String unifiedDiff(String aText, String bText, String fromName, String toName, int context) {
        if (context < 0) throw new IllegalArgumentException("context must be non-negative");
        Lines la = split(aText);
        Lines lb = split(bText);
        List<String> a = la.lines();
        List<String> b = lb.lines();
        List<Row> rows = new ArrayList<>();
        int ai = 0;
        int bi = 0;
        for (Op op : ops(a, b)) {
            switch (op.kind()) {
                case "=" -> rows.add(new Row("=", op.line(), ai++, bi++));
                case "-" -> rows.add(new Row("-", op.line(), ai++, -1));
                default -> rows.add(new Row("+", op.line(), -1, bi++));
            }
        }
        if (la.finalNewline() != lb.finalNewline() && !rows.isEmpty()) {
            Row last = rows.get(rows.size() - 1);
            if (last.kind().equals("=") && last.a() == a.size() - 1 && last.b() == b.size() - 1) {
                rows.remove(rows.size() - 1);
                rows.add(new Row("-", last.line(), last.a(), -1));
                rows.add(new Row("+", last.line(), -1, last.b()));
            }
        }
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
            List<Row> seg = rows.subList(s, e + 1);
            int aBefore = 0;
            int bBefore = 0;
            for (Row r : rows.subList(0, s)) { if (!r.kind().equals("+")) aBefore++; if (!r.kind().equals("-")) bBefore++; }
            int aCount = 0;
            int bCount = 0;
            int aFirst = -1;
            int bFirst = -1;
            for (Row r : seg) {
                if (!r.kind().equals("+")) { if (aCount++ == 0) aFirst = r.a(); }
                if (!r.kind().equals("-")) { if (bCount++ == 0) bFirst = r.b(); }
            }
            out.append("@@ -").append(range(aCount, aFirst, aBefore)).append(" +").append(range(bCount, bFirst, bBefore)).append(" @@\n");
            for (Row r : seg) {
                out.append(r.kind().equals("=") ? " " : r.kind()).append(r.line()).append('\n');
                boolean aSide = !r.kind().equals("+");
                if (aSide && r.a() == a.size() - 1 && !la.finalNewline() && (r.kind().equals("-") || la.finalNewline() == lb.finalNewline())) {
                    out.append("\\ No newline at end of file\n");
                } else if (r.kind().equals("+") && r.b() == b.size() - 1 && !lb.finalNewline()) {
                    out.append("\\ No newline at end of file\n");
                }
            }
        }
        return out.toString();
    }

    private static String range(int count, int first, int before) {
        if (count == 0) return before + ",0";
        return count == 1 ? String.valueOf(first + 1) : (first + 1) + "," + count;
    }
}
