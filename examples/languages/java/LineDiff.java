// SPDX-License-Identifier: Apache-2.0
import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * Line diff and unified output. The result is a valid unified diff (patch reproduces the new text) and
 * minimal (a shortest edit script). It is usually equal to GNU diff -u (about 95% of small random
 * inputs) but that is not guaranteed. Lines that occur nowhere in the other text are removed first, then
 * Myers' linear-space middle-snake recursion runs in O((N+M)·D) time and O(N+M) memory, and changes are
 * slid down and aligned next to the other file's changes. Inputs above 1,000,000 lines in total throw.
 */
public final class LineDiff {
    private static final int MAX_LINES = 1_000_000;

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

    /** Returns {x, y, u, v}: a middle snake from (x, y) to (u, v) of the box a[a0:a1] x b[b0:b1]. */
    private static int[] middleSnake(int[] a, int[] b, int a0, int a1, int b0, int b1) {
        int n = a1 - a0;
        int m = b1 - b0;
        int delta = n - m;
        boolean odd = (delta & 1) != 0;
        int off = n + m + 1;
        int[] vf = new int[2 * off + 1];
        int[] vb = new int[2 * off + 1];
        for (int d = 0; d <= (n + m + 1) / 2; d++) {
            for (int k = -d; k <= d; k += 2) {
                int x = (k == -d || (k != d && vf[off + k - 1] < vf[off + k + 1])) ? vf[off + k + 1] : vf[off + k - 1] + 1;
                int y = x - k;
                int sx = x;
                int sy = y;
                while (x < n && y < m && a[a0 + x] == b[b0 + y]) { x++; y++; }
                vf[off + k] = x;
                if (odd && delta - (d - 1) <= k && k <= delta + (d - 1) && x + vb[off + delta - k] >= n) {
                    return new int[] {a0 + sx, b0 + sy, a0 + x, b0 + y};
                }
            }
            for (int k = -d; k <= d; k += 2) {
                int x = (k == -d || (k != d && vb[off + k - 1] < vb[off + k + 1])) ? vb[off + k + 1] : vb[off + k - 1] + 1;
                int y = x - k;
                int sx = x;
                int sy = y;
                while (x < n && y < m && a[a1 - 1 - x] == b[b1 - 1 - y]) { x++; y++; }
                vb[off + k] = x;
                if (!odd && -d <= delta - k && delta - k <= d && x + vf[off + delta - k] >= n) {
                    return new int[] {a1 - x, b1 - y, a1 - sx, b1 - sy};
                }
            }
        }
        throw new IllegalStateException("no middle snake");
    }

    private static void compare(int[] a, int[] b, int a0, int a1, int b0, int b1, boolean[] ca, boolean[] cb) {
        while (a0 < a1 && b0 < b1 && a[a0] == b[b0]) { a0++; b0++; }
        while (a1 > a0 && b1 > b0 && a[a1 - 1] == b[b1 - 1]) { a1--; b1--; }
        if (a0 == a1) { for (int j = b0; j < b1; j++) cb[j] = true; return; }
        if (b0 == b1) { for (int i = a0; i < a1; i++) ca[i] = true; return; }
        int[] s = middleSnake(a, b, a0, a1, b0, b1);
        compare(a, b, a0, s[0], b0, s[1], ca, cb);
        compare(a, b, s[2], a1, s[3], b1, ca, cb);
    }

    /** Moves each run of changed lines down while the line after it equals its first line. */
    private static void slide(int[] lines, boolean[] changed) {
        int i = 0;
        int n = lines.length;
        while (i < n) {
            if (!changed[i]) { i++; continue; }
            int j = i;
            while (j < n && changed[j]) j++;
            while (j < n && lines[i] == lines[j]) {
                changed[i] = false;
                changed[j] = true;
                i++;
                j++;
                while (j < n && changed[j]) j++;
            }
            i = j;
        }
    }

