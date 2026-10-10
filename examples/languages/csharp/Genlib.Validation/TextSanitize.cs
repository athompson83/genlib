// SPDX-License-Identifier: Apache-2.0
using System.Text;
using System.Text.RegularExpressions;

namespace Genlib.Validation;

/// <summary>
/// Untrusted-text cleanup: control, bidirectional (Trojan Source, CVE-2021-42574) and invisible characters. U+200C/U+200D are
/// kept because emoji sequences and Indic/Persian text need them. This is not HTML escaping; escape for the output context too.
/// </summary>
public static class TextSanitize {
    private static readonly HashSet<int> Bidi = new() { 0x061C, 0x200E, 0x200F, 0x202A, 0x202B, 0x202C, 0x202D, 0x202E, 0x2066, 0x2067, 0x2068, 0x2069 };
    private static readonly HashSet<int> Invisible = new() { 0x200B, 0x2060, 0xFEFF };
    private static readonly Regex Whitespace = new(@"[ \t\n\r\f\v]+", RegexOptions.CultureInvariant);

    /// <summary>Normalizes CRLF/CR to LF (or a space when <paramref name="allowNewlines"/> is false), keeps TAB, removes other C0,
    /// DEL, C1, bidi controls and U+200B/U+2060/U+FEFF, then truncates to <paramref name="maxLength"/> code points.</summary>
    public static string SanitizeText(string text, bool allowNewlines = true, int? maxLength = null) {
        if (maxLength is < 0) throw new ArgumentOutOfRangeException(nameof(maxLength));
        string t = text.Replace("\r\n", "\n").Replace('\r', '\n');
        var sb = new StringBuilder(t.Length);
        int count = 0;
        for (int i = 0; i < t.Length; i++) {
            if (maxLength is int max && count >= max) break;
            char ch = t[i];
            if (char.IsHighSurrogate(ch) && i + 1 < t.Length && char.IsLowSurrogate(t[i + 1])) {
                sb.Append(ch).Append(t[i + 1]); i++; count++; continue;
            }
            if (ch == '\n') sb.Append(allowNewlines ? '\n' : ' ');
            else if (ch == '\t') sb.Append('\t');
            else if (ch < 0x20 || (ch >= 0x7F && ch <= 0x9F) || Bidi.Contains(ch) || Invisible.Contains(ch)) continue;
            else sb.Append(ch);
            count++;
        }
        return sb.ToString();
    }

    /// <summary>Lists bidirectional control characters as (code point index, uppercase hex) pairs, e.g. (24, "202E").</summary>
    public static List<(int Index, string Hex)> FindBidiControls(string text) {
        var found = new List<(int, string)>();
        int index = 0;
        for (int i = 0; i < text.Length; i++, index++) {
            if (char.IsHighSurrogate(text[i]) && i + 1 < text.Length && char.IsLowSurrogate(text[i + 1])) { i++; continue; }
            if (Bidi.Contains(text[i])) found.Add((index, ((int)text[i]).ToString("X4")));
        }
        return found;
    }

    /// <summary>Collapses runs of space, tab, LF, CR, FF and VT into one space and trims spaces at both ends.</summary>
    public static string NormalizeWhitespace(string text) => Whitespace.Replace(text, " ").Trim(' ');
}
