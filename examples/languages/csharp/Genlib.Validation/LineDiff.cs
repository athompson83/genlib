// SPDX-License-Identifier: Apache-2.0
using System.Text;

namespace Genlib.Validation;

/// <summary>One diff operation: Op is "=" (unchanged), "-" (removed from a) or "+" (added in b).</summary>
public sealed record DiffOp(string Op, string Line);

/// <summary>
/// Deterministic LCS line diff and unified output: a valid unified diff (patch reproduces the new text); same format as
/// GNU <c>diff -u</c>, which may pick a different alignment of equal size.
/// </summary>
public static class LineDiff {
    /// <summary>Maximum lines(a) * lines(b) the LCS table may hold.</summary>
    public const long MaxCells = 4_000_000;

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

    /// <summary>Line-level diff of two texts split on "\n". Throws <see cref="ArgumentException"/> above <see cref="MaxCells"/>.</summary>
    public static List<DiffOp> DiffLines(string a, string b) =>
        Ops(SplitLines(a), SplitLines(b)).Select(o => new DiffOp(o.Op.ToString(), o.Line.Text)).ToList();

    private static List<(char Op, Line Line)> Ops(Line[] a, Line[] b) {
        int n = a.Length, m = b.Length;
        if ((long)n * m > MaxCells) throw new ArgumentException("inputs too large to diff");
        var l = new int[n + 1, m + 1];
        for (int i = n - 1; i >= 0; i--)
            for (int j = m - 1; j >= 0; j--)
                l[i, j] = a[i] == b[j] ? l[i + 1, j + 1] + 1 : Math.Max(l[i + 1, j], l[i, j + 1]);
        var ops = new List<(char, Line)>();
        int x = 0, y = 0;
        while (x < n || y < m) {
            if (x < n && y < m && a[x] == b[y]) { ops.Add(('=', a[x])); x++; y++; }
            else if (y >= m || (x < n && l[x + 1, y] >= l[x, y + 1])) { ops.Add(('-', a[x])); x++; }
            else { ops.Add(('+', b[y])); y++; }
        }
        return ops;
    }

    private readonly record struct Row(char Op, Line Line, int A, int B);

    /// <summary>
    /// Unified diff with <paramref name="context"/> lines around each change, "" when the texts are equal. Hunks whose changes are
    /// separated by at most 2*context unchanged lines merge; a missing final newline is marked "\ No newline at end of file".
    /// </summary>
    public static string UnifiedDiff(string a, string b, string fromName = "a", string toName = "b", int context = 3) {
        if (context < 0) throw new ArgumentOutOfRangeException(nameof(context));
        var rows = new List<Row>();
        int ai = 0, bi = 0;
        foreach (var (op, line) in Ops(SplitLines(a), SplitLines(b))) {
            if (op == '=') rows.Add(new Row('=', line, ai++, bi++));
            else if (op == '-') rows.Add(new Row('-', line, ai++, -1));
            else rows.Add(new Row('+', line, -1, bi++));
        }
        var changes = Enumerable.Range(0, rows.Count).Where(k => rows[k].Op != '=').ToList();
        if (changes.Count == 0) return "";
        var hunks = new List<(int Start, int End)>();
        int start = changes[0], end = changes[0];
        foreach (int k in changes.Skip(1)) {
            if (k - end - 1 <= 2 * context) end = k;
            else { hunks.Add((start, end)); start = end = k; }
        }
        hunks.Add((start, end));
        var sb = new StringBuilder().Append("--- ").Append(fromName).Append('\n').Append("+++ ").Append(toName).Append('\n');
        foreach (var (hs, he) in hunks) {
            int s = Math.Max(0, hs - context), e = Math.Min(rows.Count - 1, he + context);
            var seg = rows.GetRange(s, e - s + 1);
            int aBefore = rows.Take(s).Count(r => r.Op != '+'), bBefore = rows.Take(s).Count(r => r.Op != '-');
            var aRows = seg.Where(r => r.Op != '+').ToList();
            var bRows = seg.Where(r => r.Op != '-').ToList();
            sb.Append("@@ -").Append(Range(aRows.Count, aRows.Count > 0 ? aRows[0].A : 0, aBefore))
              .Append(" +").Append(Range(bRows.Count, bRows.Count > 0 ? bRows[0].B : 0, bBefore)).Append(" @@\n");
            foreach (var r in seg) {
                sb.Append(r.Op == '=' ? ' ' : r.Op).Append(r.Line.Text).Append('\n');
                if (r.Line.NoEol) sb.Append("\\ No newline at end of file\n");
            }
        }
        return sb.ToString();
    }

    private static string Range(int count, int firstIndex, int before) =>
        count == 0 ? before + ",0" : count == 1 ? (firstIndex + 1).ToString() : (firstIndex + 1) + "," + count;
}
