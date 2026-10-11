// SPDX-License-Identifier: Apache-2.0
using System.Text;

namespace Genlib.Validation;

/// <summary>
/// GitHub-flavored Markdown table rendering. Cells escape '\' and '|' and turn line breaks into &lt;br&gt;; column width is the
/// longest escaped cell in code points (at least 3). Alignment per column is "left", "right", "center" or null (no colon).
/// Bad headers, row widths or alignments throw <see cref="ArgumentException"/>.
/// </summary>
public static class MarkdownTable {
    private static string Escape(string c) =>
        c.Replace("\\", "\\\\").Replace("|", "\\|").Replace("\r\n", "<br>").Replace("\r", "<br>").Replace("\n", "<br>");

    private static int Len(string s) => s.EnumerateRunes().Count();

    /// <summary>Renders the table as lines joined with \n (no trailing newline); <paramref name="align"/> defaults to no alignment.</summary>
    public static string Render(IReadOnlyList<string> headers, IReadOnlyList<IReadOnlyList<string>> rows, IReadOnlyList<string?>? align = null) {
        ArgumentNullException.ThrowIfNull(headers);
        ArgumentNullException.ThrowIfNull(rows);
        if (headers.Count == 0) throw new ArgumentException("headers");
        int n = headers.Count;
        var al = align ?? new string?[n];
        if (al.Count != n || al.Any(a => a is not (null or "left" or "right" or "center"))) throw new ArgumentException("align");
        if (rows.Any(r => r.Count != n)) throw new ArgumentException("row width");
        var cells = new List<string[]> { headers.Select(Escape).ToArray() };
        cells.AddRange(rows.Select(r => r.Select(Escape).ToArray()));
        var widths = Enumerable.Range(0, n).Select(i => Math.Max(3, cells.Max(r => Len(r[i])))).ToArray();
        string Pad(string s, int w, string? a) {
            int gap = w - Len(s);
            return a switch {
                "right" => new string(' ', gap) + s,
                "center" => new string(' ', gap / 2) + s + new string(' ', gap - gap / 2),
                _ => s + new string(' ', gap),
            };
        }
        static string Sep(int w, string? a) {
            var d = new string('-', w).ToCharArray();
            if (a is "left" or "center") d[0] = ':';
            if (a is "right" or "center") d[^1] = ':';
            return new string(d);
        }
        static string Line(IEnumerable<string> cs) => "| " + string.Join(" | ", cs) + " |";
        var output = new StringBuilder();
        output.Append(Line(cells[0].Select((c, i) => Pad(c, widths[i], al[i]))));
        output.Append('\n').Append(Line(Enumerable.Range(0, n).Select(i => Sep(widths[i], al[i]))));
        foreach (var r in cells.Skip(1)) output.Append('\n').Append(Line(r.Select((c, i) => Pad(c, widths[i], al[i]))));
        return output.ToString();
    }
}
