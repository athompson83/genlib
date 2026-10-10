// SPDX-License-Identifier: Apache-2.0
using System.Text;

namespace Genlib.Validation;

/// <summary>
/// Natural sort ("file2" &lt; "file10"): runs of ASCII digits compare by numeric value (any length), other runs by ASCII
/// case-folded code points, with deterministic tie-breaks so the order is total. Strings compare by code point, not UTF-16 unit.
/// </summary>
public static class NaturalSort {
    private static List<(bool Digit, string Text)> Runs(string s) {
        var output = new List<(bool, string)>();
        int i = 0;
        while (i < s.Length) {
            int j = i;
            bool digit = s[i] is >= '0' and <= '9';
            while (j < s.Length && (s[j] is >= '0' and <= '9') == digit) j++;
            output.Add((digit, s[i..j]));
            i = j;
        }
        return output;
    }

    private static string Fold(string s) {
        var sb = new StringBuilder(s.Length);
        foreach (char c in s) sb.Append(c is >= 'A' and <= 'Z' ? (char)(c + 32) : c);
        return sb.ToString();
    }

    private static int Sign(int v) => v < 0 ? -1 : v > 0 ? 1 : 0;

    /// <summary>Compares two strings by Unicode code point (shorter prefix first).</summary>
    private static int CompareCodePoints(string a, string b) {
        var ea = a.EnumerateRunes().GetEnumerator();
        var eb = b.EnumerateRunes().GetEnumerator();
        while (true) {
            bool ha = ea.MoveNext(), hb = eb.MoveNext();
            if (!ha || !hb) return ha == hb ? 0 : ha ? 1 : -1;
            int c = ea.Current.Value.CompareTo(eb.Current.Value);
            if (c != 0) return Sign(c);
        }
    }

    /// <summary>
    /// -1, 0 or 1. Run by run: digit runs by value, a digit run before a text run, text by ASCII case-folded code points. Ties:
    /// fewer runs first, then fewer leading zeros per digit run, then plain code point order of the whole strings.
    /// </summary>
    public static int Compare(string a, string b) {
        ArgumentNullException.ThrowIfNull(a);
        ArgumentNullException.ThrowIfNull(b);
        var ra = Runs(a);
        var rb = Runs(b);
        int n = Math.Min(ra.Count, rb.Count);
        for (int i = 0; i < n; i++) {
            var (da, xa) = ra[i];
            var (db, xb) = rb[i];
            int c;
            if (da && db) {
                string na = xa.TrimStart('0'), nb = xb.TrimStart('0');
                if (na.Length == 0) na = "0";
                if (nb.Length == 0) nb = "0";
                c = na.Length != nb.Length ? Sign(na.Length - nb.Length) : Sign(string.CompareOrdinal(na, nb));
            } else if (da != db) c = da ? -1 : 1;
            else c = CompareCodePoints(Fold(xa), Fold(xb));
            if (c != 0) return c;
        }
        if (ra.Count != rb.Count) return ra.Count < rb.Count ? -1 : 1;
        for (int i = 0; i < n; i++) {
            if (ra[i].Digit && rb[i].Digit && ra[i].Text.Length != rb[i].Text.Length) return ra[i].Text.Length < rb[i].Text.Length ? -1 : 1;
        }
        return CompareCodePoints(a, b);
    }

    /// <summary>A new list sorted in natural order.</summary>
    public static List<string> Sort(IEnumerable<string> items) {
        ArgumentNullException.ThrowIfNull(items);
        var list = items.ToList();
        list.Sort(Compare);
        return list;
    }
}