    /**
     * One bottom-up pass: slides a run of changed x lines up through equal lines when that places it
     * next to changed lines of the other file, so a hunk shows a replacement instead of a deletion and
     * an insertion apart.
     */
    private static void align(int[] x, boolean[] cx, boolean[] cy) {
        int ne = 0;
        for (boolean c : cx) if (!c) ne++;
        int[] xb = new int[ne + 1];
        int[] yb = new int[ne + 2];
        int[] xe = new int[ne + 1];
        xb[0] = -1;
        yb[0] = -1;
        int i = 0;
        int j = 0;
        for (int p = 0; p < ne; p++) {
            while (cx[i]) i++;
            while (cy[j]) j++;
            xb[p + 1] = i;
            yb[p + 1] = j;
            xe[p] = i;
            i++;
            j++;
        }
        yb[ne + 1] = cy.length;
        xe[ne] = cx.length;
        int g = ne;
        while (g >= 1) {
            int x0 = xb[g] + 1;
            int x1 = xe[g];
            if (x1 > x0 && yb[g + 1] - yb[g] == 1) {
                int h = g;
                int top = x0;
                int last = x1 - 1;
                while (h >= 1 && xb[h] == top - 1 && x[top - 1] == x[last]) {
                    h--;
                    top--;
                    last--;
                    if (yb[h + 1] - yb[h] > 1) {
                        for (int k = top; k < x0; k++) cx[k] = true;
                        for (int k = last + 1; k < x1; k++) cx[k] = false;
                        g = h;
                        break;
                    }
                    if (h >= 1 && xe[h] - xb[h] > 1) break;
                }
            }
            g--;
        }
    }

    private static List<LineOp> ops(List<Line> a, List<Line> b) {
        if ((long) a.size() + b.size() > MAX_LINES) throw new IllegalArgumentException("diff input too large (more than 1,000,000 lines)");
        Map<Line, Integer> ids = new HashMap<>();
        int[] ia = new int[a.size()];
        int[] ib = new int[b.size()];
        for (int i = 0; i < ia.length; i++) ia[i] = ids.computeIfAbsent(a.get(i), k -> ids.size());
        for (int j = 0; j < ib.length; j++) ib[j] = ids.computeIfAbsent(b.get(j), k -> ids.size());
        boolean[] inA = new boolean[ids.size()];
        boolean[] inB = new boolean[ids.size()];
        for (int v : ia) inA[v] = true;
        for (int v : ib) inB[v] = true;
        boolean[] ca = new boolean[ia.length];
        boolean[] cb = new boolean[ib.length];
        // A line that never occurs in the other file is in no common subsequence: mark it changed and
        // run Myers only on the remaining lines (the result stays minimal).
        int[] ka = keep(ia, inB, ca);
        int[] kb = keep(ib, inA, cb);
        int[] fa = new int[ka.length];
        int[] fb = new int[kb.length];
        for (int k = 0; k < ka.length; k++) fa[k] = ia[ka[k]];
        for (int k = 0; k < kb.length; k++) fb[k] = ib[kb[k]];
        boolean[] sa = new boolean[fa.length];
        boolean[] sb = new boolean[fb.length];
        compare(fa, fb, 0, fa.length, 0, fb.length, sa, sb);
        for (int k = 0; k < ka.length; k++) ca[ka[k]] = sa[k];
        for (int k = 0; k < kb.length; k++) cb[kb[k]] = sb[k];
        slide(ia, ca);
        slide(ib, cb);
        align(ia, ca, cb);
        align(ib, cb, ca);
        List<LineOp> out = new ArrayList<>();
        int i = 0;
        int j = 0;
        while (i < ia.length || j < ib.length) {
            if (i < ia.length && ca[i]) out.add(new LineOp("-", a.get(i++)));
            else if (j < ib.length && cb[j]) out.add(new LineOp("+", b.get(j++)));
            else { out.add(new LineOp("=", a.get(i))); i++; j++; }
        }
        return out;
    }

    private static int[] keep(int[] lines, boolean[] inOther, boolean[] changed) {
        int count = 0;
        for (int i = 0; i < lines.length; i++) { changed[i] = !inOther[lines[i]]; if (!changed[i]) count++; }
        int[] out = new int[count];
        int c = 0;
        for (int i = 0; i < lines.length; i++) if (!changed[i]) out[c++] = i;
        return out;
    }

    /** Line operations turning a into b; throws IllegalArgumentException above 1,000,000 lines in total. */
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
        int aBefore = 0;
        int bBefore = 0;
        int counted = 0;
        for (int[] h : hunks) {
            int s = Math.max(0, h[0] - context);
            int e = Math.min(rows.size() - 1, h[1] + context);
            for (; counted < s; counted++) {
                String kind = rows.get(counted).kind();
                if (!kind.equals("+")) aBefore++;
                if (!kind.equals("-")) bBefore++;
            }
            List<LineOp> seg = rows.subList(s, e + 1);
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
