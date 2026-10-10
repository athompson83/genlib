// SPDX-License-Identifier: Apache-2.0
using System.Text;

namespace Genlib.Validation;

/// <summary>One diff operation: Op is "=" (unchanged), "-" (removed from a) or "+" (added in b).</summary>
public sealed record DiffOp(string Op, string Line);

/// <summary>
/// Line diff and unified output. The result is a valid unified diff (patch reproduces the new text) and minimal (a shortest
/// edit script). It usually equals GNU <c>diff -u</c> (about 95% of small random inputs) but that is not guaranteed.
/// Myers' linear-space O((N+M)·D) algorithm with O(N+M) memory; changes are then slid down and aligned with the other
/// file's changes. Inputs with more than <see cref="MaxLines"/> lines in total are rejected.
/// </summary>
public static class LineDiff {
    /// <summary>Maximum lines(a) + lines(b).</summary>
    public const int MaxLines = 1_000_000;

    // A line without its "\n"; NoEol marks the last line of a text that does not end in "\n", so it only equals another
    // last line without "\n" (otherwise patch could not reproduce the new text).
    private readonly record struct Line(string Text, bool NoEol);

    private static Line[] SplitLines(string text) {
        if (text.Length == 0) return Array.Empty<Line>();
        bool nl = text.EndsWith('\n');
        string[] parts = text.Split('\n');
        if (nl) parts = parts[..^1];
        var lines = new Line[parts.Length];
        for (int i = 0; i < parts.Length; i++) lines[i] = new Line(parts[i], !nl && i == parts.Length - 1);
        return lines;
    }

    /// <summary>Line-level diff of two texts split on "\n". Throws <see cref="ArgumentException"/> above <see cref="MaxLines"/>.</summary>
    public static List<DiffOp> DiffLines(string a, string b) =>
        Ops(SplitLines(a), SplitLines(b)).Select(o => new DiffOp(o.Op.ToString(), o.Line.Text)).ToList();

    // Middle snake (x, y, u, v) of the box a[a0..a1) x b[b0..b1) (Myers 1986, section 4b).
    private static (int, int, int, int) MiddleSnake(int[] a, int[] b, int a0, int a1, int b0, int b1) {
        int n = a1 - a0, m = b1 - b0, delta = n - m, off = n + m + 1;
        bool odd = (delta & 1) != 0;
        var vf = new int[2 * off + 1];
        var vb = new int[2 * off + 1];
        for (int d = 0; d <= (n + m + 1) / 2; d++) {
            for (int k = -d; k <= d; k += 2) {
                int x = k == -d || (k != d && vf[off + k - 1] < vf[off + k + 1]) ? vf[off + k + 1] : vf[off + k - 1] + 1;
                int y = x - k, sx = x, sy = y;
                while (x < n && y < m && a[a0 + x] == b[b0 + y]) { x++; y++; }
                vf[off + k] = x;
                if (odd && delta - (d - 1) <= k && k <= delta + (d - 1) && x + vb[off + delta - k] >= n)
                    return (a0 + sx, b0 + sy, a0 + x, b0 + y);
            }
            for (int k = -d; k <= d; k += 2) {
                int x = k == -d || (k != d && vb[off + k - 1] < vb[off + k + 1]) ? vb[off + k + 1] : vb[off + k - 1] + 1;
                int y = x - k, sx = x, sy = y;
                while (x < n && y < m && a[a1 - 1 - x] == b[b1 - 1 - y]) { x++; y++; }
                vb[off + k] = x;
                if (!odd && -d <= delta - k && delta - k <= d && x + vf[off + delta - k] >= n)
                    return (a1 - x, b1 - y, a1 - sx, b1 - sy);
            }
        }
        throw new InvalidOperationException("no middle snake");
    }

    private static void Compare(int[] a, int[] b, int a0, int a1, int b0, int b1, bool[] ca, bool[] cb) {
        while (a0 < a1 && b0 < b1 && a[a0] == b[b0]) { a0++; b0++; }
        while (a1 > a0 && b1 > b0 && a[a1 - 1] == b[b1 - 1]) { a1--; b1--; }
        if (a0 == a1) { for (int j = b0; j < b1; j++) cb[j] = true; return; }
        if (b0 == b1) { for (int i = a0; i < a1; i++) ca[i] = true; return; }
        var (x, y, u, v) = MiddleSnake(a, b, a0, a1, b0, b1);
        Compare(a, b, a0, x, b0, y, ca, cb);
        Compare(a, b, u, a1, v, b1, ca, cb);
    }

    // Move each run of changed lines down while the line after it equals its first line.
    private static void Slide(int[] lines, bool[] changed) {
        int i = 0, n = lines.Length;
        while (i < n) {
            if (!changed[i]) { i++; continue; }
            int j = i;
            while (j < n && changed[j]) j++;
            while (j < n && lines[i] == lines[j]) {
                changed[i] = false; changed[j] = true; i++; j++;
                while (j < n && changed[j]) j++;
            }
            i = j;
        }
    }

    // Equal line pairs (i, j) in order.
    private static List<(int, int)> Pairs(bool[] ca, bool[] cb) {
        var output = new List<(int, int)>();
        int i = 0, j = 0;
        while (i < ca.Length || j < cb.Length) {
            if (i < ca.Length && ca[i]) i++;
            else if (j < cb.Length && cb[j]) j++;
            else { output.Add((i, j)); i++; j++; }
        }
        return output;
    }

