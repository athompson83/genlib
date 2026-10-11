// SPDX-License-Identifier: Apache-2.0
using System.Text;

namespace Genlib.Validation;

/// <summary>
/// Roman numerals 1..3999 in standard subtractive form. Parsing is case-insensitive and accepts only the canonical form
/// (a string is valid exactly when <see cref="ToRoman"/> of its value equals it upper-cased), so 'IIII', 'IC' and '' are rejected.
/// </summary>
public static class RomanNumerals {
    private static readonly (int Value, string Symbol)[] Parts = {
        (1000, "M"), (900, "CM"), (500, "D"), (400, "CD"), (100, "C"), (90, "XC"), (50, "L"), (40, "XL"),
        (10, "X"), (9, "IX"), (5, "V"), (4, "IV"), (1, "I"),
    };

    /// <summary>Formats 1..3999 as a Roman numeral; throws ArgumentOutOfRangeException otherwise.</summary>
    public static string ToRoman(int n) {
        if (n < 1 || n > 3999) throw new ArgumentOutOfRangeException(nameof(n), "out of range");
        var sb = new StringBuilder();
        foreach (var (v, s) in Parts) while (n >= v) { sb.Append(s); n -= v; }
        return sb.ToString();
    }

    /// <summary>Parses a canonical Roman numeral (any case) to 1..3999; throws FormatException otherwise.</summary>
    public static int FromRoman(string s) {
        ArgumentNullException.ThrowIfNull(s);
        string u = s.ToUpperInvariant();
        if (u.Length == 0) throw new FormatException("not a roman numeral");
        long total = 0;
        for (int i = 0; i < u.Length; i++) {
            int v = Value(u[i]);
            if (v == 0) throw new FormatException("not a roman numeral");
            int next = i + 1 < u.Length ? Value(u[i + 1]) : 0;
            total += next > v ? -v : v;
        }
        if (total < 1 || total > 3999 || ToRoman((int)total) != u) throw new FormatException("not a canonical roman numeral");
        return (int)total;
    }

    private static int Value(char c) => c switch {
        'I' => 1, 'V' => 5, 'X' => 10, 'L' => 50, 'C' => 100, 'D' => 500, 'M' => 1000, _ => 0,
    };
}
