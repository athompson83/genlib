// SPDX-License-Identifier: Apache-2.0
namespace Genlib.Validation;

/// <summary>
/// Plain-text wrapping and truncation counted in code points. Wrapping keeps input line breaks (CRLF and CR become LF), fills
/// lines greedily with single spaces, breaks over-long words into width-sized chunks and leaves no trailing spaces. Bad widths
/// or lengths throw <see cref="ArgumentException"/>.
/// </summary>
public static class TextWrap {
    private static List<string> CodePoints(string s) => s.EnumerateRunes().Select(r => r.ToString()).ToList();

    /// <summary>Wraps <paramref name="text"/> to lines of at most <paramref name="width"/> code points (width &gt;= 1), joined with \n.</summary>
    public static string WrapText(string text, int width) {
        ArgumentNullException.ThrowIfNull(text);
        if (width < 1) throw new ArgumentException("width");
        var output = new List<string>();
        foreach (var line in text.Replace("\r\n", "\n").Replace('\r', '\n').Split('\n')) {
            var words = line.Split(new[] { ' ', '\t' }, StringSplitOptions.RemoveEmptyEntries);
            var cur = new List<string>();
            foreach (var word in words) {
                var w = CodePoints(word);
                while (w.Count > width) {
                    if (cur.Count > 0) { output.Add(string.Concat(cur)); cur = new List<string>(); }
                    output.Add(string.Concat(w.Take(width)));
                    w = w.Skip(width).ToList();
                }
                if (w.Count == 0) continue;
                if (cur.Count == 0) cur = w;
                else if (cur.Count + 1 + w.Count <= width) { cur.Add(" "); cur.AddRange(w); }
                else { output.Add(string.Concat(cur)); cur = w; }
            }
            output.Add(string.Concat(cur));
        }
        return string.Join("\n", output);
    }

    /// <summary>
    /// Returns <paramref name="text"/> unchanged when it fits in <paramref name="maxLen"/> code points; otherwise cuts it to leave
    /// room for <paramref name="ellipsis"/>, preferring the last space in the second half of the cut, and appends the ellipsis.
    /// </summary>
    public static string TruncateText(string text, int maxLen, string ellipsis = "…") {
        ArgumentNullException.ThrowIfNull(text);
        ArgumentNullException.ThrowIfNull(ellipsis);
        var cps = CodePoints(text);
        if (cps.Count <= maxLen) return text;
        int keep = maxLen - CodePoints(ellipsis).Count;
        if (maxLen < 1 || keep < 0) throw new ArgumentException("max_len");
        var cut = cps.Take(keep).ToList();
        int sp = cut.LastIndexOf(" ");
        if (sp >= keep / 2 && sp > 0) cut = cut.Take(sp).ToList();
        return string.Concat(cut).TrimEnd(' ') + ellipsis;
    }
}