    // One bottom-up pass: slide a run of changed x lines up through equal lines when that places it next to changed lines
    // of the other file, so the hunk shows a replacement instead of a deletion and an insertion apart.
    private static void Align(int[] x, bool[] cx, bool[] cy, bool swap) {
        var e = swap ? Pairs(cy, cx).Select(p => (p.Item2, p.Item1)).ToList() : Pairs(cx, cy);
        int count = e.Count;
        var xb = new int[count + 1];
        var yb = new int[count + 2];
        var xe = new int[count + 1];
        xb[0] = -1; yb[0] = -1; yb[count + 1] = cy.Length; xe[count] = cx.Length;
        for (int p = 0; p < count; p++) { xb[p + 1] = e[p].Item1; yb[p + 1] = e[p].Item2; xe[p] = e[p].Item1; }
        int g = count;
        while (g >= 1) {
            int x0 = xb[g] + 1, x1 = xe[g];
            if (x1 > x0 && yb[g + 1] - yb[g] == 1) {
                int h = g, top = x0, last = x1 - 1;
                while (h >= 1 && xb[h] == top - 1 && x[top - 1] == x[last]) {
                    h--; top--; last--;
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

    private static List<(char Op, Line Line)> Ops(Line[] a, Line[] b) {
        if ((long)a.Length + b.Length > MaxLines) throw new ArgumentException("diff input too large (more than 1,000,000 lines)");
        // Lines become integer ids so comparisons are cheap; (text, NoEol) pairs decide equality.
        var ids = new Dictionary<Line, int>();
        int Id(Line l) { if (!ids.TryGetValue(l, out int v)) { v = ids.Count; ids[l] = v; } return v; }
        int[] ia = a.Select(Id).ToArray(), ib = b.Select(Id).ToArray();
        var inA = new bool[ids.Count];
        var inB = new bool[ids.Count];
        foreach (int v in ia) inA[v] = true;
        foreach (int v in ib) inB[v] = true;
        // A line that never occurs in the other file is in no common subsequence: mark it changed and run Myers only on the
        // remaining lines (the result stays minimal).
        var ca = new bool[a.Length];
        var cb = new bool[b.Length];
        var ka = new List<int>();
        var kb = new List<int>();
        for (int i = 0; i < ia.Length; i++) { ca[i] = !inB[ia[i]]; if (!ca[i]) ka.Add(i); }
        for (int j = 0; j < ib.Length; j++) { cb[j] = !inA[ib[j]]; if (!cb[j]) kb.Add(j); }
        int[] fa = ka.Select(i => ia[i]).ToArray(), fb = kb.Select(j => ib[j]).ToArray();
        var sa = new bool[fa.Length];
        var sb = new bool[fb.Length];
        Compare(fa, fb, 0, fa.Length, 0, fb.Length, sa, sb);
        for (int k = 0; k < ka.Count; k++) ca[ka[k]] = sa[k];
        for (int k = 0; k < kb.Count; k++) cb[kb[k]] = sb[k];
        Slide(ia, ca); Slide(ib, cb);
        Align(ia, ca, cb, false); Align(ib, cb, ca, true);
        var ops = new List<(char, Line)>(a.Length + b.Length);
        int x = 0, y = 0;
        while (x < a.Length || y < b.Length) {
            if (x < a.Length && ca[x]) ops.Add(('-', a[x++]));
            else if (y < b.Length && cb[y]) ops.Add(('+', b[y++]));
            else { ops.Add(('=', a[x++])); y++; }
        }
        return ops;
    }

    /// <summary>
    /// Unified diff with <paramref name="context"/> lines around each change, "" when the texts are equal. Hunks whose changes are
    /// separated by at most 2*context unchanged lines merge; a missing final newline is marked "\ No newline at end of file".
    /// </summary>
    public static string UnifiedDiff(string a, string b, string fromName = "a", string toName = "b", int context = 3) {
        if (context < 0) throw new ArgumentOutOfRangeException(nameof(context));
        var rows = Ops(SplitLines(a), SplitLines(b));
        var changes = new List<int>();
        for (int k = 0; k < rows.Count; k++) if (rows[k].Op != '=') changes.Add(k);
        if (changes.Count == 0) return "";
        var hunks = new List<(int Start, int End)>();
        int start = changes[0], end = changes[0];
        foreach (int k in changes.Skip(1)) {
            if (k - end - 1 <= 2 * context) end = k;
            else { hunks.Add((start, end)); start = end = k; }
        }
        hunks.Add((start, end));
        var sb = new StringBuilder().Append("--- ").Append(fromName).Append('\n').Append("+++ ").Append(toName).Append('\n');
        int scanned = 0, aBefore = 0, bBefore = 0;
        foreach (var (hs, he) in hunks) {
            int s = Math.Max(0, hs - context), e = Math.Min(rows.Count - 1, he + context);
            for (; scanned < s; scanned++) { if (rows[scanned].Op != '+') aBefore++; if (rows[scanned].Op != '-') bBefore++; }
            int aCount = 0, bCount = 0;
            for (int k = s; k <= e; k++) { if (rows[k].Op != '+') aCount++; if (rows[k].Op != '-') bCount++; }
            sb.Append("@@ -").Append(Range(aBefore, aCount)).Append(" +").Append(Range(bBefore, bCount)).Append(" @@\n");
            for (int k = s; k <= e; k++) {
                var (op, line) = rows[k];
                sb.Append(op == '=' ? ' ' : op).Append(line.Text).Append('\n');
                if (line.NoEol) sb.Append("\\ No newline at end of file\n");
            }
        }
        return sb.ToString();
    }

    private static string Range(int before, int count) =>
        count == 0 ? before + ",0" : count == 1 ? (before + 1).ToString() : (before + 1) + "," + count;
}
